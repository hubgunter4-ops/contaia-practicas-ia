create extension if not exists pgtap with schema extensions;

begin;

select extensions.plan(14);

select extensions.has_table('public', 'cfdi_analysis_runs', 'la tabla de historial existe');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.cfdi_analysis_runs'::regclass),
  'RLS está habilitado para el historial CFDI'
);
select extensions.ok(
  has_table_privilege('authenticated', 'public.cfdi_analysis_runs', 'SELECT')
  and has_table_privilege('authenticated', 'public.cfdi_analysis_runs', 'INSERT')
  and has_table_privilege('authenticated', 'public.cfdi_analysis_runs', 'DELETE'),
  'authenticated conserva SELECT, INSERT y DELETE'
);
select extensions.ok(
  not has_table_privilege('anon', 'public.cfdi_analysis_runs', 'SELECT')
  and not has_table_privilege('anon', 'public.cfdi_analysis_runs', 'INSERT')
  and not has_table_privilege('anon', 'public.cfdi_analysis_runs', 'DELETE'),
  'anon no tiene permisos sobre el historial privado'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.cfdi_analysis_runs', 'UPDATE'),
  'UPDATE permanece revocado para preservar la inmutabilidad del historial'
);

-- Usuarios sintéticos dentro de la transacción de prueba; ROLLBACK los elimina.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'contaia-rls-a@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'contaia-rls-b@example.test', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  )
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);

select extensions.lives_ok(
  $$
    insert into public.cfdi_analysis_runs (id, title, analysis_data)
    values (
      'c0000000-0000-4000-8000-000000000003',
      'RLS local test',
      '{"fixture":true}'::jsonb
    )
  $$,
  'la cuenta A inserta una fila y el default asigna auth.uid()'
);
select extensions."is"(
  (select user_id::text from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003'),
  'a0000000-0000-4000-8000-000000000001',
  'la fila insertada queda asociada al usuario A'
);
select extensions."is"(
  (select count(*) from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003'),
  1::bigint,
  'la cuenta A puede leer su fila'
);
select extensions.throws_ok(
  $$
    insert into public.cfdi_analysis_runs (id, user_id, title, analysis_data)
    values (
      'd0000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000002',
      'owner spoof test',
      '{"fixture":true}'::jsonb
    )
  $$,
  '42501', null,
  'la cuenta A no puede insertar una fila a nombre de B'
);

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select extensions."is"(
  (select count(*) from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003'),
  0::bigint,
  'la cuenta B no puede leer la fila de A'
);
select extensions."is"(
  (
    with deleted as (
      delete from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003' returning id
    ) select count(*) from deleted
  ),
  0::bigint,
  'la cuenta B no puede borrar la fila de A'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select extensions.throws_ok(
  $$
    update public.cfdi_analysis_runs
    set title = 'modificación no permitida'
    where id = 'c0000000-0000-4000-8000-000000000003'
  $$,
  '42501', null,
  'el propietario tampoco puede modificar registros históricos'
);
select extensions."is"(
  (
    with deleted as (
      delete from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003' returning id
    ) select count(*) from deleted
  ),
  1::bigint,
  'la cuenta A puede borrar su propia fila'
);
select extensions."is"(
  (select count(*) from public.cfdi_analysis_runs where id = 'c0000000-0000-4000-8000-000000000003'),
  0::bigint,
  'la fila sintética queda eliminada al final de la prueba'
);

select * from extensions.finish();
rollback;

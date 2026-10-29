-- Database-level RLS/resolver checks for the local external-identity migration.
-- JWT claims below are synthetic; this does NOT validate real Firebase signatures
-- or Supabase third-party JWT acceptance. Run only against an isolated local DB.
create extension if not exists pgtap with schema extensions;

begin;
select extensions.plan(29);

select extensions.has_table('private', 'app_users', 'internal user registry exists');
select extensions.has_table('private', 'external_auth_identities', 'external identity map exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'private.app_users'::regclass),
  'app_users has row-level security enabled'
);
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'private.external_auth_identities'::regclass),
  'external identity map has row-level security enabled'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'private.external_auth_identities', 'select'),
  'authenticated cannot directly read external identity mappings'
);
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.provision_external_auth_identity(text,text,text,text,boolean)',
    'execute'
  ),
  'authenticated cannot call the provisioning RPC'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.provision_external_auth_identity(text,text,text,text,boolean)',
    'execute'
  ),
  'service_role can call the provisioning RPC'
);

insert into private.app_users (id, email, email_verified)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'rls-a@example.test', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'rls-b@example.test', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'rls-c@example.test', true);
insert into private.external_auth_identities (issuer, audience, subject, app_user_id)
values
  ('https://securetoken.google.com/contaia-rls-test', 'contaia-rls-test', 'firebase-user-a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('https://securetoken.google.com/contaia-rls-test', 'contaia-rls-test', 'firebase-user-b', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),
  ('https://securetoken.google.com/contaia-rls-test', 'contaia-rls-test', 'firebase-user-c', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3');

insert into public.fiscal_profiles (id, owner_id, legal_name, rfc)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Cuenta A', 'AAA010101AAA'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Cuenta C', 'CCC010101CCC');
insert into public.fiscal_profile_members (profile_id, user_id, role)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'viewer');
insert into public.tool_connections (profile_id, tool_key, created_by)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cfdi', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
insert into public.fiscal_alerts (profile_id, tool_key, title)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cfdi', 'Alerta RLS de prueba');
insert into public.fiscal_deadlines (profile_id, tool_key, title, due_at)
values ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'cfdi', 'Vencimiento RLS de prueba', now());

-- Legacy Supabase Auth account; its internal UUID must remain unchanged.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'legacy-rls@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://securetoken.google.com/contaia-rls-test',
  'aud', 'contaia-rls-test', 'sub', 'firebase-user-a', 'role', 'authenticated'
)::text, true);
select extensions.is(
  private.current_app_user_id()::text,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'mapped Firebase tuple resolves to the internal ContaIA UUID'
);
select extensions.lives_ok(
  $$insert into public.learning_progress (progress_data) values ('{"source":"rls-test"}'::jsonb)$$,
  'Firebase identity can insert its own progress using the internal UUID default'
);
select extensions.is(
  (select count(*)::integer from public.learning_progress where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  1,
  'Firebase identity can read its own progress row'
);
select extensions.lives_ok(
  $$insert into public.fiscal_profiles (legal_name, rfc)
    values ('ContaIA RLS default owner', 'AAB010102AAA')$$,
  'Firebase identity can create an owned fiscal profile through the internal UUID default'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_profiles
    where owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      and legal_name = 'ContaIA RLS default owner'),
  1,
  'new fiscal profile is owned by the mapped internal user'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  1,
  'profile owner can read its own fiscal profile'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'),
  0,
  'profile owner cannot read an unrelated fiscal profile'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://securetoken.google.com/contaia-rls-test',
  'aud', 'contaia-rls-test', 'sub', 'firebase-user-b', 'role', 'authenticated'
)::text, true);
select extensions.is(
  (select count(*)::integer from public.fiscal_profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  1,
  'authorized fiscal-profile member can read the shared profile'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_profiles
    where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'),
  0,
  'member cannot read an unrelated tenant profile'
);
select extensions.is(
  (select count(*)::integer from public.tool_connections
    where profile_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  1,
  'profile member can read its tool connection'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_alerts
    where profile_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  1,
  'profile member can read its fiscal alert'
);
select extensions.is(
  (select count(*)::integer from public.fiscal_deadlines
    where profile_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
  1,
  'profile member can read its fiscal deadline'
);
select extensions.lives_ok(
  $$update public.tool_connections set status = 'connected'
    where profile_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'$$,
  'profile member can perform the operations allowed by the tool-connection policy'
);
with changed as (
  update public.fiscal_profiles set phone = '5550000000'
   where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1' returning 1
)
select extensions.is(
  (select count(*)::integer from changed),
  0,
  'a member who is not the owner cannot update the fiscal profile'
);
select extensions.is(
  (select count(*)::integer from public.learning_progress
    where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  0,
  'a different mapped identity cannot read the first identity progress row'
);
with changed as (
  update public.learning_progress set progress_data = '{"source":"cross-user"}'::jsonb
   where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' returning 1
)
select extensions.is(
  (select count(*)::integer from changed),
  0,
  'a different mapped identity cannot update the first identity progress row'
);
select extensions.throws_ok(
  $$insert into public.learning_progress (user_id, progress_data)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '{}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "learning_progress"',
  'a mapped identity cannot spoof another owner on insert'
);

select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://securetoken.google.com/contaia-rls-test',
  'aud', 'contaia-rls-test', 'sub', 'not-provisioned', 'role', 'authenticated'
)::text, true);
select extensions.is(private.current_app_user_id()::text, null::text,
  'unmapped external subject resolves to NULL');
select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://securetoken.google.com/contaia-rls-test',
  'aud', 'different-project', 'sub', 'firebase-user-a', 'role', 'authenticated'
)::text, true);
select extensions.is(private.current_app_user_id()::text, null::text,
  'issuer/audience mismatch resolves to NULL');

select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'http://localhost:54321/auth/v1', 'aud', 'authenticated',
  'sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated'
)::text, true);
select extensions.is(private.current_app_user_id()::text,
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'legacy Supabase Auth subject keeps its existing internal UUID');
select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://untrusted.example/auth/v1', 'aud', 'authenticated',
  'sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'role', 'authenticated'
)::text, true);
select extensions.is(private.current_app_user_id()::text, null::text,
  'an untrusted issuer cannot reuse a Supabase UUID subject');
select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://securetoken.google.com/contaia-rls-test',
  'aud', 'contaia-rls-test', 'sub', 'firebase-user-a', 'role', 'anon'
)::text, true);
select extensions.is(private.current_app_user_id()::text, null::text,
  'a token without the authenticated role resolves to NULL');

reset role;
select * from extensions.finish();
rollback;

-- Internal identity registry for external OIDC/Firebase Auth tokens.
-- Existing Auth UUIDs are preserved. This local draft has NOT been applied to any service.

create schema if not exists private;

create table if not exists private.app_users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_length check (email is null or char_length(email) between 3 and 254)
);
comment on table private.app_users is
  'Stable ContaIA UUIDs for RLS and business-table foreign keys, independent of the authentication provider.';

create table if not exists private.external_auth_identities (
  issuer text not null,
  audience text not null,
  subject text not null,
  app_user_id uuid not null references private.app_users (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint external_auth_identities_pk primary key (issuer, audience, subject),
  constraint external_auth_identities_issuer_format check (
    issuer ~ '^https://securetoken[.]google[.]com/[a-z0-9-]+$'
  ),
  constraint external_auth_identities_audience_matches_issuer check (
    issuer = 'https://securetoken.google.com/' || audience
  ),
  constraint external_auth_identities_subject_length check (char_length(subject) between 1 and 128),
  constraint external_auth_identities_audience_length check (char_length(audience) between 1 and 128)
);
create index if not exists external_auth_identities_app_user_idx
  on private.external_auth_identities (app_user_id);
comment on table private.external_auth_identities is
  'Privileged map from a verified Firebase issuer/audience/subject tuple to one stable ContaIA UUID.';

create table if not exists private.supabase_auth_issuers (
  issuer text primary key,
  created_at timestamptz not null default now(),
  constraint supabase_auth_issuers_format check (
    issuer ~ '^https://[a-z0-9-]+[.]supabase[.]co/auth/v1$'
    or issuer in ('http://localhost:54321/auth/v1', 'http://127.0.0.1:54321/auth/v1')
  )
);
comment on table private.supabase_auth_issuers is
  'Explicit allowlist of ContaIA Supabase Auth JWT issuers accepted by the legacy UUID resolver.';

insert into private.supabase_auth_issuers (issuer)
values
  ('https://rjdhfajtttejskhuplzq.supabase.co/auth/v1'),
  ('https://bbkuhbsgvfrsfwkzzedy.supabase.co/auth/v1'),
  ('http://localhost:54321/auth/v1'),
  ('http://127.0.0.1:54321/auth/v1')
on conflict (issuer) do nothing;

-- Preserve existing IDs referenced by ContaIA data. No identity is inferred by email.
insert into private.app_users (id, email, email_verified, is_active, created_at, updated_at)
select users.id, users.email, users.email_confirmed_at is not null,
       users.deleted_at is null, coalesce(users.created_at, now()), coalesce(users.updated_at, now())
  from auth.users as users
on conflict (id) do nothing;

alter table private.app_users enable row level security;
alter table private.external_auth_identities enable row level security;
alter table private.supabase_auth_issuers enable row level security;
revoke all on table private.app_users, private.external_auth_identities, private.supabase_auth_issuers
  from public, anon, authenticated;
grant select, insert, update, delete on table private.app_users, private.external_auth_identities, private.supabase_auth_issuers
  to service_role;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  token_issuer text := nullif(token_claims ->> 'iss', '');
  token_audience text := nullif(token_claims ->> 'aud', '');
  token_subject text := nullif(token_claims ->> 'sub', '');
  resolved_user_id uuid;
begin
  if token_claims ->> 'role' is distinct from 'authenticated'
    or token_issuer is null or token_subject is null then
    return null;
  end if;

  -- Firebase subjects are strings, not guaranteed UUIDs. Resolve only an exact,
  -- pre-provisioned (issuer, audience, subject) tuple; never cast Firebase sub.
  if token_issuer like 'https://securetoken.google.com/%' then
    if token_audience is null
      or token_issuer <> ('https://securetoken.google.com/' || token_audience) then
      return null;
    end if;
    select identity.app_user_id into resolved_user_id
      from private.external_auth_identities as identity
      join private.app_users as app_user
        on app_user.id = identity.app_user_id and app_user.is_active
     where identity.issuer = token_issuer
       and identity.audience = token_audience
       and identity.subject = token_subject
       and identity.is_active
     limit 1;
    return resolved_user_id;
  end if;

  -- Keep existing Supabase Auth sessions only for explicitly allowed issuers,
  -- UUID subjects and active Auth accounts. All other issuers fail closed.
  if exists (select 1 from private.supabase_auth_issuers as trusted
              where trusted.issuer = token_issuer limit 1) then
    begin
      resolved_user_id := token_subject::uuid;
    exception when invalid_text_representation then
      return null;
    end;
    if resolved_user_id is null then return null; end if;

    select app_user.id into resolved_user_id
      from private.app_users as app_user
      join auth.users as auth_user on auth_user.id = app_user.id
     where app_user.id = resolved_user_id
       and app_user.is_active
       and auth_user.deleted_at is null
     limit 1;
    return resolved_user_id;
  end if;

  return null;
end;
$$;
revoke all on function private.current_app_user_id() from public, anon, authenticated;
grant execute on function private.current_app_user_id() to authenticated, service_role;
comment on function private.current_app_user_id() is
  'Resolves an allowed Supabase or mapped Firebase JWT to the stable internal UUID; unknown issuers and subjects return NULL.';

create or replace function private.sync_auth_user_to_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.app_users as existing_user
    (id, email, email_verified, is_active, created_at, updated_at)
  values
    (new.id, new.email, new.email_confirmed_at is not null, new.deleted_at is null,
     coalesce(new.created_at, now()), coalesce(new.updated_at, now()))
  on conflict (id) do update set
    email = case when exists (
      select 1 from private.external_auth_identities as identity
       where identity.app_user_id = excluded.id
    ) then existing_user.email else excluded.email end,
    email_verified = case when exists (
      select 1 from private.external_auth_identities as identity
       where identity.app_user_id = excluded.id
    ) then existing_user.email_verified else excluded.email_verified end,
    is_active = case when exists (
      select 1 from private.external_auth_identities as identity
       where identity.app_user_id = excluded.id
    ) then existing_user.is_active else excluded.is_active end,
    updated_at = greatest(existing_user.updated_at, excluded.updated_at);
  return new;
end;
$$;
revoke all on function private.sync_auth_user_to_app_user() from public, anon, authenticated;

drop trigger if exists contaia_app_users_after_auth_insert on auth.users;
create trigger contaia_app_users_after_auth_insert
  after insert on auth.users for each row
  execute function private.sync_auth_user_to_app_user();
drop trigger if exists contaia_app_users_after_auth_update on auth.users;
create trigger contaia_app_users_after_auth_update
  after update of email, email_confirmed_at, deleted_at on auth.users for each row
  execute function private.sync_auth_user_to_app_user();

create or replace function private.remove_app_user_after_auth_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Preserve the legacy cascade unless another provider remains linked.
  delete from private.app_users as app_user
   where app_user.id = old.id
     and not exists (select 1 from private.external_auth_identities as identity
                      where identity.app_user_id = app_user.id);
  return old;
end;
$$;
revoke all on function private.remove_app_user_after_auth_delete() from public, anon, authenticated;
drop trigger if exists contaia_app_users_after_auth_delete on auth.users;
create trigger contaia_app_users_after_auth_delete
  after delete on auth.users for each row
  execute function private.remove_app_user_after_auth_delete();

-- Only a trusted backend that verified the Firebase ID token with Firebase Admin
-- may invoke this RPC using a server-held service_role key. It does not verify JWT signatures.
create or replace function public.provision_external_auth_identity(
  p_issuer text,
  p_audience text,
  p_subject text,
  p_email text default null,
  p_email_verified boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_user_id uuid;
  existing_identity_active boolean;
  normalized_email text;
begin
  if p_issuer is null or p_audience is null
    or p_issuer <> ('https://securetoken.google.com/' || p_audience) then
    raise exception 'Proveedor externo o audience no válido.' using errcode = '22023';
  end if;
  if p_subject is null or char_length(p_subject) not between 1 and 128 then
    raise exception 'El subject externo no es válido.' using errcode = '22023';
  end if;
  if p_email is not null and char_length(btrim(p_email)) > 254 then
    raise exception 'El correo excede el límite permitido.' using errcode = '22023';
  end if;
  if coalesce(p_email_verified, false)
    and (p_email is null or position('@' in btrim(p_email)) < 2) then
    raise exception 'Un correo verificado debe tener un formato válido.' using errcode = '22023';
  end if;

  normalized_email := case when coalesce(p_email_verified, false) then lower(btrim(p_email)) else null end;
  perform pg_advisory_xact_lock(hashtextextended(p_issuer || chr(31) || p_audience || chr(31) || p_subject, 0));

  select identity.app_user_id, identity.is_active
    into resolved_user_id, existing_identity_active
    from private.external_auth_identities as identity
   where identity.issuer = p_issuer and identity.audience = p_audience and identity.subject = p_subject
   for update;

  if found then
    if not existing_identity_active
      or not exists (select 1 from private.app_users as app_user
                      where app_user.id = resolved_user_id and app_user.is_active) then
      raise exception 'La identidad externa está deshabilitada.' using errcode = '42501';
    end if;
    if normalized_email is not null then
      update private.app_users set email = normalized_email, email_verified = true, updated_at = now()
       where id = resolved_user_id;
    end if;
    return resolved_user_id;
  end if;

  -- Never associate a new provider identity to an existing user by email or a
  -- caller-supplied UUID. Account linking needs a separate proof-of-control flow.
  insert into private.app_users (email, email_verified)
  values (normalized_email, normalized_email is not null)
  returning id into resolved_user_id;

  insert into private.external_auth_identities (issuer, audience, subject, app_user_id)
  values (p_issuer, p_audience, p_subject, resolved_user_id);
  return resolved_user_id;
end;
$$;
revoke all on function public.provision_external_auth_identity(text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.provision_external_auth_identity(text, text, text, text, boolean)
  to service_role;
comment on function public.provision_external_auth_identity(text, text, text, text, boolean) is
  'Service-role-only provisioning after verified Firebase JWT validation; it never links a new identity to an existing user by email or supplied UUID.';

-- Abort on historical or imported orphans instead of inventing an owner or
-- attaching rows by email. The FK conversion below must preserve current owners.
do $$
declare
  orphan_count bigint;
begin
  if to_regclass('public.cfdi_analysis_runs') is not null then
    select count(*) into orphan_count
      from public.cfdi_analysis_runs as row_data
      left join private.app_users as app_user on app_user.id = row_data.user_id
     where app_user.id is null;
    if orphan_count > 0 then
      raise exception 'No se puede migrar cfdi_analysis_runs: % user_id sin app_users.', orphan_count
        using errcode = '23503';
    end if;
  end if;

  select count(*) into orphan_count from public.fiscal_profiles as row_data
    left join private.app_users as app_user on app_user.id = row_data.owner_id
   where app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar fiscal_profiles: % owner_id sin app_users.', orphan_count
      using errcode = '23503';
  end if;

  select count(*) into orphan_count from public.fiscal_profile_members as row_data
    left join private.app_users as app_user on app_user.id = row_data.user_id
   where app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar fiscal_profile_members: % user_id sin app_users.', orphan_count
      using errcode = '23503';
  end if;

  select count(*) into orphan_count from public.tool_connections as row_data
    left join private.app_users as app_user on app_user.id = row_data.created_by
   where app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar tool_connections: % created_by sin app_users.', orphan_count
      using errcode = '23503';
  end if;

  select count(*) into orphan_count from public.fiscal_alerts as row_data
    left join private.app_users as app_user on app_user.id = row_data.acknowledged_by
   where row_data.acknowledged_by is not null and app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar fiscal_alerts: % acknowledged_by sin app_users.', orphan_count
      using errcode = '23503';
  end if;

  select count(*) into orphan_count from public.user_login_names as row_data
    left join private.app_users as app_user on app_user.id = row_data.user_id
   where app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar user_login_names: % user_id sin app_users.', orphan_count
      using errcode = '23503';
  end if;

  select count(*) into orphan_count from public.learning_progress as row_data
    left join private.app_users as app_user on app_user.id = row_data.user_id
   where app_user.id is null;
  if orphan_count > 0 then
    raise exception 'No se puede migrar learning_progress: % user_id sin app_users.', orphan_count
      using errcode = '23503';
  end if;
end;
$$;

-- Move user ownership references while retaining every existing UUID value.
do $$
begin
  if to_regclass('public.cfdi_analysis_runs') is not null then
    alter table public.cfdi_analysis_runs alter column user_id set default private.current_app_user_id();
    alter table public.cfdi_analysis_runs drop constraint if exists cfdi_analysis_runs_user_id_fkey;
    alter table public.cfdi_analysis_runs drop constraint if exists cfdi_analysis_runs_user_id_app_users_fkey;
    alter table public.cfdi_analysis_runs add constraint cfdi_analysis_runs_user_id_app_users_fkey
      foreign key (user_id) references private.app_users (id) on delete cascade;
  end if;
end;
$$;

alter table public.fiscal_profiles alter column owner_id set default private.current_app_user_id();
alter table public.fiscal_profiles drop constraint if exists fiscal_profiles_owner_id_fkey;
alter table public.fiscal_profiles drop constraint if exists fiscal_profiles_owner_id_app_users_fkey;
alter table public.fiscal_profiles add constraint fiscal_profiles_owner_id_app_users_fkey
  foreign key (owner_id) references private.app_users (id) on delete cascade;

alter table public.fiscal_profile_members drop constraint if exists fiscal_profile_members_user_id_fkey;
alter table public.fiscal_profile_members drop constraint if exists fiscal_profile_members_user_id_app_users_fkey;
alter table public.fiscal_profile_members add constraint fiscal_profile_members_user_id_app_users_fkey
  foreign key (user_id) references private.app_users (id) on delete cascade;

alter table public.tool_connections alter column created_by set default private.current_app_user_id();
alter table public.tool_connections drop constraint if exists tool_connections_created_by_fkey;
alter table public.tool_connections drop constraint if exists tool_connections_created_by_app_users_fkey;
alter table public.tool_connections add constraint tool_connections_created_by_app_users_fkey
  foreign key (created_by) references private.app_users (id) on delete restrict;

alter table public.fiscal_alerts drop constraint if exists fiscal_alerts_acknowledged_by_fkey;
alter table public.fiscal_alerts drop constraint if exists fiscal_alerts_acknowledged_by_app_users_fkey;
alter table public.fiscal_alerts add constraint fiscal_alerts_acknowledged_by_app_users_fkey
  foreign key (acknowledged_by) references private.app_users (id) on delete set null;

alter table public.user_login_names drop constraint if exists user_login_names_user_id_fkey;
alter table public.user_login_names drop constraint if exists user_login_names_user_id_app_users_fkey;
alter table public.user_login_names add constraint user_login_names_user_id_app_users_fkey
  foreign key (user_id) references private.app_users (id) on delete cascade;

alter table public.learning_progress alter column user_id set default private.current_app_user_id();
alter table public.learning_progress drop constraint if exists learning_progress_user_id_fkey;
alter table public.learning_progress drop constraint if exists learning_progress_user_id_app_users_fkey;
alter table public.learning_progress add constraint learning_progress_user_id_app_users_fkey
  foreign key (user_id) references private.app_users (id) on delete cascade;

create or replace function private.is_fiscal_profile_member(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fiscal_profiles as profile
     where profile.id = profile_uuid
       and profile.owner_id = (select private.current_app_user_id())
  )
  or exists (
    select 1 from public.fiscal_profile_members as member
     where member.profile_id = profile_uuid
       and member.user_id = (select private.current_app_user_id())
  );
$$;
revoke all on function private.is_fiscal_profile_member(uuid) from public, anon, authenticated;
grant execute on function private.is_fiscal_profile_member(uuid) to authenticated;

-- Keep alias lookup server-only while sourcing the email from the internal user registry.
create or replace function private.resolve_login_email(login_identifier text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app_user.email
    from public.user_login_names as login_name
    join private.app_users as app_user on app_user.id = login_name.user_id
   where login_name.login_name = lower(trim(login_identifier))
     and app_user.is_active
     and app_user.email is not null
   limit 1;
$$;

-- Do not retain the prior client-callable alias-to-email RPC.
drop function if exists public.resolve_login_email(text);

-- Rebuild owner policies with one fail-closed, statement-stable internal UUID resolver.
do $$
begin
  if to_regclass('public.cfdi_analysis_runs') is not null then
    drop policy if exists cfdi_analysis_runs_select_own on public.cfdi_analysis_runs;
    drop policy if exists cfdi_analysis_runs_insert_own on public.cfdi_analysis_runs;
    drop policy if exists cfdi_analysis_runs_delete_own on public.cfdi_analysis_runs;
    create policy cfdi_analysis_runs_select_own on public.cfdi_analysis_runs
      for select to authenticated using ((select private.current_app_user_id()) = user_id);
    create policy cfdi_analysis_runs_insert_own on public.cfdi_analysis_runs
      for insert to authenticated with check ((select private.current_app_user_id()) = user_id);
    create policy cfdi_analysis_runs_delete_own on public.cfdi_analysis_runs
      for delete to authenticated using ((select private.current_app_user_id()) = user_id);
  end if;
end;
$$;

drop policy if exists fiscal_profiles_select_member on public.fiscal_profiles;
drop policy if exists fiscal_profiles_insert_owner on public.fiscal_profiles;
drop policy if exists fiscal_profiles_update_owner on public.fiscal_profiles;
create policy fiscal_profiles_select_member on public.fiscal_profiles
  for select to authenticated using (private.is_fiscal_profile_member(id));
create policy fiscal_profiles_insert_owner on public.fiscal_profiles
  for insert to authenticated with check ((select private.current_app_user_id()) = owner_id);
create policy fiscal_profiles_update_owner on public.fiscal_profiles
  for update to authenticated
  using ((select private.current_app_user_id()) = owner_id)
  with check ((select private.current_app_user_id()) = owner_id);

drop policy if exists fiscal_profile_members_select_member on public.fiscal_profile_members;
drop policy if exists fiscal_profile_members_insert_owner on public.fiscal_profile_members;
drop policy if exists fiscal_profile_members_update_owner on public.fiscal_profile_members;
drop policy if exists fiscal_profile_members_delete_owner on public.fiscal_profile_members;
create policy fiscal_profile_members_select_member on public.fiscal_profile_members
  for select to authenticated using (private.is_fiscal_profile_member(profile_id));
create policy fiscal_profile_members_insert_owner on public.fiscal_profile_members
  for insert to authenticated with check (exists (
    select 1 from public.fiscal_profiles as profile
     where profile.id = profile_id
       and profile.owner_id = (select private.current_app_user_id())
  ));
create policy fiscal_profile_members_update_owner on public.fiscal_profile_members
  for update to authenticated
  using (exists (
    select 1 from public.fiscal_profiles as profile
     where profile.id = profile_id
       and profile.owner_id = (select private.current_app_user_id())
  ))
  with check (exists (
    select 1 from public.fiscal_profiles as profile
     where profile.id = profile_id
       and profile.owner_id = (select private.current_app_user_id())
  ));
create policy fiscal_profile_members_delete_owner on public.fiscal_profile_members
  for delete to authenticated using (exists (
    select 1 from public.fiscal_profiles as profile
     where profile.id = profile_id
       and profile.owner_id = (select private.current_app_user_id())
  ));

drop policy if exists tool_connections_member on public.tool_connections;
create policy tool_connections_member on public.tool_connections
  for all to authenticated
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));

drop policy if exists fiscal_alerts_member on public.fiscal_alerts;
create policy fiscal_alerts_member on public.fiscal_alerts
  for all to authenticated
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));

drop policy if exists fiscal_deadlines_member on public.fiscal_deadlines;
create policy fiscal_deadlines_member on public.fiscal_deadlines
  for all to authenticated
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));

drop policy if exists user_login_names_select_owner on public.user_login_names;
drop policy if exists user_login_names_insert_owner on public.user_login_names;
drop policy if exists user_login_names_update_owner on public.user_login_names;
drop policy if exists user_login_names_delete_owner on public.user_login_names;
create policy user_login_names_select_owner on public.user_login_names
  for select to authenticated using ((select private.current_app_user_id()) = user_id);
create policy user_login_names_insert_owner on public.user_login_names
  for insert to authenticated with check ((select private.current_app_user_id()) = user_id);
create policy user_login_names_update_owner on public.user_login_names
  for update to authenticated
  using ((select private.current_app_user_id()) = user_id)
  with check ((select private.current_app_user_id()) = user_id);
create policy user_login_names_delete_owner on public.user_login_names
  for delete to authenticated using ((select private.current_app_user_id()) = user_id);

drop policy if exists learning_progress_select_own on public.learning_progress;
drop policy if exists learning_progress_insert_own on public.learning_progress;
drop policy if exists learning_progress_update_own on public.learning_progress;
drop policy if exists learning_progress_delete_own on public.learning_progress;
create policy learning_progress_select_own on public.learning_progress
  for select to authenticated using ((select private.current_app_user_id()) = user_id);
create policy learning_progress_insert_own on public.learning_progress
  for insert to authenticated with check ((select private.current_app_user_id()) = user_id);
create policy learning_progress_update_own on public.learning_progress
  for update to authenticated
  using ((select private.current_app_user_id()) = user_id)
  with check ((select private.current_app_user_id()) = user_id);
create policy learning_progress_delete_own on public.learning_progress
  for delete to authenticated using ((select private.current_app_user_id()) = user_id);

comment on constraint fiscal_profiles_owner_id_app_users_fkey on public.fiscal_profiles is
  'Owner identity is an internal ContaIA UUID, not an authentication-provider subject.';
comment on constraint learning_progress_user_id_app_users_fkey on public.learning_progress is
  'User identity is resolved from the verified JWT to a stable internal ContaIA UUID.';

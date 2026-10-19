create schema if not exists private;

create or replace function private.is_fiscal_profile_member(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.fiscal_profiles profile
    where profile.id = profile_uuid
      and profile.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.fiscal_profile_members member
    where member.profile_id = profile_uuid
      and member.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_fiscal_profile_member(uuid) from public, anon, authenticated;
grant execute on function private.is_fiscal_profile_member(uuid) to authenticated;

alter policy fiscal_profiles_select_member on public.fiscal_profiles
  using (private.is_fiscal_profile_member(id));
alter policy fiscal_profile_members_select_member on public.fiscal_profile_members
  using (private.is_fiscal_profile_member(profile_id));
alter policy tool_connections_member on public.tool_connections
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));
alter policy fiscal_alerts_member on public.fiscal_alerts
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));
alter policy fiscal_deadlines_member on public.fiscal_deadlines
  using (private.is_fiscal_profile_member(profile_id))
  with check (private.is_fiscal_profile_member(profile_id));

drop function if exists public.is_fiscal_profile_member(uuid);

create or replace function private.resolve_login_email(login_identifier text)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
  select u.email
  from public.user_login_names n
  join auth.users u on u.id = n.user_id
  where n.login_name = lower(trim(login_identifier))
    and u.deleted_at is null
  limit 1;
$$;
revoke all on function private.resolve_login_email(text) from public, anon, authenticated;

drop function if exists public.resolve_login_email(text);

-- Esta función preexistente no participa en el flujo de la aplicación.
-- Si existe, se retira del esquema expuesto de PostgREST.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set schema private';
    revoke all on function private.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

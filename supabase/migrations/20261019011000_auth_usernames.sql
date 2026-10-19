create table public.user_login_names (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login_name text not null unique,
  created_at timestamptz not null default now(),
  constraint user_login_names_format check (login_name ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);

alter table public.user_login_names enable row level security;
revoke all on table public.user_login_names from public, anon, authenticated;
grant select, insert, update, delete on table public.user_login_names to authenticated;

create policy user_login_names_select_owner
  on public.user_login_names for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_login_names_insert_owner
  on public.user_login_names for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_login_names_update_owner
  on public.user_login_names for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_login_names_delete_owner
  on public.user_login_names for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.resolve_login_email(login_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.user_login_names n
  join auth.users u on u.id = n.user_id
  where n.login_name = lower(trim(login_identifier))
    and u.deleted_at is null
  limit 1;
$$;

revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create table public.fiscal_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  legal_name text not null,
  rfc text not null,
  tax_regime text,
  fiscal_zip text,
  fiscal_email text,
  phone text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_profiles_legal_name_length check (char_length(legal_name) between 1 and 300),
  constraint fiscal_profiles_rfc_format check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{2,3}$'),
  constraint fiscal_profiles_fiscal_zip_format check (fiscal_zip is null or fiscal_zip ~ '^[0-9]{5}$'),
  constraint fiscal_profiles_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (owner_id, rfc)
);

create table public.fiscal_profile_members (
  profile_id uuid not null references public.fiscal_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (profile_id, user_id),
  constraint fiscal_profile_members_role check (role in ('owner', 'admin', 'accountant', 'operator', 'viewer'))
);

create or replace function public.is_fiscal_profile_member(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

create table public.tool_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fiscal_profiles (id) on delete cascade,
  tool_key text not null,
  provider text,
  environment text not null default 'sandbox',
  status text not null default 'not_configured',
  credential_ref text,
  expires_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_connections_tool_key check (tool_key in ('cfdi', 'accounting', 'payroll', 'diot', 'monitor')),
  constraint tool_connections_environment check (environment in ('sandbox', 'production')),
  constraint tool_connections_status check (status in ('not_configured', 'pending', 'connected', 'degraded', 'error', 'disabled')),
  constraint tool_connections_metadata_object check (jsonb_typeof(metadata) = 'object'),
  unique (profile_id, tool_key, environment)
);

create table public.fiscal_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fiscal_profiles (id) on delete cascade,
  tool_key text not null,
  severity text not null default 'info',
  status text not null default 'open',
  title text not null,
  detail text,
  due_at timestamptz,
  source_ref text,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_alerts_tool_key check (tool_key in ('cfdi', 'accounting', 'payroll', 'diot', 'monitor')),
  constraint fiscal_alerts_severity check (severity in ('info', 'caution', 'warning', 'critical')),
  constraint fiscal_alerts_status check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  constraint fiscal_alerts_title_length check (char_length(title) between 1 and 240),
  constraint fiscal_alerts_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table public.fiscal_deadlines (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.fiscal_profiles (id) on delete cascade,
  tool_key text not null,
  title text not null,
  period_label text,
  due_at timestamptz not null,
  status text not null default 'pending',
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_deadlines_tool_key check (tool_key in ('cfdi', 'accounting', 'payroll', 'diot', 'monitor')),
  constraint fiscal_deadlines_status check (status in ('pending', 'completed', 'overdue', 'not_applicable')),
  constraint fiscal_deadlines_title_length check (char_length(title) between 1 and 240),
  constraint fiscal_deadlines_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index fiscal_profiles_owner_idx on public.fiscal_profiles (owner_id, active);
create index fiscal_profile_members_user_idx on public.fiscal_profile_members (user_id, profile_id);
create index tool_connections_profile_idx on public.tool_connections (profile_id, tool_key, environment);
create index fiscal_alerts_profile_status_idx on public.fiscal_alerts (profile_id, status, due_at);
create index fiscal_deadlines_profile_due_idx on public.fiscal_deadlines (profile_id, due_at);

alter table public.fiscal_profiles enable row level security;
alter table public.fiscal_profile_members enable row level security;
alter table public.tool_connections enable row level security;
alter table public.fiscal_alerts enable row level security;
alter table public.fiscal_deadlines enable row level security;

revoke all on table public.fiscal_profiles, public.fiscal_profile_members, public.tool_connections, public.fiscal_alerts, public.fiscal_deadlines from public, anon, authenticated;
grant select, insert, update on table public.fiscal_profiles to authenticated;
grant select, insert, update, delete on table public.fiscal_profile_members to authenticated;
grant select, insert, update on table public.tool_connections to authenticated;
grant select, insert, update on table public.fiscal_alerts to authenticated;
grant select, insert, update on table public.fiscal_deadlines to authenticated;
grant execute on function public.is_fiscal_profile_member(uuid) to authenticated;

create policy fiscal_profiles_select_member
  on public.fiscal_profiles for select to authenticated
  using (public.is_fiscal_profile_member(id));

create policy fiscal_profiles_insert_owner
  on public.fiscal_profiles for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy fiscal_profiles_update_owner
  on public.fiscal_profiles for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy fiscal_profile_members_select_member
  on public.fiscal_profile_members for select to authenticated
  using (public.is_fiscal_profile_member(profile_id));

create policy fiscal_profile_members_insert_owner
  on public.fiscal_profile_members for insert to authenticated
  with check (exists (
    select 1 from public.fiscal_profiles profile
    where profile.id = profile_id and profile.owner_id = (select auth.uid())
  ));

create policy fiscal_profile_members_update_owner
  on public.fiscal_profile_members for update to authenticated
  using (exists (
    select 1 from public.fiscal_profiles profile
    where profile.id = profile_id and profile.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.fiscal_profiles profile
    where profile.id = profile_id and profile.owner_id = (select auth.uid())
  ));

create policy fiscal_profile_members_delete_owner
  on public.fiscal_profile_members for delete to authenticated
  using (exists (
    select 1 from public.fiscal_profiles profile
    where profile.id = profile_id and profile.owner_id = (select auth.uid())
  ));

create policy tool_connections_member
  on public.tool_connections for all to authenticated
  using (public.is_fiscal_profile_member(profile_id))
  with check (public.is_fiscal_profile_member(profile_id));

create policy fiscal_alerts_member
  on public.fiscal_alerts for all to authenticated
  using (public.is_fiscal_profile_member(profile_id))
  with check (public.is_fiscal_profile_member(profile_id));

create policy fiscal_deadlines_member
  on public.fiscal_deadlines for all to authenticated
  using (public.is_fiscal_profile_member(profile_id))
  with check (public.is_fiscal_profile_member(profile_id));

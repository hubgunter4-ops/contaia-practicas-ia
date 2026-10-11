create table public.cfdi_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Análisis CFDI',
  schema_version text not null default 'pdfc-compatible-1',
  analysis_data jsonb not null,
  created_at timestamptz not null default now(),
  constraint cfdi_analysis_runs_title_length check (char_length(title) between 1 and 120),
  constraint cfdi_analysis_runs_schema_version check (schema_version = 'pdfc-compatible-1'),
  constraint cfdi_analysis_runs_data_object check (
    jsonb_typeof(analysis_data) = 'object'
    and octet_length(analysis_data::text) <= 900000
  )
);

create index cfdi_analysis_runs_owner_created_idx
  on public.cfdi_analysis_runs (user_id, created_at desc);

alter table public.cfdi_analysis_runs enable row level security;

revoke all on table public.cfdi_analysis_runs from public, anon, authenticated;
grant select, insert, delete on table public.cfdi_analysis_runs to authenticated;

create policy cfdi_analysis_runs_select_own
  on public.cfdi_analysis_runs for select to authenticated
  using (auth.uid() = user_id);

create policy cfdi_analysis_runs_insert_own
  on public.cfdi_analysis_runs for insert to authenticated
  with check (auth.uid() = user_id);

create policy cfdi_analysis_runs_delete_own
  on public.cfdi_analysis_runs for delete to authenticated
  using (auth.uid() = user_id);

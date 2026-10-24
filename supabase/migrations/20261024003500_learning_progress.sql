create table public.learning_progress (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  progress_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint learning_progress_owner_required check (user_id is not null),
  constraint learning_progress_data_object check (
    jsonb_typeof(progress_data) = 'object'
    and octet_length(progress_data::text) <= 100000
  )
);

alter table public.learning_progress enable row level security;

revoke all on table public.learning_progress from public, anon, authenticated;
grant select, insert, update, delete on table public.learning_progress to authenticated;

create policy learning_progress_select_own
  on public.learning_progress for select to authenticated
  using (auth.uid() = user_id);

create policy learning_progress_insert_own
  on public.learning_progress for insert to authenticated
  with check (auth.uid() = user_id);

create policy learning_progress_update_own
  on public.learning_progress for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy learning_progress_delete_own
  on public.learning_progress for delete to authenticated
  using (auth.uid() = user_id);

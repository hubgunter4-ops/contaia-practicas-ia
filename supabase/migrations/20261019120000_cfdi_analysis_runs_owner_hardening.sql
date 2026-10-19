-- Reafirma el contrato de acceso del historial CFDI para cada fila.
-- El historial es inmutable desde clientes: UPDATE permanece revocado; no se crea política UPDATE.

alter table public.cfdi_analysis_runs enable row level security;
alter table public.cfdi_analysis_runs alter column user_id set default auth.uid();

revoke all privileges on table public.cfdi_analysis_runs from public, anon, authenticated;
grant select, insert, delete on table public.cfdi_analysis_runs to authenticated;

drop policy if exists cfdi_analysis_runs_select_own on public.cfdi_analysis_runs;
drop policy if exists cfdi_analysis_runs_insert_own on public.cfdi_analysis_runs;
drop policy if exists cfdi_analysis_runs_delete_own on public.cfdi_analysis_runs;

create policy cfdi_analysis_runs_select_own
  on public.cfdi_analysis_runs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy cfdi_analysis_runs_insert_own
  on public.cfdi_analysis_runs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy cfdi_analysis_runs_delete_own
  on public.cfdi_analysis_runs for delete to authenticated
  using ((select auth.uid()) = user_id);

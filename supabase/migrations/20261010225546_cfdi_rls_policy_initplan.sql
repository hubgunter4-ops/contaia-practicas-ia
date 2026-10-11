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

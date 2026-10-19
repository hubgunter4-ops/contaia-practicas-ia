create or replace function public.resolve_login_email_for_service(login_identifier text)
returns text
language sql
stable
security definer
set search_path = private
as $$
  select private.resolve_login_email(login_identifier);
$$;

revoke all on function public.resolve_login_email_for_service(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email_for_service(text) to service_role;

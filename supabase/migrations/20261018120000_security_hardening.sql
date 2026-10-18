-- Security hardening (2026-10-18): cierra hallazgos del auditor de seguridad.
-- No cambia firmas ni logica de negocio. Solo permisos y search_path.

-- 1) Helpers de rol: revocar anon. El frontend solo usa is_active_user y solo post-login.
--    Se conserva EXECUTE para authenticated: las politicas RLS y varios RPCs los
--    invocan en contexto del usuario autenticado (revocar authenticated romperia
--    todas las lecturas).
revoke execute on function public.current_user_access() from anon;
revoke execute on function public.is_admin_user() from anon;
revoke execute on function public.is_campaign_editor() from anon;
revoke execute on function public.is_crm_user() from anon;
revoke execute on function public.is_supervisor() from anon;
revoke execute on function public.is_active_user() from anon;

-- 2) search_path fijo en las 5 funciones flagged (patron ya usado por el repo).
alter function public.title_case_text(v text) set search_path = public;
alter function public.normalize_agent_name(v text) set search_path = public;
alter function public.trg_leads_normalize_catalog_columns() set search_path = public;
alter function public.trg_catalogs_normalize_value() set search_path = public;
alter function public._daily_report_data_dura(p_mes text, p_fecha text, p_report date) set search_path = public;

-- 3) Overloads legacy sin chequeos: revocar authenticated y anon.
--    Internamente se invocan dentro de funciones SECURITY DEFINER (owner), por lo
--    que no afecta a los flujos existentes. El frontend siempre envia p_campus.
revoke execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb) from authenticated, anon;
revoke execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) from authenticated, anon;
revoke execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb) from authenticated, anon;

-- 4) initplan perf: envolver auth.uid() en subselect en la politica de user_access.
drop policy if exists user_access_read_self_or_admin on public.user_access;
create policy user_access_read_self_or_admin on public.user_access
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

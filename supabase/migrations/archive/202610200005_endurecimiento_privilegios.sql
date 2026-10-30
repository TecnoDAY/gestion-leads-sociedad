-- Endurecimiento de privilegios (auditoria 2026-10-19, bloque P0.2).
-- 1) Toda funcion nueva nace sin EXECUTE para PUBLIC (era el bypass de la
--    whitelist anti-anon de 202610160003/0004).
-- 2) Los helpers que seguian ejecutables por anon/public dejan de estarlo.
-- 3) anon no conserva SELECT en leads, leads_historico ni user_access: las
--    politicas son TO authenticated, asi que el grant era latente, no visible.
-- 4) Las funciones trigger no son invocables por RPC: el EXECUTE de
--    authenticated sobraba (se ejecutan como triggers).
-- No cambia datos ni GRANT de negocio: authenticated y service_role conservan
-- EXECUTE en todas las RPC que usa la app.
begin;

-- 1) Default de privilegios: nada nuevo nace ejecutable por PUBLIC ni por anon.
--    El default heredado de Supabase era postgres/anon/authenticated/service_role
--    con TODO sobre funciones, tablas y secuencias: por eso un backup creado en
--    una migracion quedaba legible por anon hasta que se endurecia despues.
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role service_role in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- 2) Helpers internos: se revocan a PUBLIC y anon; authenticated y
--    service_role conservan el grant directo que ya tenian.
revoke execute on function public.title_case_text(text) from public, anon;
revoke execute on function public.normalize_agent_name(text) from public, anon;
revoke execute on function public._daily_report_data_dura(text, text, date) from public, anon;
grant execute on function public.title_case_text(text) to authenticated, service_role;
grant execute on function public.normalize_agent_name(text) to authenticated, service_role;
grant execute on function public._daily_report_data_dura(text, text, date) to authenticated, service_role;

-- 3) Lectura directa de anon: sobra, las politicas son TO authenticated.
revoke select on table public.leads, public.leads_historico, public.user_access from anon;
--    (Las tablas que ya existen conservan sus grants; el default endurecido
--     aplica a las nuevas, que nace fail-closed y necesitan RLS + grants.)

-- 4) Funciones trigger: se ejecutan como trigger, no como RPC.
revoke execute on function public.record_lead_gestion() from authenticated;
revoke execute on function public.record_lead_appointment_event() from authenticated;
revoke execute on function public.set_lead_gestion_meta() from authenticated;
revoke execute on function public.trg_sync_lead_agendado_dd_appointments() from authenticated;

-- Comprobacion explicita: el rol de la app conserva lo que usa.
grant execute on function public.daily_management_report(date, uuid) to authenticated, service_role;

comment on function public.title_case_text(text) is 'Helper interno de normalizacion de catalogos. Uso interno: no se expone a anon ni public.';
comment on function public.normalize_agent_name(text) is 'Helper interno de normalizacion de nombres de asesor. Uso interno: no se expone a anon ni public.';
comment on function public._daily_report_data_dura(text, text, date) is 'Helper interno del reporte diario (detecta Data Dura por Mes/Fecha). Uso interno: no se expone a anon ni public.';

commit;

-- Compensatoria de 202610160003: cierre de la via indirecta por el rol PUBLIC.
--
-- Cuatro funciones seguian siendo ejecutables por anon despues de revocarles el
-- permiso DIRECTO, porque conservaban una concesion EXECUTE al rol especial
-- PUBLIC (entrada "=X/postgres" en su ACL). Las demas no la tenian. Como PUBLIC
-- agrupa a todos los roles, esa entrada reactivaba a anon.
--
-- Solucion: revocar tambien desde PUBLIC, conservando los permisos explicitos de
-- authenticated y service_role, que ya constaban en el ACL y NO se ven afectados
-- (patron documentado de Supabase: revoke from public + revoke from anon).
--
-- Verificacion esperada:
--   - has_function_privilege('anon', ..., 'EXECUTE') = false en las 4.
--   - authenticated y service_role: true.
--   - HTTP sin sesion: 401.

begin;

revoke execute on function public.record_lead_gestion() from public, anon;
revoke execute on function public.record_lead_appointment_event() from public, anon;
revoke execute on function public.set_lead_gestion_meta() from public, anon;
revoke execute on function public.trg_sync_lead_agendado_dd_appointments() from public, anon;

grant execute on function public.record_lead_gestion() to authenticated, service_role;
grant execute on function public.record_lead_appointment_event() to authenticated, service_role;
grant execute on function public.set_lead_gestion_meta() to authenticated, service_role;
grant execute on function public.trg_sync_lead_agendado_dd_appointments() to authenticated, service_role;

commit;

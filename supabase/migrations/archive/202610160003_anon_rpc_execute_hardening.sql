-- Retirada de la ejecucion anonima de las RPC de ESCRITURA con SECURITY DEFINER.
-- Todas tienen guardas internas (admin_required, active_user_required, rechazo a
-- trafficker), por lo que una llamada anonima ya fallaba DENTRO de la funcion:
-- no era una brecha comprobada. Se retira igualmente porque el acceso sobra:
-- reduce ruido y superficie, y evita depender solo de las guardas.
--
-- CONSERVADAS (no se tocan): las funciones de consulta is_active_user,
-- is_admin_user, is_crm_user, is_campaign_editor, is_supervisor y
-- current_user_access. Devuelven un booleano o la propia fila del usuario
-- autenticado y el frontend las usa tras iniciar sesion.
--
-- Permisos que se conservan explicitamente:
--   - authenticated: uso legitimo de la aplicacion (todas las llamadas del
--     frontend se hacen con sesion de usuario).
--   - service_role y postgres: ya tenian el privilegio concedido de forma
--     directa (verificado antes del cambio), asi que los Edge Functions
--     (authorize-user, change-user-email, meta-whatsapp-webhook) no se ven
--     afectados.
--
-- Verificacion esperada despues de aplicar:
--   - anon: has_function_privilege EXECUTE = false en las 17 funciones.
--   - authenticated y service_role: EXECUTE = true.
--   - HTTP sin sesion: 401 permission denied for function.
--   - Con sesion: el comportamiento no cambia.
--
-- Rollback manual (solo si hiciera falta reabrir la ejecucion anonima):
--   grant execute on function public.<nombre>(<args>) to anon;

begin;

revoke execute on function public.archive_lead(bigint) from anon;
revoke execute on function public.restore_lead(bigint) from anon;
revoke execute on function public.create_lead_note(bigint, text) from anon;
revoke execute on function public.update_lead_note(bigint, text) from anon;
revoke execute on function public.delete_lead_note(bigint) from anon;
revoke execute on function public.update_lead_followup(bigint, jsonb) from anon;
revoke execute on function public.update_lead_full(bigint, jsonb) from anon;
revoke execute on function public.create_lead_catalog(text, text) from anon;
revoke execute on function public.rename_lead_catalog(bigint, text) from anon;
revoke execute on function public.set_lead_catalog_active(bigint, boolean) from anon;
revoke execute on function public.upsert_campaign_stat(bigint, text, integer, text, text, integer, numeric, integer) from anon;
revoke execute on function public.delete_campaign_stat(bigint) from anon;
revoke execute on function public.delete_daily_report_note(bigint) from anon;
revoke execute on function public.record_lead_gestion() from anon;
revoke execute on function public.record_lead_appointment_event() from anon;
revoke execute on function public.set_lead_gestion_meta() from anon;
revoke execute on function public.trg_sync_lead_agendado_dd_appointments() from anon;

grant execute on function public.archive_lead(bigint) to authenticated, service_role;
grant execute on function public.restore_lead(bigint) to authenticated, service_role;
grant execute on function public.create_lead_note(bigint, text) to authenticated, service_role;
grant execute on function public.update_lead_note(bigint, text) to authenticated, service_role;
grant execute on function public.delete_lead_note(bigint) to authenticated, service_role;
grant execute on function public.update_lead_followup(bigint, jsonb) to authenticated, service_role;
grant execute on function public.update_lead_full(bigint, jsonb) to authenticated, service_role;
grant execute on function public.create_lead_catalog(text, text) to authenticated, service_role;
grant execute on function public.rename_lead_catalog(bigint, text) to authenticated, service_role;
grant execute on function public.set_lead_catalog_active(bigint, boolean) to authenticated, service_role;
grant execute on function public.upsert_campaign_stat(bigint, text, integer, text, text, integer, numeric, integer) to authenticated, service_role;
grant execute on function public.delete_campaign_stat(bigint) to authenticated, service_role;
grant execute on function public.delete_daily_report_note(bigint) to authenticated, service_role;
grant execute on function public.record_lead_gestion() to authenticated, service_role;
grant execute on function public.record_lead_appointment_event() to authenticated, service_role;
grant execute on function public.set_lead_gestion_meta() to authenticated, service_role;
grant execute on function public.trg_sync_lead_agendado_dd_appointments() to authenticated, service_role;

commit;

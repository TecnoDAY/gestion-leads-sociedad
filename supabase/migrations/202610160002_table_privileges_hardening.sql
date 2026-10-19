-- Retirada de privilegios estructurales sobrantes en las tablas expuestas.
-- El patron por defecto de Supabase deja REFERENCES, TRIGGER y TRUNCATE a anon y
-- authenticated. Ninguna de estas tablas los necesita: las escrituras pasan por
-- RPC y la lectura usa SELECT (ya filtrado por RLS).
--
-- TRUNCATE es una operacion de tabla, no de fila: RLS NO la protege. PostgREST
-- no la expone hoy, por lo que no era explotable por la API; aun asi se retira
-- por minimo privilegio: reduciria el dano si una credencial con acceso SQL se
-- filtrara. Lo mismo aplica a REFERENCES y TRIGGER.
--
-- Se conserva exactamente el acceso previo de lectura:
--   - authenticated mantiene SELECT donde ya lo tenia.
--   - anon mantiene SELECT en leads, leads_historico y user_access (lo tenia y
--     sus politicas RLS ya lo acotan). No se anade ningun privilegio nuevo.
-- No se concede INSERT/UPDATE/DELETE directo en ninguna tabla.
--
-- Verificacion esperada despues de aplicar:
--   - role_table_grants: solo SELECT para los roles de API.
--   - HTTP: los reportes diarios y por periodo siguen respondiendo con sesion.
--
-- Rollback manual (restaura el patron por defecto, solo si hiciera falta):
--   grant references, trigger, truncate on public.<tabla> to anon, authenticated;

begin;

revoke references, trigger, truncate on public.leads from anon, authenticated;
revoke references, trigger, truncate on public.leads_historico from anon, authenticated;
revoke references, trigger, truncate on public.user_access from anon, authenticated;
revoke references, trigger, truncate on public.lead_appointments from anon, authenticated;
revoke references, trigger, truncate on public.lead_appointment_events from anon, authenticated;
revoke references, trigger, truncate on public.lead_gestiones from anon, authenticated;
revoke references, trigger, truncate on public.lead_notes from anon, authenticated;
revoke references, trigger, truncate on public.lead_catalogs from anon, authenticated;
revoke references, trigger, truncate on public.campaign_stats from anon, authenticated;
revoke references, trigger, truncate on public.daily_report_notes from anon, authenticated;

-- Fuera de alcance de esta migracion: revocar el SELECT de anon en leads,
-- leads_historico y user_access. Se conserva tal cual para no alterar el acceso
-- vigente; sus politicas RLS ya lo acotan y retirarlo es una decision aparte.

commit;

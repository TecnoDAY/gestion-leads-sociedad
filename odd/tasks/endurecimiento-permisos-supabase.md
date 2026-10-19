# Endurecimiento de permisos en Supabase (respaldo expuesto y privilegios estructurales)

## Objetivo
Cerrar el acceso publico a una tabla de respaldo con datos personales y retirar los privilegios estructurales sobrantes de las tablas expuestas por la API, sin alterar el comportamiento de los reportes.

## Problema y por que
Revision del estado remoto del proyecto `hkkuyomlcqyxtzblowle`:
- **Brecha comprobada (prioritaria):** `_bkp_leads_20261005` es un respaldo de leads con `Nombre`, `Telefono`, `OBSERVACIONES`, `Ciudad`, `AGENTE` y `Contacto` (24 columnas, 2 filas). Estaba **sin RLS** y con `ALL` concedido a `anon` y `authenticated`.
  - Verificacion por HTTP con la clave publica: `GET /rest/v1/_bkp_leads_20261005?select=count` devolvia **HTTP 200** con `[{"count":2}]`; `DELETE` con filtro imposible devolvia 200 con `[]` (escritura permitida).
  - Logs de las ultimas 24 h: solo aparecen las dos llamadas de verificacion (`curl`), sin indicios de accesos previos de terceros. Riesgo latente grave, no fuga confirmada.
- **Minimo privilegio:** `TRUNCATE`, `REFERENCES` y `TRIGGER` estaban concedidos a `anon` y `authenticated` en 11 tablas (`leads`, `leads_historico`, `user_access`, `lead_appointments`, `lead_appointment_events`, `lead_gestiones`, `lead_notes`, `lead_catalogs`, `campaign_stats`, `daily_report_notes` y el respaldo). PostgREST **no expone `TRUNCATE`**, asi que no era explotable por la API hoy; aun asi se retira porque RLS no protege esa operacion y ampliaria el dano si una credencial con acceso SQL se filtrara.
- **Endurecimiento de RPC (tercer paso):** 17 de las 23 funciones `SECURITY DEFINER` ejecutables por `anon` son de escritura. No era una brecha comprobada, pero el acceso sobraba y conviene no depender solo de las guardas internas. Se conservan las 6 de consulta (`is_active_user`, `is_admin_user`, `is_crm_user`, `is_campaign_editor`, `is_supervisor`, `current_user_access`).

## Alcance
Incluye: migraciones nuevas `202610160001_bkp_leads_20261005_hardening.sql`, `202610160002_table_privileges_hardening.sql`, `202610160003_anon_rpc_execute_hardening.sql` y `202610160004_anon_rpc_public_role_fix.sql`; aplicacion autorizada en remoto; verificacion read-only y este documento.
Excluye: revocar el `SELECT` de `anon` en `leads`, `leads_historico` y `user_access` (acceso vigente, se deja como decision aparte); cambios de RLS, politicas, codigo frontend, commit, push y despliegue.

## Restricciones
- Solo permisos. No se borran tablas ni datos.
- `postgres` y `service_role` conservan sus privilegios.
- Commit y push requieren peticion explicita.

## No romper
- Contratos RPC de `daily_management_report`, `management_period_summary`, `reporte_periodo_leads`, `upsert_daily_report_note`, `delete_daily_report_note` y los de campanas por periodos.
- Las 12 politicas RLS existentes.
- Suite actual: 643 Node + 11 Python; lint.

## TDD
Modo: off. Fuente: default. Runner: `npm test` (Node + Python). Sin ciclo RED/GREEN: el cambio es de infraestructura y se verifica con lecturas del remoto y HTTP.

## Tareas
- [x] T1 Inventario read-only de exposicion (tablas, privilegios, politicas, RPC anonimas, logs).
- [x] T2 Migracion `202610160001`: `revoke all` a `anon`/`authenticated` + `enable row level security` sobre el respaldo.
- [x] T3 Verificacion de T2: privilegios, conteo intacto y HTTP bloqueado.
- [x] T4 Migracion `202610160002`: retirar `TRUNCATE`, `REFERENCES` y `TRIGGER` conservando `SELECT`.
- [x] T5 Verificacion de T4 y de reportes: privilegios, politicas intactas y RPC respondiendo.
- [x] T6 Checks locales: `npm test` y `npm run lint`.
- [x] T7 Migracion `202610160003`: revocar `EXECUTE` a `anon` en las 17 RPC de escritura, conservandolo explicito para `authenticated` y `service_role`.
- [x] T8 Migracion `202610160004`: corregir la via indirecta por el rol `PUBLIC` en las 4 funciones que seguian ejecutables.
- [x] T9 Verificacion final de RPC y checks locales: `npm test` y `npm run lint`.
- [x] T10 Verificacion de no regresion: las RPC que invoca la aplicacion conservan `EXECUTE` para `authenticated`.
- [ ] T11 Smoke test del reporte diario CON sesion (`SUPABASE_USER_JWT`). Requiere JWT de sesion CRM: pendiente del humano.
- [x] T12 `qa-gate --strict` + auditoria de los ficheros nuevos (secretos, TODO, DDL destructivo, `git diff --check`).

## Criterios de aceptacion
- [x] Respaldo: sin privilegios para `anon`/`authenticated`, RLS activo, 2 filas intactas.
- [x] HTTP sobre el respaldo: `GET` y `DELETE` devuelven **401 permission denied**.
- [x] Sin `TRUNCATE`, `REFERENCES` ni `TRIGGER` en roles de API en ninguna tabla.
- [x] `authenticated` conserva `SELECT`; `anon` conserva exactamente el `SELECT` previo.
- [x] Las 12 politicas RLS siguen presentes.
- [x] RPC `daily_management_report` sin sesion: 401 (no error 500 ni cambio de contrato).
- [x] Asesor de seguridad: desaparece `rls_disabled_in_public` (nivel ERROR).
- [x] `npm test` 643/643 + 11 Python OK; `npm run lint` OK.
- [x] T9: las RPC de escritura devuelven 404 sin sesion y las de consulta 200; `npm test` y lint verdes.
- [x] Sin regresion: las 35 RPC invocadas por la aplicacion conservan `EXECUTE` para `authenticated` (37 firmas contando sobrecargas). Cero discrepancias.
- [x] Funciones de consulta conservadas: `is_active_user` responde 200.
- [x] `authenticated` y `service_role` conservan `EXECUTE` en las 17 funciones.

## Decisiones aceptadas
- Orden por riesgo comprobado: primero el respaldo expuesto, despues los privilegios estructurales.
- El respaldo **no se elimina**; se cierra su acceso (reversible).
- RPC anonimas: no se hizo un `revoke` global; se revoco funcion a funcion, solo las de escritura, conservando las de consulta y los roles legitimos. **Verificado antes de aplicar** que ninguna se usa sin sesion: las 11 llamadas presentes en `index.html` van con sesion de usuario y los Edge Functions (`authorize-user`, `change-user-email`, `meta-whatsapp-webhook`) operan con `service_role`, que tenia `EXECUTE` concedido de forma directa y no heredado; por eso no se vieron afectados.
- Las 6 funciones de consulta se conservan ejecutables por `anon`: devuelven un booleano o la fila del propio usuario autenticado, sin escribir ni exponer datos de terceros.
- Fuera de alcance dejar de conceder `SELECT` a `anon` en `leads`/`leads_historico`/`user_access`: no era necesario para el objetivo y podria romper accesos vigentes.

## Reutilizacion investigada
- Patron de endurecimiento existente `202610140002_campaign_period_stats_hardening.sql` (mismo estilo: `begin;`/`commit;`, comentario de verificacion y rollback manual).
- Verificacion con `information_schema.role_table_grants`, `pg_policies` y `pg_proc` en lugar de reescribir politicas.
- Descartado: mover tablas a otro esquema (mayor impacto), recrear funciones (riesgo innecesario), ZAP (fuera de alcance; el hallazgo es de base de datos).

## Evidencia
Fecha 2026-10-16, proyecto `hkkuyomlcqyxtzblowle`. Todas las verificaciones son lecturas y llamadas HTTP, sin escritura de datos.
- T1 — Estado: passed. Pre-flight: `_bkp_leads_20261005` sin RLS, sin politicas y con `ALL` a los dos roles de API; 11 tablas con privilegios estructurales; 23 RPC anonimas con `search_path` fijo y guardas internas. Logs: sin accesos de terceros al respaldo.
- T2/T3 — Estado: passed. `apply_migration` success. Verificacion read-only: RLS activo, `anon_privs` y `auth_privs` nulos, `service_role` con sus privilegios completos; `select count(*) = 2`. HTTP despues del cambio: **GET 401** y **DELETE 401** (`permission denied for table _bkp_leads_20261005`).
- T4/T5 — Estado: passed. `apply_migration` success. Verificacion: solo `SELECT` para los roles de API en todas las tablas; `anon` mantiene `SELECT` en `leads`, `leads_historico` y `user_access`; las 12 politicas RLS intactas. HTTP: `daily_management_report` 401 sin sesion y `daily_report_notes` 401 sin sesion.
- T5 (asesor) — Estado: passed. Desaparece `rls_disabled_in_public` (ERROR). Persisten avisos no bloqueantes y conocidos: `rls_enabled_no_policy` (INFO, tablas de respaldo/sesiones sin politicas = denegacion por defecto), `function_search_path_mutable` (WARN, 5 funciones), `extension_in_public` (WARN, `btree_gist`) y los avisos de `SECURITY DEFINER` ejecutables.
- T6 — Estado: passed. `npm test`: 643 tests Node passed / 0 failed + 11 tests Python OK. `npm run lint`: tsc y check-app OK.
- T7 — Estado: passed. `apply_migration` success. Pre-flight: las 17 funciones tenian `EXECUTE` concedido de forma DIRECTA a `postgres`, `anon`, `authenticated` y `service_role` (sin concesion a `PUBLIC`, salvo 4 casos). Comprobacion previa de seguridad: ninguna se invoca sin sesion (`index.html` usa 11, todas tras login) y los Edge Functions van por `service_role`. Verificacion posterior: `anon_exec=false` en las funciones revocadas, `auth_exec` y `service_exec` en true.
- T8 — Estado: **hallazgo propio corregido.** Tras T7, cuatro funciones seguian ejecutables por `anon`: `record_lead_gestion`, `record_lead_appointment_event`, `set_lead_gestion_meta` y `trg_sync_lead_agendado_dd_appointments`. Causa exacta: conservaban una concesion `EXECUTE` al rol especial `PUBLIC` (entrada `=X/postgres` en su ACL), que las demas no tenian; al revocar solo el permiso directo de `anon`, esa via indirecta lo reactivaba. Solucion con el patron documentado de Supabase (`revoke ... from public, anon` + `grant` a los roles legitimos). Verificacion posterior: las 4 con `anon_exec=false`, `authenticated` y `service_role` en true y sin entradas `=X/` en ningun ACL.
- T9 — Estado: passed. HTTP sin sesion sobre las RPC de escritura (`archive_lead`, `delete_lead_note`, `upsert_campaign_stat`, `update_lead_followup`, `record_lead_gestion`, `set_lead_gestion_meta`): **404 `PGRST202`**, es decir, ya no se resuelven para `anon`. Funcion de consulta conservada `is_active_user`: **200**. `npm test`: 643/643 + 11 Python OK. `npm run lint`: OK.

- T10 — Estado: passed. Metodo para cubrir el riesgo de haber cerrado una funcion que la aplicacion necesita, sin disponer de credenciales de usuario: se extrajeron las 35 RPC invocadas desde `index.html` y `src/legacy/*.js` (`supabaseClient.rpc('...')`) y se contrasto cada una contra `has_function_privilege('authenticated', ..., 'EXECUTE')` en el remoto. Resultado: 37 firmas (35 nombres + las sobrecargas de `create_lead_appointment` y `update_lead_with_appointment`), todas con `EXECUTE` vigente. Cero discrepancias.

- T11 — Estado: **pending** (depende del humano; no se marca sin evidencia observada). La suite ya trae el verificador `scripts/verify-report-integration.mjs`, que contrasta la RPC `daily_management_report` contra conteos independientes usando una sesion CRM real. Comprobado que sus guardas siguen correctas: sin credenciales sale con codigo 2 y recordatorio de no versionar claves; con JWT pero sin fecha, exige `REPORT_DATE`. No se puede ejecutar aqui porque requiere `SUPABASE_SERVICE_ROLE_KEY` y un JWT de sesion que no obran en este entorno. Verificacion parcial alternativa SI ejecutada (lectura SQL del 15 de octubre de 2026): 167 gestiones, 1 cita nueva, 0 reprogramadas y desglose de resueltas por estado; conteos accesibles y coherentes con la logica de la migracion. Queda el contraste final de la RPC con sesion.

- T12 — Estado: passed. `qa-gate --strict`: exit 0 sobre rutas rastreadas. Como las migraciones y este documento son ficheros NUEVOS sin seguir, el gate no los cubre, asi que se audito su contenido aparte: sin claves, JWT, contrasenas ni URLs con credenciales (las coincidencias de `service_role` son el nombre del rol de Postgres, no una credencial); sin TODO/FIXME; sin instrucciones destructivas (`drop`, `truncate`, `delete from`, `update`) en las migraciones nuevas; `git diff --check` OK. Corregida una imprecision de esta nota: la lectura SQL fue solo del dia 15, no de los dias 14 y 15.

## Progreso
- Estado: las tres fases de endurecimiento estan aplicadas y verificadas en remoto (respaldo, privilegios estructurales y RPC). Sin bloqueos.
- Verificaciones automaticas agotadas: politicas, privilegios, firmas de RPC usadas por la app,HTTP sin sesion, asesor de seguridad, suite y lint. Verificacion parcial de integridad de datos por SQL ejecutada.
- Unica tarea abierta: T11 smoke test del reporte diario con sesion CRM, que depende de credenciales del humano.
- Pendiente documentado y descartado por ahora: retirar a `anon` el `SELECT` de `leads`, `leads_historico` y `user_access` (no necesario para el objetivo y con riesgo de romper accesos vigentes).
- Siguiente: commit y push requieren peticion explicita.

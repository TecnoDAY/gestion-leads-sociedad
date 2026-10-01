# Estabilidad, integridad y escalabilidad del CRM

## Objetivo

Corregir los fallos confirmados de seguridad, pérdida/duplicación de datos, bloqueos de interfaz y exactitud de informes, en bloques pequeños verificables, sin reescribir la aplicación.

## Problema y por qué

La auditoría estática + reproducciones locales encontró: cambio de correo bloqueado por lectura de `generateLink` (`data.hashed_token` en vez de `data.properties`), RLS de `lead_contacts` legible por trafficker, webhook que procesa solo el primer mensaje y confirma con 200 aunque falle el insert, guardado de Campañas que mezcla ID anterior con mes nuevo, botón Guardar de lead agendado sin recalcular al elegir asesor, carreras de sesión/cachés, informe mensual que ignora el año, CSV con `#`/fórmulas, y consultas sin paginar. Build/lint en verde no cubren estos flujos.

## Alcance

Incluye:
- T1: baseline reproducible + confirmación remota solo lectura (RLS, esquema, restricciones, logs).
- T2: seguridad y bloqueos (RLS contactos, `generateLink`, botón asesor, guardado Campañas durante cambio de mes).
- T3: webhook completo (batch, idempotencia atómica por `message.id`, normalización teléfonos, config, ACK coherente).
- T4: aislamiento de sesión/cachés, fichas por origen+ID, invalidación de Citas.
- T5: exactitud (año en informe mensual, columnas Data Dura, filtros histórico/fechas/OTRO) + CSV seguro + paginación donde haya truncamiento + búsqueda de usuarios más allá de 1000.
- T6: integridad backend restante (create_lead agendado sin cita, RPC citas rol/archivado, autor de reporte por nombre, fecha de historial, colisión sync email, bootstrap atómico).
- T7: mantenimiento medido (versiones fijas, índices solo con medida, retirar plantilla React solo si no participa en build/runtime).

Excluye: rewrite a React, nuevos frameworks/dependencias, cambios de semántica de indicadores sin definición humana (qué cuenta como "Agendados"), migraciones remotas/deploy/commit/push sin petición explícita.

## Restricciones

- Sin dependencias nuevas; reutilizar helpers existentes.
- i5-1235U, 8GB RAM: pruebas focalizadas, datos sintéticos, sin PII en evidencia.
- No rama nueva, commit, push, PR, merge ni deploy/remoto-escritura sin petición explícita.
- RLS y contratos de funciones existentes se conservan salvo corrección documentada aquí.
- Máquina local: `npm run lint`, `npm run build`, `git diff --check`; Deno/Edge solo verificación local.

## No romper

- Contratos `authorize-user` (202 no enumerativo) y `change-user-email` documentado en su README.
- Flujos invitación/recuperación/`pendingPasswordSetup`, roles (`is_admin_user`, `is_supervisor`, `is_crm_user`, `is_active_user`, `is_campaign_editor`) y RPCs salvo cambio documentado.
- `user_access`: email minúsculas/trim, unicidad, `user_id` único.
- Tema claro (`scripts/check-app.mjs`) y build en verde.
- No reabrir PII al revertir seguridad.
- Archivos fuera de alcance: `src/` salvo retirada verificada en T7; `README.md` general salvo que una corrección lo exija.

## TDD

Modo: off | Fuente: default | Runner: `npm run lint && npm run build && git diff --check` + reproducciones Node/VM con datos sintéticos por tarea. Cada tarea trae prueba que falla antes y pasa después.

## Tareas

- [x] **T1 Baseline y confirmación remota read-only.** Repros locales de cada fallo + lectura remota (RLS/esquema/restricciones/logs) sin escritura; worker y verificador locales contrastados.
- [x] **T2 Seguridad y bloqueos UI.** RLS `lead_contacts`, lectura `data.properties` en `change-user-email`, listener asesor→Guardar, guardado Campañas ligado al contexto de fila/mes.
- [x] **T3 Webhook WhatsApp.** Implementacion y pruebas locales del handler verificadas independientemente; migracion preparada sin ejecutarse. Batch completo, idempotencia message_id, telefonos/config/ACK coherentes.
- [x] **T4 Sesión y cachés.** Implementacion y pruebas runtime verificadas independientemente; incluye reintentos Realtime obsoletos, promesas/catalogos y validacion de autenticacion.
- [x] **T5 Exactitud y escala de lectura.** Implementacion frontend/Edge verificada; SQL preparado, expresiones de Fecha probadas read-only en PostgreSQL, migracion completa no ejecutada. Año, Data Dura diario, filtros, CSV, paginacion y Auth >1000.
- [x] **T6 Integridad backend.** Implementacion local y revision independiente completadas; pruebas SQL estaticas no equivalen a verificar concurrencia/permisos PostgreSQL. Aplicacion y pruebas de integracion pendientes de autorizacion remota.
- [x] **T7 Mantenimiento.** Versiones runtime fijas, helpers duplicados retirados, Vite ESM y npm test. Indices y retirada de src/dependencias deliberadamente skipped: sin medida/beneficio demostrado.
- [x] **T8 Preflight remoto y preparacion de aplicacion.** Base DDL/codigo guardada; idempotencia 0005 corregida y verificada, 175/175 tests locales. No se verifico Backup/PITR de datos ni se exportaron filas personales.
- [x] **T9 Aplicacion de migraciones.** Aplicadas 0002-0005 individualmente via MCP y verificadas independientemente en PostgreSQL; sin drift ni cambios a filas funcionales. Marca bootstrap privada=1.
- [x] **T10 Despliegue Edge.** authorize-user v5, change-user-email v2 y meta-whatsapp-webhook v1 ACTIVE; codigo remoto identico al local y verify_jwt=false. Deployment cerrado; configuracion funcional Meta bloquea T11.
- [ ] **T11 Verificacion remota y cierre.** Smokes DB/HTTP no destructivos y revision independiente completados; falta META_APP_SECRET, validacion META_WEBHOOK_VERIFY_TOKEN/handshake y flujo de correo con operador/buzones reales. No afirmar cierre E2E.

## Criterios de aceptación

- [x] Politica remota de contactos y grants restringen lectura a CRM activo; admin/agente conservan acceso (SQL autenticado read-only). No se creo cuenta trafficker para probar por API.
- [x] Cambio de correo usa `data.properties` y maneja errores sin exponer enlaces (pruebas locales; correo real pendiente).
- [x] Elegir asesor recalcula Guardar; cambiar de mes bloquea operaciones fuera de contexto (pruebas locales).
- [x] Webhook: handler real con I/O simulado verifica lote, duplicados, fallos/reintentos y config. Unicidad PostgreSQL pendiente de aplicar/probar.
- [x] Logout/cambio de cuenta y respuestas fuera de orden no restauran ni borran datos ajenos; ficha abre origen+ID exactos (pruebas runtime locales).
- [x] Fecha/anio y Data Dura diario/filtros/OTRO verificados localmente; expresiones SQL fechas 11/11 en PostgreSQL read-only. RPC completa pendiente.
- [x] CSV conserva `#`/comillas/saltos y neutraliza fórmulas (contenido Blob probado).
- [x] Paginación y usuarios >1000 verificados con mocks, incluido servidor con limite inferior a 1000.
- [ ] Agendado sin cita bloqueado; citas exigen rol CRM y lead activo; reporte no escribe sobre homónimos; historial fecha el cambio; sync email no diverge; un solo bootstrap.
- [x] `npm run lint`, `npm run build`, `git diff --check` en verde por bloque; suite final 170/170 passed.

## Decisiones aceptadas

- Reparación incremental por riesgo; no rewrite ni stack nuevo (alcance aprobado por el humano).
- Prueba por arreglo en vez de batería previa gigante; paginación de informes como exactitud prioritaria.
- Indicadores ambiguos (Agendados: canceladas/reprogramadas) requieren definición humana antes de cambiar RPC.
- Webhook: no prometer "exactamente una vez"; idempotencia por `message.id` + reintento seguro.
- El humano autorizo explicitamente aplicar las cuatro migraciones y desplegar las tres Edge Functions. Esto no autoriza commit/push ni publicar el frontend; esas operaciones permanecen fuera de alcance.

## Reutilización investigada

- `sessionGeneration`/`citasRequestGeneration`/`newLeadAdvisorGeneration`: patrón canónico de carreras; extenderlo a éxito+error en vez de inventar otro.
- `csvReporteField()`: neutralización de fórmulas ya existente; reutilizar en exportadores de leads/histórico.
- `activeCatalogValues()`/`catalogOptions()` (+ fix deduplicación pendiente en `index.html` sin commit): base para filtros.
- `lead_contact_id_for()` atómica: reutilizar para dedup del webhook en vez de select-then-insert en la función.
- SDK oficial `auth-js` (`_generateLinkResponse`: `data.properties`): fuente para T2. Docs Meta webhooks (batch/reintentos 7 días): fuente para T3.

## Evidencia

- Auditoría: `index.html`, `src/`, 3 Edge Functions, migraciones hasta `202609300001`; reproducciones Node/VM (generateLink 500, teléfono 10 vs 11 dígitos, webhook 2 mensajes→1 insert, `WHATSAPP_DEDUP_DAYS` inválido→RangeError).
- T1 baseline (2026-09-30, solo lectura remota, datos sintéticos):
  - `git status --short`: `M index.html` (fix `catalogOptions` con `new Set` + comentario, sin commit), `?? deno.lock`, `?? odd/tasks/estabilidad-y-escalabilidad.md`; `git diff --check` OK.
  - Repro local `/tmp/opencode/repro-t1-baseline.mjs` (Node v24, sin red/PII): 10/10 REPRODUCE — T2a duplicados `catalogOptions` (`["A","X","X","Y"]`), T2b `data.hashed_token` vacío vs `data.properties.hashed_token` presente, T2c RLS solo `is_active_user()`, T3a `messages[0]` único, T3b `parseInt` inválido→`RangeError` en `toISOString()`, T3c `200+creation_failed`, T3d 10 vs 11 dígitos sin colisión (`525512345678` vs `5512345678`), T5a mes sin año, T5b fórmula sin neutralizar (`"=SUM(A1:A9)"`), T5c `encodeURI` deja `#` (solo reporte diario/campañas usan `csvReporteField`+`%23`).
  - Remoto read-only (MCP supabase): `pg_policies.lead_contacts` = `SELECT` a `authenticated` con `qual=is_active_user()` (confirma T2c; roles actuales solo `agente`+`admin`, pero la política no filtra rol); columnas/restricciones `lead_contacts` = repo (`UNIQUE phone_normalized`, `CHECK ^[0-9]{7,15}$`, FK `created_by`); existen `lead_contact_id_for`, `is_active_user/admin/supervisor/crm_user`; triggers en `leads`: `leads_set_contact_id`, `leads_record_gestion`, `trg_leads_normalize_catalog_columns`.
  - Discrepancias repo vs remoto: historial remoto con 5 migraciones (`normalize_catalog_values`, `fix_lead_gestiones_fantasma`, `lead_contacts`, `supervisor_role_and_access`, `sync_user_access_email`) frente a ~20 ficheros locales (nombres/fechas no coinciden 1:1; p. ej. `campaign_stats`, `reporte_diario_notas` sin entrada homónima); linter seguridad WARN: 4 funciones con `search_path` mutable (`title_case_text`, `normalize_agent_name`, 2 triggers de normalización) + `SECURITY DEFINER` ejecutables por `anon` (p. ej. `admin_manage_user_access`) — insumo T6; logs 2026-09-30 legibles (`edge_logs` 541, `function_logs` 32, `function_edge_logs` 16).
  - Matiz: paginación por cursor `id` ya existe para `leads`/`leads_historico` (`fetch…ByIdCursor`, `range+order id desc`); T5 debe verificar cobertura restante (informes/u2008otros listados), no asumir ausencia total.
- Pendiente por tarea (comando + salida breve).
- T3 ejecutada (2026-09-30, local + sintético, sin PII, sin escritura remota):
  - Nueva migración `supabase/migrations/202609300003_webhook_whatsapp_message_id.sql` (existentes intactas): `leads.whatsapp_message_id` nullable + `UNIQUE` parcial (solo NOT NULL; leads no-WhatsApp no colisionan) + limpieza de duplicados históricos (conserva fila más antigua) antes del índice.
  - `supabase/functions/meta-whatsapp-webhook/index.ts`: aplana todo el lote (`entry[]→changes[]→value.messages[]`, antes solo `messages[0]`); contacto vía RPC atómica `lead_contact_id_for` (reutilizada, sin select-then-insert); normalización canónica única (solo dígitos, un solo sitio); `WHATSAPP_DEDUP_DAYS` validado sin excepciones (entero `[0,3650]`, defecto 30); violación `23505` en insert → `duplicate: true` (dedup atómica concurrente); ACK coherente (200 si todo persistido/duplicado/omitido por validación, 503 `retryable` si hubo fallo transitorio para que Meta reintente); README del webhook actualizado (antes documentaba `messages[0]` y "siempre 200").
  - Repro `/tmp/opencode/repro-t3.mjs` (extrae y ejecuta las funciones puras del handler real + contrasta con `git show HEAD`): 28/28 PASS tras el fix; en HEAD los 4 grupos fallaban (batch de 3→1, `parseInt` sin validar, `200+creation_failed`, select-then-insert en `lead_contacts`).
  - Limitación detectada al integrar: el trigger ligaba `contact_id` desde teléfono display con prefijo inferido, distinto del usado por la RPC. T3 reabierta para corregir este defecto del alcance original; no se considera fuera de alcance.
  - `npm run lint` OK, `npm run build` OK (148ms), `git diff --check` OK, `deno check` del handler OK.
- T2 ejecutada (2026-09-30, local + sintético, sin PII, sin escritura remota):
  - Nueva migración `supabase/migrations/202609300002_lead_contacts_crm_read.sql` (existentes intactas): SELECT `lead_contacts` pasa a `is_active_user() AND is_crm_user()` (canónica 202609290001/02; excluye trafficker, incluye admin/agente/supervisor); grants lectura intactos (`revoke all` + `grant select to authenticated`); sin tocar helpers ni escritura por funciones del sistema.
  - `supabase/functions/change-user-email/index.ts`: lee `data.properties.hashed_token/action_link` con fallback a nivel superior legado; 0 `console` con tokens; contrato 202/400/404/429/500 intacto.
  - `index.html`: `onchange` en `#newAppointmentAdvisor`→`toggleNewAppointmentFields()` y `#editAppointmentAdvisor`→`updateEditSubmitState()` (Guardar recalcula al elegir asesor, nuevo y edición); Campañas con `campanasLoading/campanasContextMonth`, filas `data-month/data-stat-id`, `save(id,mes)`/`delete(id,mes)` que bloquean durante carga y recargan si el mes/id cambió (no mezcla id anterior con mes nuevo).
  - Repro `/tmp/opencode/repro-t2.mjs`: 15/15 PASS tras el fix; en `git show HEAD` los 4 grupos dan false (fallaban antes). `npm run lint` OK (check-app 3 bloques, tema claro OK), `npm run build` OK (147ms), `git diff --check` OK.
- T4 ejecutada (2026-09-30, local + sintético, sin PII, sin escritura remota):
  - `index.html` (patrón `sessionGeneration` existente reutilizado, sin helpers nuevos salvo `invalidateCitasCache()`): `clearSessionState()` sin shadowing (`let reporteDayAdvisors/Data` → asignación global real) + limpieza de `leadNotesCache/leadGestionesCache/editingNoteId` + bump `newLeadAdvisorGeneration`; `performLoadLeadsData()` con `sessionValid()` (generación+usuario+acceso) en éxito, en `catch` (un error obsoleto no vacía la sesión nueva) y antes de pintar; `performLoadHistoricoData()` con generación en éxito y error (antes sin guarda); `loadLeadNotes()/loadLeadGestiones()` con guarda sesión+ficha+usuario (antes solo `currentViewId`); `openViewLeadModal()` abre origen+ID exactos sin fallback cruzado; `invalidateCitasCache()` tras crear/cambiar/reprogramar cita (el panel Citas refetchea en vez de mostrar cache obsoleta); `closeViewLeadModal()` limpia también notes/gestiones/editing.
  - Repro `/tmp/opencode/repro-t4.mjs`: 9/9 PASS tras el fix; en HEAD 0/9 (fallaban los 9 grupos).
  - `npm run lint` OK (check-app 3 bloques, tema claro OK), `npm run build` OK (137ms), `git diff --check` OK.
- Reanudacion tras rate-limit (2026-09-30):
  - Estado reconciliado con `git status --short` y `git diff --stat`: preservados T2-T4 y `deno.lock` sin rastrear; no stash, reset ni checkout.
  - T5: nuevos tests versionados `scripts/tests/t5-frontend-edge.test.mjs` y `scripts/tests/campaign-monthly-rollup.test.mjs`. Worker frontend: 34/34 inicialmente; verifier detecto truncamiento si limite servidor <1000, callback inexistente del buscador y divergencia Mes/Fecha; worker corrigio los tres y agrego pruebas runtime (40/40).
  - Nueva regresion T5 corregida: la columna Data Dura historica era una adicion de esta tarea, no un indicador previamente aprobado; retirada solo esa adicion. Data Dura diario conservada, con Mes/Fecha y referencia del reporte. Tests frontend ahora 42/42; pendiente reverificacion independiente final.
  - T5 SQL: `202609300004_campaign_monthly_rollup_year.sql` conserva Mes canonico y obtiene anio desde Fecha valida, nunca desde created_at de importacion. Todos los estados de citas conservados; no cambia definicion Agendados. Tests 6/6 usan SQLite para CTE adaptados: NO equivalen a ejecutar la migracion PostgreSQL. PostgreSQL local unavailable.
  - T6: `202609300005_backend_integrity.sql`, `authorize-user/index.ts` y `scripts/tests/backend-integrity.test.mjs`; 15/15 pruebas locales, baseline 13 fallos/2 exitos; lint, build, Deno check y diff-check passed. Verificador independiente sin defectos nuevos confirmados. SQL revisado estaticamente, ejecucion PostgreSQL/concurrencia/permisos efectivos pending.
  - T3 reabierta y corregida: migracion 0003 aborta con excepcion ante IDs duplicados sin borrar leads; telefono coherente RPC/almacenamiento sin prefijos inferidos; errores de lectura y 23505 sin duplicado comprobado retornan 503; remitente invalido/ID ausente se omiten explicitamente. Handler real esbuild+VM en `scripts/tests/webhook-whatsapp.test.mjs`: 11 fallos antes -> 18/18 passed; Deno, lint, build, diff-check passed. Migracion no ejecutada; pendiente verifier final.
  - T4 reabierta: validateCurrentSession seguia sin guards tras await; corregidos getSession/access/inicializacion/cierre demorado y finally por identidad; switchTab conserva hidden al trafficker. `scripts/tests/session-isolation.test.mjs`: 37/37 passed; suite conjunta 118/118 passed, lint/build/diff-check passed. Pendiente verifier final.
  - QA-gate staged sin cambios staged: aviso `.env.example` preexistente; no se considera un secreto nuevo ni cobertura completa del diff sin staging. Pendiente barrido focalizado de adiciones/untracked al cierre.
- Cierre local en curso (2026-09-30):
  - Verificador T3/T4/T5 ejecuto 118/118 tests y lint/diff-check passed; T3/T5 conformes. Detecto dos carreras T4 restantes: finally antiguo borraba promesas nuevas y loadCatalogs/refreshCatalogs mutaban estado tras cambio de cuenta. Worker corrigio ambas usando identidad y generacion/usuario/acceso; 26 fallos observados antes, 73/73 session-isolation passed despues; suite 154/154 passed.
  - T7 mantenimiento acotado: frontend Tailwind 3.4.17, Supabase 2.117.2, Lucide 1.49.0, Chart.js 4.5.1 fijadas tras comprobar que URLs exactas devolvian bytes identicos a las flotantes servidas. Edge SDK 2.117.1 conservando resolucion de deno.lock. No se actualizo ese lock.
  - T7: eliminado unicamente duplicado identico de miamiToday/miamiDayBounds; Vite usa dirname(fileURLToPath(import.meta.url)) en vez de __dirname en ESM; npm test ejecuta suites versionadas. Tests runtime-maintenance 12/12 passed, smoke sintetico Chromium de dependencias y Deno SDK real passed por worker; no es prueba visual completa ni flujo admin real.
  - T7 limites deliberados: retirada de src/dependencias skipped, sin beneficio demostrado; indices skipped, sin EXPLAIN medido. Tailwind Play CDN v3 sigue siendo desarrollo-only segun documentacion oficial https://v3.tailwindcss.com/docs/installation/play-cdn; migrar el CSS/build no esta en este arreglo minimo.
  - `npm test`: 166/166 passed por worker; Deno check --no-lock tres Edge Functions passed; lint/build/diff-check passed. Verificador independiente integral en curso.
  - PostgreSQL real, solo lectura remota: CTE de atribucion de Fecha de T5 contra 11 casos sinteticos (DMY, ISO, anio corto, otro anio, bisiestos validos/invalidos, mes/dia invalidos y vacios): 11/11 passed; septiembre 2026=3. No crea tablas/funciones ni modifica datos. Esto verifica expresiones de fechas, NO equivale a ejecutar migraciones 0002-0005 ni probar permisos/concurrencia.
  - QA-gate normal: aviso de .env.example preexistente, sin staging. Barrido adicional de lineas agregadas en produccion (diff unstaged + ficheros untracked; excluye deno.lock/tests/docs): 0 secretos/catch vacios detectados, exit 0. No se imprime contenido de secretos.
  - Build observado por coordinador: `npm run build` passed, dist/index.html 333.72kB (gzip 70.54kB), 427ms; ya sin advertencia __dirname.
- Veredicto final independiente (2026-09-30):
  - Se detecto una carrera adicional en reintentos del snapshot: A esperaba conteo, B cambiaba sesion y recibia UPDATE, A reintentaba y vaciaba la cola de B. Corregidos guards tras cada await y antes de continuar/reintentar/mutar.
  - `scripts/tests/session-isolation.test.mjs`: reproduccion real del snapshot/wrappers con I/O controlada, 2 fallos antes -> 4/4 asserts passed despues. Verificador independiente reprodujo el escenario y confirmo que B conserva UPDATE y publica fila actualizada; cuatro puntos de espera cubiertos, sin regresiones confirmadas del fix.
  - Verificador: `npm test` 170/170 passed, `npm run lint` passed, `git diff --check` passed; worker ejecuto tambien build passed. Contratos SUMMARY/RESULT success recibidos para cada tarea/reapertura; ningun comando generado por modelo se uso como continuacion de control-plane.
  - Migraciones nuevas locales 0002-0005 y funciones Edge modificadas NO desplegadas. SQL DDL, grants/RLS, rollback/concurrencia y flujo de correo con admin/buzones reales permanecen pending; PostgreSQL local unavailable. El estado de implementacion local no significa cambio de produccion.
  - Checks finales del coordinador tras ultimo fix: build passed (dist/index.html 334.08kB, gzip 70.57kB, 480ms), git diff --check passed, barrido final de secretos/catch vacios en adiciones produccion passed (0 hallazgos). Reliability: waitForQuery en tests sincroniza consultas controladas, no espera temporal fija; Date.now en webhook es logica de ventana, no prueba no determinista. Sin evidencia concreta de flaky en el diff.
- T8 preflight remoto tras autorizacion (solo lectura hasta este punto):
  - `supabase` CLI no disponible en PATH. Se usara apply_migration/deploy_edge_function MCP con inputs exactos, no un db push global: historial remoto no coincide 1:1 con prefijos locales.
  - Worker remoto guardo base DDL/ACL/politicas/triggers/codigo Edge/fingerprints en `/tmp/opencode/estabilidad-predeploy/` (directorios700, ficheros600), sin datos personales ni secretos. Es respaldo de definiciones, NO backup recuperable de datos/PITR; disponibilidad de Backups/PITR no verificable por herramientas disponibles.
  - 12 cuerpos SQL equivalentes a HEAD; authorize-user v4 y change-user-email v1 equivalentes a HEAD. Ninguna diferencia manual detectada; ninguna nueva migracion aplicada todavia.
  - Conteos base: leads5817, historico4348, user_access4, contactos4955, citas8, eventos14, gestiones11, notas7, notas diarias0, campaign_stats0.
  - meta-whatsapp-webhook NO existe remotamente: deployment sera inicial; configuracion Meta aun no verificable. No se modificara callback externo ni se inventaran credenciales.
  - Worker detecto que 0005 no era repetible (rename y create table sin guardian). Corregir dentro de alcance autorizado antes de aplicar; inputs MCP originales de0005 quedan invalidados hasta regenerarse.
  - Advisors pendientes ajenos al alcance: funciones search_path mutable, ACLs definer anon, FK sin indice y backup historico sin RLS pero sin grants efectivos anon/authenticated. No se remedia automatico ni se exportan filas.
- T8 preparacion corregida:
  - 0005 ahora valida fingerprints del helper canonico (`63066106f043b70de23da53e4ae2d050`) y wrapper (`f3e5d5bfbf208fa5713d64377e31068a`), owner/firma/definer/ACL/retorno. Nunca renombra el wrapper al repetir. Tabla bootstrap guarded y estructura/constraints/ACL/RLS comprobadas, singleton ON CONFLICT DO NOTHING.
  - 0004 revoca grant residual anon. Inputs MCP regenerados, verificadores confirmaron byte-identidad local; 175/175 pruebas y lint/build/diff-check passed. Baseline anterior preservado, hashes nuevos registrados separadamente.
- T9 aplicacion remota (2026-09-30, project_ref hkkuyomlcqyxtzblowle):
  - Tool `apply_migration`, en orden 0002-0005; versiones reales del historial: `20260930214421`, `20260930214621`, `20260930214705`, `20260930214751`. Nunca se uso db push ni se reaplicaron migraciones antiguas.
  - Cada payload = fuente local + tres SET LOCAL para limitar esperas, registrados en inputs efectivos. Transacciones confirmadas; fuente local intacta. Comandos exactos y resultados: `/tmp/opencode/estabilidad-predeploy/t9-applied/README.md`, `summary.json`, `*-effective-input.json`; hashes actuales en `fingerprints-current.json`.
  - Worker y verifier comprobaron cuerpos/owners/ACL/columnas/indice unico parcial/politicas completas/triggers. Helper privado solo postgres; bootstrap execute service_role y marca=1; rollup anon=false. Seis triggers vinculados y habilitados.
  - Conteos funcionales antes/despues identicos: leads5817, historico4348, user_access4, contactos4955, citas8, eventos14, gestiones11, notas7, notas diarias0, campaign_stats0. No se borraron/reconciliaron filas de usuarios; marca privada bootstrap nueva es el unico registro de sistema insertado.
  - Verificacion de conteos no equivale a hash fila a fila; definiciones aplicadas no actualizan filas funcionales existentes. No se probó concurrencia ni reejecucion de migraciones en el servidor.
- T10 despliegue y verificacion remota:
  - Tool `deploy_edge_function`: authorize-user v5, change-user-email v2, meta-whatsapp-webhook v1; todas ACTIVE, verify_jwt=false, SDK2.117.1. get_edge_function y SHA256 confirmaron fuentes identicas byte a byte; verifier independiente ratifico.
  - HTTP real no destructivo: authorize POSTsinacceso202 y roleinvalido400; change POSTsinacceso202 y GET405; webhook GETtokenfalso403 y POSTfirmafalsa503. Logs confirman invocaciones; 18 conteos verificados sin efectos laterales. Evidencia `/tmp/opencode/estabilidad-predeploy/t10-edge/`.
  - Falta META_APP_SECRET confirmado por HTTP/logs. META_WEBHOOK_VERIFY_TOKEN no validado. Webhook falla cerrado con503: deployment existe pero integracion funcional NO lista. No se inventaron secretos ni se cambio callback de Meta.
- T11 smokes PostgreSQL read-only:
  - BEGIN READ ONLY + SET LOCAL role authenticated y claims derivados internamente de admin/agente existente, SELECT public.campaign_monthly_rollup y helpers/contactcount, ROLLBACK; no se imprimen identidades ni tokens.
  - Admin: authenticated/claims/is_crm/is_active=true, contactos4955, septiembre2026=6campanas y septiembre2025=0. Agente: mismos booleanostrue/contactos4955. Comprobacion posterior: role/identity/claims no persistidos, tres true. Verificador independiente reprodujo resultados.
  - Evidencia y SQL exacto sin ID dinamico expuesto: `/tmp/opencode/estabilidad-predeploy/t11-smoke/readonly-results.json`. Esto demuestra ejecucion positiva de agregacion/permisos CRM, no equivale a E2E con login del navegador ni a probar RPCs de escritura/concurrencia/correos.
  - Referencia oficial de secretos: https://supabase.com/docs/guides/functions/secrets. Secretos de produccion se configuran en Dashboard/CLI y quedan disponibles sin redeploy. Valores privados nunca deben compartirse en chat.

## Progreso

- Estado: cuatro migraciones aplicadas y tres Edge Functions desplegadas/verificadas; smokes SQL/HTTP correctos salvo bloqueo funcional Meta por configuracion. Sin commit/push ni publicacion del frontend.
- Última tarea: T11 agregacion autenticada positiva y cleanup ROLLBACK verificados independientemente; registros funcionales conservados.
- Siguiente paso: operador configura META_APP_SECRET y META_WEBHOOK_VERIFY_TOKEN en Dashboard sin compartir valores; verificar handshake Meta y flujo de correo con cuenta/buzones reales. Publicar frontend requiere peticion separada.
- Bloqueos: META_APP_SECRET ausente, verifytoken no validado; correo E2E requiere operador. Backup/PITR recuperable no verificable por estas herramientas; solo base de definiciones/codigo conservada. "Agendados" mantiene definicion existente.

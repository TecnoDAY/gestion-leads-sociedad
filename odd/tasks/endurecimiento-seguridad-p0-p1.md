# Endurecimiento P0/P1 y limpieza (auditoria de seguridad 2026-10-19)

## Objetivo
Cerrar los hallazgos de la auditoria de seguridad del 2026-10-19 (P0, P1) y la higiene prioritaria (P2.1/P2.2), sin cambiar el modelo de negocio.

## Problema y por que
La auditoria encontro un modelo de permisos solido (RLS activo, escrituras solo por RPC con guardas, cero GRANT peligrosos, search_path fijado, webhook firmado e idempotente, XSS cubierto y CSP sin unsafe-inline) pero cuatro huecos reales:
- `anon`/`public` ejecutan 3 funciones helper y toda funcion nueva nace con EXECUTE para PUBLIC.
- `anon` conserva SELECT sobre `leads`, `leads_historico` y `user_access` (hoy fail-closed por politica, latente si alguien abre RLS).
- La cadena de suministro permite cualquier paquete de jsdelivr/unpkg y Chart.js se carga sin SRI.
- El dispatcher `data-ev` resuelve handlers por `window[nombre]` sin allowlist.

## Alcance
Incluye:
- P0.1: ratificar por escrito el modelo de citas por equipo (turnos cruzados) con `comment on function` y documentacion; verificar la atribucion por actor.
- P0.2: migracion de endurecimiento (`ALTER DEFAULT PRIVILEGES`, revokes a helpers, revoke SELECT de `anon`, revoke a funciones `returns trigger`).
- P0.3: PII de produccion fuera del working tree y ZAP baseline (856 KB) fuera de git.
- P1: SRI para Chart.js, allowlist del dispatcher `data-ev`, `is_active_user()` en sesiones, webhook sin `lead_id` en la respuesta, CORS fail-closed en las 3 edge functions.
- P2.1: higiene (console.log, `citasMedio`, wrapper vestigial, CSS muerto, deps muertas, package.json, `.bak`).
- P2.2: README de migraciones con la version vigente por familia y la regla de timestamp unico.

Excluye:
- Reescribir el historial de git (la PII ya comiteada seguiria en los commits antiguos; requiere autorizacion aparte por ser operacion destructiva).
- Autoalojar los CDN (cambio de build grande): se mitiga con SRI.
- Unificar zona horaria Miami y categorias de gestion (P2.3) y extraer funciones del monolito (P2.4): jornada aparte.
- Cambios de comportamiento del reporte diario ya cerrados en su propia feature.

## Restricciones
- No commit, push ni PR. Aplicar migraciones en el remoto solo con autorizacion explicita.
- No editar migraciones ya aplicadas (el registro es historico); las correcciones van en migraciones nuevas.
- No tocar el modelo de citas por equipo: es decision ratificada del negocio.
- Preservar el patron de la app (monolito + modulos `src/legacy` con `window.*`).

## No romper
- Reporte diario, CSV y sus invariantes (`whatsapp + llamadas = gestured = canales.total`).
- Citas: atribucion por actor en `lead_appointment_events` y su render en la ficha.
- Permisos existentes: `authenticated` conserva EXECUTE en las RPC de negocio; `service_role` intacto.
- Idempotencia y validacion del webhook (HMAC, `message.id`, receipts).
- Las 36 columnas del CSV diario y la cabecera.
- Los 714 tests del repo.

## TDD
- Modo: off
- Fuente: default
- Runner: `npm test`; focalizado `node --test scripts/tests/citas-lead.test.mjs`, `node --test scripts/tests/actions.test.mjs`, `node --test scripts/tests/t5-frontend-edge.test.mjs`.

## Tareas
- [x] T1 Verificar en el remoto el estado vivo de los hallazgos (los ficheros pueden mentir).
- [x] T2 Documento ODD y decisiones ratificadas.
- [x] T3 P0.1 ratificacion del modelo de equipo (comment on function + doc).
- [x] T4 P0.2 migracion de endurecimiento de privilegios.
- [x] T5 P0.3 PII y ZAP baseline fuera de git.
- [x] T6 P1a SRI de Chart.js.
- [x] T7 P1b allowlist del dispatcher `data-ev`.
- [x] T8 P1c `is_active_user()` en sesiones.
- [x] T9 P1d webhook: sin `lead_id` en la respuesta y rate limit de entrada.
- [x] T10 P1e CORS fail-closed en las 3 edge functions.
- [x] T11 P2.1 higiene.
- [x] T12 P2.2 README de migraciones.
- [x] T13 Suite, lint, build, qa-gate y revision independiente.

## Criterios de aceptacion
- [x] Ninguna funcion nueva nace con EXECUTE para PUBLIC; las 3 helpers dejan de ser ejecutables por `anon`.
- [x] `anon` sin SELECT en `leads`, `leads_historico`, `user_access`.
- [x] Las 4 funciones `returns trigger` sin EXECUTE para `authenticated`.
- [x] Chart.js con SRI verificado contra el hash real del CDN.
- [x] `data-ev` solo puede invocar handlers de una allowlist.
- [x] `touch_agent_session`/`end_agent_session` exigen usuario activo.
- [x] El webhook no devuelve identificadores internos y limita peticiones por IP.
- [x] Las edge functions fallan cerradas si `ALLOWED_ORIGIN` no esta definido.
- [x] Sin PII de produccion en el working tree; el ZAP baseline fuera de git.
- [x] Sin `console.log` de depuracion en produccion.
- [x] `npm test`, `npm run lint`, `npm run build` y `qa-gate --strict` en verde.

## Decisiones aceptadas
- Modelo de citas por EQUIPO ratificado (turnos cruzados): cualquier CRM activo marca Asistio/No asistio/Cancelada y reprograma, sin exigir ser la asesora asignada. La atribucion la lleva `lead_appointment_events.actor_user_id/actor_name` y se ve en la ficha ("Asesora N reprogramo el ...", "PROGRAMADA -> ASISTIO"). La UI ya lo permitia; lo que faltaba era el contrato escrito. Se corrige con `comment on function` (las migraciones aplicadas no se editan).
- Edicion de datos de la cita y borrado siguen siendo de la asesora asignada o admin; reprogramar y resolver son de equipo.
- `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE` se aplica al rol `postgres` y `service_role` con la opcion de re-habilitar por funcion.
- La PII de los imports 2025 se retira del working tree sustituyendo el contenido por una nota; los ficheros conservan su version (la CLI compara por version, no por contenido) y la data ya vive en `leads_historico`.
- El ZAP baseline se conserva en local pero deja de estar trackeado (`.gitignore`), para que los clones no carguen 856 KB.

## Reutilizacion investigada
- Patron de endurecimiento existente: `20261018120000_security_hardening.sql` (search_path + ACL) y `202610160003/0004_anon_rpc_*.sql` (revoke a `anon`/`public` + grant a `authenticated`/`service_role`). La migracion nueva reutiliza ese patron.
- `ALTER DEFAULT PRIVILEGES` ya aparece en las migraciones del repo para el schema `public`.
- SRI ya usado en `index.html:21,24` para supabase-js y lucide; Chart.js es el unico script CDN sin `integrity`.
- El dispatcher `data-ev` tiene ya una allowlist de tipos de evento (`src/legacy/actions.js:13`); se amplia con allowlist de handlers.
- Tests existentes que fijan el comportamiento: `scripts/tests/citas-lead.test.mjs` (permisos de la cita de la ficha), `scripts/tests/actions.test.mjs` (dispatcher).

## Aplicacion remota (autorizada por "implementa el plan")
- Preflight (solo lectura): reporte diario md5 `90a7f9825e9b57b2ea71b37f27a5df8e` (sin drift), recuentos leads 6317 / gestiones 1492 / citas 50 / usuarios 5, default ACL heredado de Supabase con TODO para anon y authenticated en tablas/funciones (por eso un backup nuevo nacia expuesto).
- Aplicadas: `202610200004_ratificacion_modelo_equipo_citas` (v20261020001508), `202610200005_endurecimiento_privilegios` (v20261020001509), `202610200006_sesiones_usuario_activo` (v20261020001535). SQL servido por HTTP loopback en 127.0.0.1 (solo ficheros de migraciones, sin credenciales) y pasado byte-exacto; servidor cerrado despues. Nota operativa: `apply_migration` genera la version con precision de segundo, asi que dos migraciones en el mismo segundo chocan con `schema_migrations_pkey` (se aplicaron de una en una).
- Postflight: helpers ejecutables por `anon` **3 -> 0**; funciones trigger ejecutables por `authenticated` **4 -> 0**; `anon` con SELECT sobre leads/leads_historico/user_access **3 -> 0**; `daily_management_report` sigue ejecutable por `authenticated` (anon:false); default de funciones = `{postgres, authenticated, service_role}` (sin PUBLIC ni anon); default de tablas = `{postgres, service_role}` (las nuevas nacen fail-closed); las 2 funciones de sesion ya exigen `is_active_user()`; comentario del modelo de equipo puesto en `set_lead_appointment_status`. Recuentos de datos sin cambios.
- Regresion del reporte diario verificada con los CTE/JSON reales del remoto: 2026-10-15 -> 167 gestiones (WhatsApp 83, llamadas 84, combinada 8) e 2026-10-19 -> 112 gestiones (WhatsApp 35, llamadas 77, combinada 23); invariante WhatsApp + llamadas = gestos = canales.total **true** en los dos dias.

## Evidencia
- T1 passed: consultas de solo lectura al remoto (advisors, ACL, `pg_policies`, `prosrc`, `has_function_privilege`). Hallazgo "RLS de lead_notes sin propiedad" **descartado** (politica viva = SELECT `is_active_user() AND is_crm_user()`; escritura solo por RPC admin). "Trafficker lee gestiones" **descartado** (`is_crm_user()` en RLS). "Enumeracion de correos" **descartado** (`user_id = auth.uid() OR is_admin_user()`). `create_lead_note` **ya** rechaza trafficker en el cuerpo vigente.
- T3 passed: `comment on function` en la migracion nueva; el historial con actor ya existia (`src/legacy/citas.js:107-121`) y esta cubierto por tests.
- T4 passed: migracion de endurecimiento creada; verificada en el harness SQL y contra el remoto tras aplicar (autorizado).
- T5 passed: imports con PII sustituidos por nota; ZAP baseline desencriptado (`git rm --cached`) y en `.gitignore`.
- T6 passed: SRI de Chart.js con el hash real descargado del CDN (`sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ`), verificado ademas por test en `scripts/tests/runtime-maintenance.test.mjs`.
- T7 passed: allowlist de 108 handlers en `src/legacy/actions.js`, fail-closed por defecto en `llamarAccion`; test propio (handler no permitido -> error) y test de guarda que extrae todos los `data-ev` del repo y exige que esten declarados.
- T8 passed: `touch_agent_session`/`end_agent_session` exigen `is_active_user()` (migracion 006, aplicada).
- T9 passed: webhook sin `lead_id` en la respuesta, limite por IP en la ruta GET y CORS fail-closed; 3 tests nuevos en `scripts/tests/webhook-whatsapp.test.mjs`.
- T10 passed: CORS fail-closed en las 3 edge functions (allowlist de origenes por peticion, sin `'*'`), con test que lo comprueba en los tres ficheros.
- T11 passed: 3 `console.log` de produccion fuera, wrapper `renderGestionBadge` eliminado, `citasMedio` (id inexistente) fuera, CSS `.report-controls` fuera, `tsx`/`autoprefixer` fuera de `package.json`, nombre y script `clean` corregidos, `*.bak` y `docs/security/*.html` en `.gitignore` y ZAP baseline desencriptado.
- T12 passed: `supabase/migrations/README.md` con la version vigente de cada familia (verificada comparando el cuerpo local con el `prosrc` remoto), la regla de version unica y el modelo de negocio documentado.
- T13 passed: `npm test` 721 Node + 11 Python, 0 fallos; `npm run lint` OK; `npm run build` OK; `qa-gate --strict` exit 0; revision independiente en curso.

## Progreso
- Estado: implementado y verificado LOCAL; migraciones aplicadas en el remoto con autorizacion explicita del usuario ("implementa el plan"). Sin commit ni push.
- Siguiente paso: publicar el bundle (frontend) para que los cambios de UI entren en vigor, y decidir sobre la reescritura de historial de git para la PII ya comiteada (operacion destructiva, requiere autorizacion aparte).

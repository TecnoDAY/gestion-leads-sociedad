# Cierre automatico configurable por asesora

## Objetivo

Que el administrador pueda decidir, por cada asesora (rol `agente`), si su sesion
se cierra tras 5 minutos de inactividad, sin mezclar ese control con
`Activo/Desactivar` de la cuenta.

## Problema y por que

El cierre automatico (aviso 4 min, cierre 5 min) aplica hoy a TODAS las
asesoras sin excepcion y no se puede apagar por persona. El humano pidió un
boton por asesora para desactivarlo. La desactivacion de cuenta es otro control
distinto y debe seguir funcionando siempre.

## Alcance

- Incluye: columna `idle_timeout_enabled` en `public.user_access` (default true,
  migracion nueva), accion admin en `admin_manage_user_access` (`set_idle_timeout`),
  listado con la preferencia, guardas de sesion (isIdleMonitored, comprobacion
  server-side justo antes del cierre por inactividad, no cerrar si la
  comprobacion falla), UI en Gestion de accesos (badge + boton por asesora),
  centro de ayuda actualizado, tests.
- Excluye: cambiar los 5 minutos, eliminar el registro de sesiones
  (`agent_sessions` sigue registrando actividad), aplicar la migracion en el
  proyecto remoto, desplegar, commit.

## Restricciones

- Un solo fichero de UI: `index.html`; estilos en `src/index.css`.
- Migracion nueva en `supabase/migrations/`; no modificar migraciones historicas.
- Escrituras de `user_access` solo via RPC admin (RLS sin policies de escritura).
- Fallback seguro: preferencia ausente/ilegible se trata como `true`
  (comportamiento actual).
- Reutilizar la validacion existente (focus/visibilitychange) para refrescar el
  acceso; NO anadir sondeos periodicos.

## No romper

- `Activo/Desactivar` de cuenta y su cierre de sesion inmediato en la proxima
  validacion (independiente de la preferencia).
- Telemetria de sesiones: `start_agent_session`/`touch_agent_session`/
  `end_agent_session` y el reporte `admin_agent_sessions_report` siguen
  funcionando aunque el cierre automatico este apagado.
- Roles admin/supervisor/trafficker: nunca monitoreados por inactividad.
- Check: `npm run lint`, `npm test`, `npm run build` en verde.

## TDD

Modo: off
Fuente: default (sin politica de tests de UI; el repo ya usa tests de patrones)
Runner: `npm test` (node --test scripts/tests/*.test.mjs) + lint + build

## Tareas

- [x] T1: Migracion `202610120001_user_access_idle_timeout.sql`: columna
  `idle_timeout_enabled boolean not null default true`, `admin_manage_user_access`
  con `idle_timeout_enabled` en `list` y accion `set_idle_timeout` (solo admin,
  valida booleano, bump updated_at). Criterio: patrones SQL verificados por test.
  Estado: passed (3 tests SQL en idle-timeout-preferencia.test.mjs).
- [x] T2: Sesion: `loadCurrentAccess` selecciona la columna (fallback true),
  `isIdleMonitored()` exige preferencia activa, y `endAgentSessionForIdle()`
  reconsulta el servidor antes de cerrar: si la preferencia se apago, cancela el
  cierre y limpia el banner; si la consulta falla, NO cierra por inactividad.
  Estado: passed (6 tests de guardas/telemetria en VM).
- [x] T3: UI Gestion de accesos: para filas de rol `agente`, badge
  `Cierre automatico` y boton `Desactivar cierre`/`Activar cierre` con
  `setIdleTimeout(userId, enabled)` via RPC; refresco de fila; visualmente
  separado de `Desactivar cuenta` (etiqueta renombrada). Sin confirmacion: la
  accion es reversible y el refresco deja el estado visible al instante.
  Estado: passed (2 tests de render + 1 de RPC).
- [x] T4: Centro de ayuda (`ayuda-seguridad-roles`): documentar el control por
  asesora. Estado: passed (test de texto).
- [x] T5: Verificacion completa: lint, test, build; regression del flujo
  `Desactivar` de cuenta con preferencia apagada. Estado: passed
  (`npm run lint` OK; `npm test` 395 pass / 0 fail, incluidos 13 nuevos;
  `npm run build` OK).

## Criterios de aceptacion

- [ ] Admin puede apagar el cierre automatico de Jessica sin desactivar su cuenta.
- [ ] Con preferencia apagada: sin aviso a 4 min y sin cierre a 5 min.
- [ ] `Desactivar` de cuenta sigue invalidando el acceso en ambos casos.
- [ ] Preferencia persiste entre recargas y dispositivos (esta en Supabase).
- [ ] Un no-admin no puede cambiar la preferencia (RPC lo rechaza).
- [ ] lint + test + build en verde.

## Decisiones aceptadas

- Columna en `user_access` (no localStorage): la regla es por cuenta y sigue al
  dispositivo.
- Default `true`: no cambia el comportamiento actual.
- Solo rol `agente` expone el control (plan aprobado; otros roles nunca se
  monitorean).
- Comprobacion server-side justo antes del cierre por inactividad en vez de
  sondeo periodico (menos trafico, decision del humano).
- Si la comprobacion previa al cierre falla por red, NO se cierra por
  inactividad (fail-open solo para el cierre, nunca para la autorizacion).

## Reutilizacion investigada

- existente: `admin_manage_user_access` (patron action-based admin RPC),
  `loadCurrentAccess` (select de user_access), `isIdleMonitored`/
  `restartIdleTimers`/`endAgentSessionForIdle`, `setUserActive` (patron de
  toggle admin con confirmacion y refresco), badge `.users-status`.
- canonica: misma migracion estilo del repo (begin/commit + grants + comment +
  rollback manual).
- alternativas descartadas: localStorage (no multi-dispositivo), sondeo
  periodico (trafico innecesario), realtime en user_access (canal extra sin
  necesidad: focus/visibility ya revalidan).

## Evidencia

- Migracion: `supabase/migrations/202610120001_user_access_idle_timeout.sql`
- Aplicacion remota (2026-10-13 01:28 UTC, project_ref hkkuyomlcqyxtzblowle,
  via MCP `apply_migration`, nombre `user_access_idle_timeout`): success.
- Verificacion remota read-only (`execute_sql`):
  - Columna: `idle_timeout_enabled boolean not null default true` (information_schema).
  - RPC: `pg_get_functiondef` contiene `set_idle_timeout` (posicion 1115).
  - ACL: `proacl = {postgres=X, authenticated=X, service_role=X}` — anon SIN
    execute (hallazgo 0028 del linter resuelto para este RPC; re-verificado con
    `get_advisors`: 0 hallazgos sobre admin_manage_user_access).
- Recuperacion de acceso: `keni97655@gmail.com` (admin) reactivada con
  `update ... set activo = true` (estaba `activo=false` por desactivacion
  accidental); verificado `activo=true`.
- Prueba funcional real: a los segundos de aplicar la migracion, la interfaz
  registro tres `set_idle_timeout` exitosos desde el navegador (ventasah1
  01:28:07, asesorasah 01:28:16, anasah 01:28:20 UTC): las tres asesoras
  quedaron con `idle_timeout_enabled=false` y `activo=true`. El control
  funciona de extremo a extremo.
- Tests locales: `scripts/tests/idle-timeout-preferencia.test.mjs` 13/13
  (incluye asercion del revoke a anon); `npm test` 395/395 antes del ajuste ACL.
- Nota de despliegue: frontend ya desplegado con el control; migracion aplicada
  despues — el fallback de `loadCurrentAccess` cubrio el intervalo intermedio.

## Progreso

- Estado: implementacion local completa, migracion remota aplicada y verificada
- Ultima tarea: aplicacion remota + verificacion + recuperacion de acceso admin
- Siguiente paso: el humano prueba el toggle en Usuarios; commit y resto de
  cambios sin commit solo bajo peticion explicita
- Bloqueos: ninguno

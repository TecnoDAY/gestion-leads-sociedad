# Fase 33: panel de administracion — usuarios autorizados y actividad (admin.js)

## Objetivo
Crear src/legacy/admin.js con las piezas puras del panel de admin: filas de
usuarios autorizados, filtro de busqueda, estados vacio/cargando/error,
agregacion de sesiones por asesora y mensajes de cambio de correo. Los
renderers del monolito quedan como wrappers (container.innerHTML, inputs y
RPC).

## Problema y por que
renderAuthorizedUsers y loadAgentSessionsReport contienen la ultima
plantilla mediana del monolito (~110 lineas de HTML inline y logica de
agrupacion/estados) sin tests directos. Cambiar permisos o estados de
asesora sin caracterizacion es el mayor riesgo restante del panel.

## Alcance
- `filterAuthorizedUsers(list, search)` -> array filtrado (lowercase,
  includes sobre email/nombre/role, mismo criterio que hoy) y
  `usuariosConteoText(filtered, total)` (textContent, no HTML).
- `authorizedUsersRowHtml(item)` y `authorizedUsersHtml(users)`: filas
  byte-exactas (subfila idle solo para rol 'agente', escapeAttr/escapeHtml,
  data-ev con los mismos literales).
- `authorizedUsersEmptyHtml(search)`, `authorizedUsersLoadingHtml()` y
  `authorizedUsersErrorHtml()`.
- `agentSessionsByAdvisor(sessions, now, idleLimitMs)` -> entradas ordenadas
  por actividad desc; reutiliza la regla actual (key user_id || agent_name,
  active ||= reciente, stale ||= active && !reciente, max activity).
- `agentSessionsListHtml(entries, now)` -> encabezado + lista + estado vacio
  byte-exactos; `idleMiami(ts)` pasa al modulo. (En el Alcance original se
  escribio agentSessionsHtml; la pieza final y los tests usan
  agentSessionsListHtml, corregido aqui tras el contraste T2.)
- `isRecentAgentSession(session, now, idleLimitMs)` pura (IDLE_LIMIT_MS por
  parametro).
- `changeEmailMessages` y helper `mensajeCambioCorreo(code)` exportados.

## Restricciones
Sin stage/commit/push/remoto. escapeHtml/escapeAttr se importan de
helpers.js (no duplicar). Sin window ni estado global dentro de las piezas.

## No romper
- Atributos data-ev con los mismos nombres/args escapados (escapeAttr en
  ids). El dispatcher (actions.js) debe seguir resolviendo las llamadas.
- Estados visuales: clases is-active/is-inactive, textos
  Activa/Sin actividad reciente/Sin sesion activa, 'N de M usuarios'.
- Suite, lint, build, smoke.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion: golden del HTML de filas y de la agregacion capturado de
HEAD (vm con samples: mezcla de roles agente/admin, idle on/off, sesiones
activas/stale/ended, search con acentos) antes de extraer.

## Tareas
- [x] T1: crear admin.js con piezas puras, wrappers minimos, golden y tests.
- [x] T2: contraste independiente, suite, lint, build, smoke, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [ ] renderAuthorizedUsers y loadAgentSessionsReport sin plantillas ni
  logica de agrupacion inline (solo DOM/RPC/estado de sesion).
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- Modulo nuevo admin.js: es un dominio propio (usuarios/permisos/sesiones),
  como help.js o citas.js; no va en actions.js (es el dispatcher).

## Reutilizacion investigada
- escapeHtml/escapeAttr (helpers.js), dispatcher data-ev (actions.js):
  reutilizar, no duplicar.

## Evidencia
### T1 (odd-worker, 2026-10-14) — Estado: passed
- Golden ANTES de cambiar: `scripts/tests/admin-usuarios.test.mjs` lee HEAD
  (`git show HEAD:index.html` = 898f88f) y ejecuta los wrappers del monolito en
  sandbox vm (DOM mock funcional con setter innerHTML que registra writes,
  input.value, getElementById opcional, reloj fijo 2026-10-10T18:00Z). Captura
  HEAD persistida en /tmp/opencode/fase33-golden-head.json (11 renders x
  busquedas, 3 loads, 4 sessions, 9 mensajes). Primer run pre-edicion: 13/15
  (los 2 fallos eran los tests de forma post-edicion, esperados).
- Piezas extraidas a `src/legacy/admin.js` (13 exports + registro
  `if (typeof window !== 'undefined') window.adminApi = {...}`, mismo patron
  que catalogos.js): filterAuthorizedUsers, usuariosConteoText,
  authorizedUsersRowHtml, authorizedUsersHtml, authorizedUsersEmptyHtml,
  authorizedUsersLoadingHtml, authorizedUsersErrorHtml, agentSessionsByAdvisor,
  agentSessionsListHtml, isRecentAgentSession, idleMiami, changeEmailMessages,
  mensajeCambioCorreo. escapeHtml/escapeAttr importados de helpers.js (sin
  duplicar). IDLE_LIMIT_MS entra por parametro (isRecentAgentSession/
  agentSessionsByAdvisor); test de pureza prohuebe window/document/
  IDLE_LIMIT_MS en el codigo.
- Contracto fallback mensajeCambioCorreo (registrado): el caller de HEAD hacia
  `changeEmailMessages[code] || 'No se pudo solicitar el cambio de correo.'`;
  mensajeCambioCorreo(code) conserva ese literal como default para code
  desconocido/null y mantiene la indexacion directa del monolito (incluida su
  sombra en claves heredadas). La rama catch del caller conserva su propio
  literal identico, intacta. Las dos reglas de fecha siguen siendo distintas:
  isRecent usa last_activity||started; la agrupacion usa
  last_activity||ended||started para activity.
- Wrappers: renderAuthorizedUsers/loadAuthorizedUsers/loadAgentSessionsReport
  solo con isAdmin/estado de sesion/generation, getElementById,
  container.innerHTML y lucide.createIcons(); handleChangeEmail solo cambio de
  linea a adminApi.mensajeCambioCorreo(code). Un `<script type="module"
  src="/src/legacy/admin.js">` tras el de catalogos.js. openChangeEmail/
  closeChangeEmail intactos; RPC y permisos NO tocados; nada stageado/commiteado.
- Tests adaptados via redirect sin debilitar asserts:
  idle-timeout-preferencia.test.mjs (inyecta el modulo real como adminApi en el
  sandbox; pasa tambien con --baseline), t5-frontend-edge.test.mjs (adminApi en
  el contexto frontend(); test de isRecentAgentSession con redirect
  baseline/modulo; parse-all data-ev escanea tambien admin.js para mantener el
  umbral >=14 plantillas interpoladas). session-isolation.test.mjs: sin
  aserciones de estas piezas, corre verde sin cambios.
- Verificacion (todo con el arbol ya editado):
  - node --test admin-usuarios: 15/15 passed (golden byte a byte vs HEAD en
    11 busquedas x 7 usuarios, extremos null/no-array, loads con generacion y
    contenedor ausente, sessions mezcla activa/stale/ended/begin-only, codigos
    changeEmail).
  - node --test t5 + session-isolation + idle-timeout + ficha-campos/ficha-lead/
    tabla/repetidos/catalogos/filtros-selects: 281/281 passed; t5 --baseline
    138/138 y idle-timeout --baseline 13/13 passed.
  - pnpm test: 611 passed / 0 failed (+ 11 tests python OK).
  - pnpm lint (tsc --noEmit + check-app): OK (2 bloques, 3 reglas, tema claro
    99 sobrescrituras/811 utilidades).
  - pnpm build: OK (vite 25 modulos; inline-dist 352->937 kB autocontenido con
    CSP estricta regenerada; 'adminApi' presente 9x en dist/index.html).
  - git diff --check: limpio (exit 0). Sin cambios en ficheros ajenos
    (fase-1-centro-ayuda.md y opencode.json.bak intactos).

## Progreso
Estado: T1 passed (2026-10-14, odd-worker). Sin commit: cambios en arbol de trabajo.
Siguiente tarea: T2 (contraste independiente en contexto fresco).
Bloqueos: ninguno.

## Evidencia (T2)
- Estado: passed. Verificador read-only: filas/estados/encabezados
  byte-identicos vs HEAD en vm con reloj fijo (11 busquedas x 7 usuarios +
  extremos); escapeAttr solo en user_id; subfila idle solo role 'agente' y
  default TRUE con idle_timeout_enabled undefined.
- Estado: passed. Confirmado: las dos reglas de fecha siguen deliberadamente
  distintas (isRecent: last_activity||started; activity:
  last_activity||ended||started). IDLE_LIMIT_MS=300000 queda en el monolito
  y entra por parametro; test de pureza prohibe window/document en admin.js.
- Estado: passed. changeEmailMessages (7 claves) identico y default
  'No se pudo solicitar el cambio de correo.' preservado; guards de
  generacion/RPC/p_action intocados (diff sin lineas +/- de rpc).
- Estado: passed. Golden legitimo desde git show HEAD re-derivado en vivo;
  redirects sin debilitar (t5 --baseline 138/138, idle --baseline 13/13,
  scanner data-ev umbral >=14 sin reducir, ahora incluye admin.js).
- Estado: passed. Suite 611/611 Node + 11 Python; 251/251 en los 5 ficheros
  dirigidos; lint OK; build OK (worker: 937 kB autocontenido, adminApi 9x);
  diff-check limpio. Nota: el prompt decia 9 literales del mapa (son 7,
  identicos a HEAD); nombre del doc corregido a agentSessionsListHtml.
- Estado: pending. T3 revision visual humana y ZAP separado.

## Progreso
Estado: implementada y contrastada independientemente; sin commit
(2026-10-14). Siguiente tarea: T3 (visual humana y ZAP).
Bloqueos: ninguno.

## Progreso (cierre)
Estado: passed T3-visual. El humano reviso el panel de usuarios/actividad en
preview y confirmo "todo fue corregido y funciona" (2026-10-14), junto con
los dos fixes de regresiones (cierre del panel y nonce CSP del calendario).
ZAP del tramo queda pendiente (se lanza tras commitear).

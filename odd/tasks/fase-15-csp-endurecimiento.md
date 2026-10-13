# Fase 15: endurecimiento CSP (sin unsafe-inline) con dispatcher de eventos

## Objetivo
Eliminar `unsafe-inline` de la CSP manteniendo el artefacto autocontenido:
los handlers inline migran a un dispatcher por delegacion (data-ev) y los
bloques inline restantes se autorizan por hash generado en el build via meta
CSP, sin reescribir vercel.json en cada build.

## Problema y por que
ZAP reporta 34 Medium estables: `CSP: script-src unsafe-inline` y
`CSP: style-src unsafe-inline`. La causa: 2 bloques inline fijos + 1 bundle
inline + 1 style inline en dist, y 170 atributos on*= (estaticos y en
plantillas) de los que ~20 interpolan valores en runtime (los hashes de
build no cubren handlers dinamicos).

## Alcance
- `src/legacy/actions.js`: dispatcher por delegacion. Formato del atributo:
  `data-ev="tipo[,tipo2]:cuerpo"` donde cuerpo es UNA llamada con literales
  (string/numero/bool/null) y opcionalmente `this`/`event`. El tokenizer
  rechaza lo demas (sin eval/Function). Eventos: click, change, input,
  submit, focus, blur, pointerenter.
- Migracion mecanica de los 170 on*= de index.html + 2 de
  src/legacy/help.js a data-ev, preservando el cuerpo; compuestos
  multi-statement/ternario sustituidos por wrappers nuevos del modulo
  (cycleTheme, toggleAdminUsers, openLeadFromView, openEditLeadFromView,
  focusPeriodoTip, stopPropagationEvent, formatPhoneField,
  formatPhoneFieldAndCheck) cuyo `this`/event lo resuelve el dispatcher.
- inline-dist.mjs: tras el inlining calcula SHA-256 de cada bloque
  script/style final y escribe un `<meta http-equiv="CSP">` proximo al
  inicio de `<head>` (antes de cualquier script inline). Sin unsafe-inline.
- vercel.json: la cabecera HTTP deja de llevar fetch-directives de
  script/style/default (bloquearian lo que el meta permite por
  interseccion); conserva frame-ancestors 'none' (el meta lo ignora),
  form-action, base-uri y el resto de cabeceras de seguridad.
- vite dev: server.headers con una CSP relajada documentada para HMR; la
  politica estricta se ejercita con `pnpm preview` (sirve dist+meta).
- Guardia de build: los hashes del meta deben coincidir con dist y no debe
  quedar ningun on*= en dist; fallos rompen el build.
- Tests: actions.test.mjs (tokenizer, dispatcher), t5 parse-all de data-ev
  en el HTML renderizado, security-headers actualizado, check-app sin
  onclick=.

## Restricciones
- Sin push/merge/deploy sin peticion explicita; sin tocar trabajo ajeno.
- index.html (fuente) conserva los 2 bloques inline Fijos sin cambiar su
  contenido (el hash depende del byte exacto).
- La revision visual del humano es requisito de cierre.

## No romper
- Comportamiento de todos los botones/controles del panel (hoy via
  handlers inline; manana via dispatcher resolviendo las mismas globals).
- El contracto autocontenido del README (dist/index.html funciona
  standalone incluso en file://; el meta CSP aplica alli tambien).
- Suite completa (482+ scripts tests), lint, build y smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- Acciones con checks funcionales obligatorios; la migracion del dispatcher
  se caracteriza con tokenizer + parse-all en el sandbox t5.

## Tareas
- [ ] T1: inventario de handlers y formas (hecho en chat; evidencia abajo).
- [ ] T2: actions.js + tests del tokenizer/dispatcher (sin eval).
- [ ] T3: wrappers en el bloque principal, registro en window y reescritura
  mecanica de los 170+2 atributos; add <script> de actions.js.
- [ ] T4: CSP estricta: meta en inline-dist, vercel.json reducida, vite
  dev documentado, guardias y tests de cabeceras actualizados.
- [ ] T5: suite completa, lint, build, smoke con preview, ZAP pasivo.
- [ ] T6: revision visual del humano y registro de residual.

## Criterios de aceptacion
- [ ] Sin atributos on*= en index.html/help.js (y en dist).
- [ ] vercel.json sin unsafe-inline y con frame-ancestors 'none'.
- [ ] meta CSP en dist/index.html con hashes verificados en build.
- [ ] Suite/lint/build/smoke verdes; ZAP sin las 34 Medium de CSP.

## Decisiones aceptadas
- Hashes de build solo para bloques script/style inline; los handlers
  migran a delegacion porque ~20 interpolan valores en runtime (hashes
  inviables).
- La CSP estricta vive en un meta generado por inline-dist (fuente unica
  del artefacto) y vercel.json conserva solo frame-ancestors y lo
  non-fetch; se reduce el riesgo de cabeceras desincronizadas.
- Dev queda con CSP relajada (HMR correcto); la politica estricta se
  valida via preview.

## Reutilizacion investigada
- #no hay dispatcher previo; el patron closest('[data-ev]') es estandar.
- inline-dist.mjs ya centraliza el artefacto final: ahi se anade el meta.
- check-app.mjs y security-headers.test.mjs ya ejercen cabeceras y
  reglas; se actualizan en vez de duplicar.

## Evidencia
- T1: 170 attrs on*= en index.html (159 genericos + compuestos) y 2 en
  help.js; formas especiales identificadas y envueltas.
- T2: `src/legacy/actions.js` (tokenizer sin eval, soporta literales,
  this/event, this.value) + `scripts/tests/actions.test.mjs` 6/6.
- T3: migracion mecanica a data-ev (170 + 2; 0 on*= restantes); wrappers
  formatPhoneField/AndCheck, cycleTheme, toggleAdminUsers,
  openLeadFromView, openEditLeadFromView, focusPeriodoTip,
  stopPropagationEvent, saveCampaignStatFromData; loadLeadNotes ahora
  `leadId = currentViewId`; actions.js cargada como modulo y autoadjunta.
- Hallazgos corregidos en el camino:
  (1) `scrollHelpToTop` nunca se registro en window (boton Volver arriba
  muerto desde la extraccion) -h ahora registrado;
  (2) el valor onclick de saveCampaignStat tenia comillas dobles internas
  que cortaban el atributo (boton Guardar de campanas roto silenciosamente
  en el markup) -h data-ev con encodeURIComponent + wrapper que decodifica;
  (3) `loadLeadNotes(currentViewId)` usaba una variable de clausura no
  alcanzable por handlers - h default param;
  (4) file:// con meta CSP tiene origen nulo: 'self' no matchea y las 4
  fuentes woff2 locales quedarian bloqueadas al abrir el archivo directo;
  inline-dist las incrusta como data:font/woff2 base64 (artefacto de un
  unico fichero, 942 kB) con guardia de no-restos url(./fonts/...).
- T4: `scripts/csp-utils.mjs` (bloquesInline, cspHtml, insertarMetaCsp,
  problemasCsp comparando meta existente vs hashes actuales) con tests
  5/5; inline-dist inserta el meta tras <head> (antes del primer script
  inline) y rompe build si hay on*=, unsafe-inline o hashes
  desincronizados; vercel.json sin fetch-directives de script/style
  (solo frame-ancestors 'none', form-action, base-uri) y suite
  security-headers actualizada; vite dev con CSP relajada documentada
  (la estricta se ejercita en preview) y preview usa la reducida + meta.
- T3-check: parse-all en t5 (estaticos>120 y plantillas interpoladas>=14)
  137/137 test pasan; check-app prohibe on*= y unsafe-inline en fuente.
- T5: suite 495/495 Node + 11 Python, lint (tsc + check-app, 3 reglas),
  build final 942 kB con guardia LIMPIA (meta antes del 1er script, 3
  hashes de script + 1 de style), preview 4173: 200 con cabecera HTTP
  reducida y meta con hashes; revision visual del humano confirmada
  ("todo sigue funcionando").
- ZAP pasivo de esta fase: contra `http://127.0.0.1:4173/` (preview del
  artefacto, no el dev relajado) con daemon MCP en 8080: INCOMPLETO.
  Spider llego a 100% (19 URL, reglas seguras 50001/40100 desactivadas,
  10038/10055 activas) pero el daemon cayo (connection refused) antes de
  drenar la cola pasiva; no se recolecto alertas y el log no se escribio.
  Estado: auditoria pendiente de re-escaneo cuando haya daemon; NO se
  puede declarar limpia. Revision visual del humano confirmada.

## Progreso
- Estado: implementada, verificada localmente (suite, lint, build, humo,
  revision visual confirmada) y commit atomo aprobado por el humano
- Ultima tarea: registro del ZAP de la fase
- Siguiente paso: re-escaneo ZAP cuando el daemon vuelva; push solo con
  orden explicita; correccion del reporte diario (ver fase 16)
- Bloqueos: ZAP daemon caido en el cierre (evidencia incompleta); sin
  escaneo autenticado; HMR dev sin validar interactivo

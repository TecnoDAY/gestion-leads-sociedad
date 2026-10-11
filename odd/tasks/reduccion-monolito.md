# Feature: Reduccion del monolito index.html (strangler)

## Objetivo
Reducir la deuda del monolito index.html (8.134 lineas) en tramos atomicos
incrementales, sin romper comportamiento, hasta dejar el caparazon con HTML,
estilos y funciones de arranque, con la logica en src/ por areas.

## Problema y por que
Tocar una vista puede romper otra; el CSS inline compartido amplifica el
riesgo. Los tests actuales no cubren el DOM de index.html, por lo que un
refactor grande no estaria protegido. El usuario aprobo el plan strangler
congelar -> logica pura -> areas.

## Alcance
- Incluye: decision de gestor de paquetes, purga de codigo muerto (React no
  usado), regla de congelacion, extraccion de logica pura, modulos por area
  (citas, reportes, leads/historico) exponiendo la misma API global via
  window, actualizacion de check-app si se mueve el CSS.
- Excluye: reescribir plantillas HTML a React/JSX, cambios de comportamiento,
  migraciones Supabase, reescritura del CSS tematico.

## Restricciones
- Cada tramo: check-app + tsc + tests + build + qa-gate --strict en staged.
- Ninguna feature nueva crece index.html (regla de congelacion).
- No renumerar tareas; 1 tramo por sesion como maximo.
- Patron canonico: modulos con funciones puras exportadas + registro en
  window.citasCalendarApi (ver src/citas-calendar.js) como referencia.

## No romper
- check-app: node --check por bloque, sin catch vacios, cobertura tema claro.
- Comportamiento observable de las pantallas (Citas, Leads, Reportes).
- pnpm como unico gestor (bun.lock eliminado).

## TDD
- Modo: off | Fuente: default | Runner: node --test scripts/tests/*.test.mjs
- Tests unitarios nuevos acompanan cada extraccion (cobertura de caracterizacion).

## Tareas
- [x] T0: Higiene: pnpm canonico (borrar bun.lock), purgar React muerto
  (src/App.tsx, src/main.tsx, deps react/react-dom/lucide-react/motion/
  @google/genai/@vitejs/plugin-react, plugin en vite.config), regla de
  congelacion documentada. Checks: check-app, lint, test, build.
- [x] T1: Extraer logica pura compartida (escapeHtml, getField, fechas
  Miami, mapeos) a src/legacy/ con tests; index.html consume via module que
  registra globals. Verificar orden de carga y llamadas inmediatas.
- [x] T2: Area Citas a src/legacy/citas.js (mismo patron de T1).
- [x] T3: Area Reportes a src/legacy/reportes.js.
- [x] T4: Area Leads/Historico a src/legacy/leads.js.
- [x] T5 (opcional): CSS inline a src/index.css actualizando check-app antes.

## Criterios de aceptacion
- pnpm unico gestor; sin referencias a React/JWT muertos en package.json.
- Cada tramo mantiene 100% de checks verdes y comportamiento observable.
- Lineas de index.html decrecen tramo a tramo sin perder funcionalidad.

## Decisiones aceptadas
- pnpm como gestor canonico (elegido por el humano; bun no instalado aqui).
- Strangler por capas, no reescritura React (YAGNI).

## Reutilizacion investigada
- existente: src/citas-calendar.js (patron modulo + window API + tests),
  check-app.mjs (guardian del monolito), scripts/tests (node:test).
- alternativas descartadas: reescritura React, refactor grande por areas,
  mantener dual-lockfile.

## Evidencia
- T1 (worker interrumpido a medias -> completado inline; el worker dejó 9 scripts
  python basura ya eliminados y CORRUPCIÓN por decodificación de entidades HTML en
  helpers.js y en su test: escapeHtml/escapeAttr tenían replaces no-op y el test
  esperaba salida sin escapar — regresión XSS silenciosa). Correcciones inline:
  entidades reconstruidas vía char-codes (el editor decodifica &/</>/"
  en tránsito; lección documentada), aserciones del test reparadas, Syntax OK.
  Resultado: src/legacy/helpers.js (137 líneas, 8 funciones puras exportadas +
  registro window con guard); index.html -72 líneas (8062; definiciones originales
  fuera, llamadas intactas vía window); module tag añadido (línea ~8060); tests
  de caracterización nuevos (20) + 3 suites adaptadas para inyectar los helpers
  en sandbox VM. Checks: check-app OK, tsc OK, 304/304 tests node, unittest OK,
  build OK.
- T0 (inline, autorizada por "implementa el plan"; trabajado en rediseno-visual-bloque-14
  sobre 841d2af): eliminados src/App.tsx, src/main.tsx (sin referencias previas),
  bun.lock; package.json reducido de 13 a 7 dependencias (fuera react, react-dom,
  lucide-react, motion, @google/genai, @vitejs/plugin-react y sus @types);
  vite.config.ts sin plugin react; tsconfig sin jsx/allowImportingTsExtensions.
  Verificacion: check-app OK (99 overrides light), tsc OK, 283/283 tests node,
  unittest OK, build OK (chunks FullCalendar intactos), React ausente de node_modules.

- T2 (inline, fallback documentado de T1; sin worker para evitar la corrupcion
  de entidades detectada): 6 funciones puras de Citas extraidas a
  src/legacy/citas.js (appointmentDate, appointmentInputISO con comentario DST,
  appointmentLocal, appointmentBadge, citasDateDefaults, citasEventsFromRows).
  Diferencia de diseño: importan directamente helpers.js/citas-calendar.js
  (no via window) para seguir testeandose en node; citasEventsFromRows ahora
  usa los imports miamiNaive/addMinutesNaive/advisorColor en lugar de
  window.citasCalendarApi (equivalente, mas fiable). index.html: -46 lineas
  (8016 total), module tag citas.js añadido, llamadas intactas via window.
  t5-frontend-edge adaptado: 3 nombres fuera del extract list + import +
  inyeccion en contexto vm. Nuevo citas-helpers.test.mjs (16 tests de
  caracterizacion; DST de appointmentInputISO cubierto). Un test propio
  corregido por no determinista (colision de hash) y una asercion de formato
  es-ES (año 2 digitos). Checks: check-app OK, tsc OK, 321/321 tests,
  unittest OK, lint OK, build OK.

- T3 (inline, fallback documentado): 18 miembros puros de Reportes/Historico/
  Campanas extraidos a src/legacy/reportes.js (MONTH_CHRONO, GESTION_STATE_GROUPS,
  parseFechaLead, normalizeLeadMonth, leadReportDate, isInscritoDataDura,
  histMonthKey/Label, sortHistMonthKeys, normalizeGestion, groupGestionEstado,
  periodoPresetRange, periodoValidDate, periodoPct, csvReporteField,
  campaignCosteResultado, campaignTotals, totalCanalesVisibles).
  index.html: -122 lineas (7894 total), module tag añadido, llamadas intactas.
  Inyeccion de reloj: periodoPresetRange(preset, today = miamiToday()) — los
  tests que stubbean miamiToday en sandbox usan wrappers que leen el reloj del
  contexto dinamicamente (t5, session-isolation); campaign-monthly-rollup
  importa parseFechaLead del modulo en vez de recortarlo del HTML por indice.
  Errores corregidos en el camino: (1) param today duplicado con const del
  cuerpo (SyntaxError, detectado por build/tests); (2) 3 tests rotos por el
  reloj real tras la extraccion (diseno, no bug). Nuevo reportes-helpers.test.mjs
  (26 tests). Checks: check-app OK, tsc OK, 350/350 tests, unittest OK, lint OK,
  build OK.

- T4 (inline, fallback documentado): 10 helpers puros de Leads extraidos a
  src/legacy/leads.js (sortMonthCatalog, normalizePhone, isNuevoEsteMes con
  parametro de reloj inyectable, nuevoBadge, formatPhone, compareLeadIdsDescending,
  withOrigin, getLeadOrigin, haveSameLeadIds, isAgendadoGestion) + validAppointmentId
  devuelto a src/legacy/citas.js (su area). index.html: -61 lineas (7833 total),
  module tag leads.js, llamadas intactas via window. t5 y session-isolation
  adaptados (nombres fuera del extract list + import + inyeccion; wrapper de
  reloj para isNuevoEsteMes igual que periodoPresetRange). Errores corregidos:
  (1) mi test de sortMonthCatalog asumia normalizacion del valor de salida — la
  funcion canonica preserva el primer valor original (caracterizacion, no bug);
  (2) t5 assert sobre markup Nuevo en HTML — movido a comprobar el modulo fuente;
  (3) reloj real vs stub en t5 — wrapper dinamico. Nuevo leads-helpers.test.mjs
  (18 tests). Checks: check-app OK, tsc OK, 367/367 tests, unittest OK, lint OK,
  build OK.

- T5 (inline, fallback documentado): bloque <style> inline (846 lineas) mudado
  a src/index.css tras @theme (el orden respeta el original: tailwind primero,
  overrides despues); index.html: 7833 -> 6988 lineas (-845). check-app.mjs
  actualizado: el analisis de cobertura del tema claro lee src/index.css en vez
  del bloque <style> del HTML (el escaneo de utilidades usadas sigue sobre el
  HTML, ahora sin bloque que excluir). t5 adaptado: las aserciones de CSS del
  tip del periodo apuntan a src/index.css. Verificado en build: las overrides
  [data-theme] llegan al CSS compilado (Lightning CSS elimina las comillas del
  atributo: data-theme=light). Errores corregidos: ninguno de codigo; una
  falsa alarma resuelta con verificacion del dist. Checks: check-app OK
  (99 overrides light), tsc OK, 367/367 tests, unittest OK, lint OK, build OK.

## Progreso
- Estado: cerrada (T0-T5 completos)
- Ultima tarea: T5 completada y verificada
- Siguiente paso: commit/push bajo orden explicita del humano; T2 pendiente
  opcional de futuro: modulos de area con estado (loadCitas/renderCitas) exigen
  inyeccion de dependencias mas profunda — fuera del alcance aprobado
- Bloqueos: ninguno
- Bloqueos: ninguno

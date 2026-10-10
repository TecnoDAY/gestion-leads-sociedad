# Feature: Vista calendario en Citas

## Objetivo
Añadir a la sección Citas un selector Lista / Día / Semana / Mes con calendario
(hora por día, columnas por día de semana, resumen mensual), color estable por
asesora con leyenda, reutilizando los datos, filtros y permisos actuales.

## Problema y por qué
La tabla actual saturada no permite ver la agenda del equipo en el tiempo ni
comparar carga por asesora de un vistazo. El usuario pidió explícitamente una
vista tipo calendario tipo Nido Inmuebles conservando la vista lista actual.

## Alcance
- Incluye: toggle Lista/Día/Semana/Mes en #viewCitas; navegación Hoy/◀/▶ y
  título del período; eventos clickables que abren la ficha del lead; color por
  asesora (asesor_user_id) + leyenda; estado de la cita como texto/clase (no
  color); tema claro y oscuro; móvil (día/mes por defecto); estados de carga,
  vacío y error del chunk; test unitario de helpers puros.
- Excluye: arrastrar para reprogramar, bloqueo de horarios, duración real de la
  cita (no existe ends_at), migraciones a Supabase, cambios en RLS/API.

## Restricciones
- FullCalendar v6.1.21 (core+daygrid+timegrid) vía npm, empaquetado por Vite y
  cargado en chunk bajo demanda al activar el calendario. NO usar CDN.
  NO usar v7: daygrid/timegrid no tienen release 7.x (verificado npm 2026-10-10).
- Horas "naive" en zona Miami (strings YYYY-MM-DDTHH:mm), sin plugin timezone;
  nowIndicator desactivado; duración visual fija de 60 min (fin = inicio + 60
  min con aritmética UTC pura, nunca re-parseando en zona del navegador).
- Solo utilidades Tailwind que check-app reconozca como cubiertas por
  [data-theme="light"] (bg-slate-800/700, border-slate-700/600, text-slate-*,
  bg-indigo-600) o CSS propio con overrides oscuro/claro.
- Seguir el estilo del monolito: funciones globales en el script clásico,
  comentarios en español explicando el porqué, sin acentos en nombres.

## No romper
- La tabla actual de citas, sus filtros, KPIs, cache y invalidaciones
  (resetCitasPanel/invalidateCitasCache/clearCitasResults/loadCitas).
- Invocación existente: openViewLeadModal(Number(leadId), 'actual').
- Checks del repo: `npm run check:app`, `npm run lint`, `npm test`,
  `npm run build` deben pasar.
- Permisos: ningún dato nuevo que no esté ya en citasCache.

## TDD
- Modo: off | Fuente: default | Runner: node --test scripts/tests/*.test.mjs
- Checks funcionales obligatorios al cierre de cada tarea: check-app, lint,
  build (y test donde aplique).

## Tareas
- [x] T1: Instalar @fullcalendar/core|daygrid|timegrid@6.1.21; crear
  src/citas-calendar.js (módulo que registra window.citasCalendarApi y carga
  FullCalendar con import() dinámico); añadir <script type="module"
  src="/src/citas-calendar.js"></script> en index.html; UI del selector
  Lista/Día/Semana/Mes + barra de navegación + contenedor oculto del calendario
  en #viewCitas; visibilidad solo con sesión activa heredada.
  Checks: check-app, lint, build OK.
- [x] T2: Integración de datos: helpers Miami-naive y fin+60min exportables;
  paleta de colores por asesora (hash djb2 estable) + leyenda; mapeo de
  citasCache filtrado a eventos; al final de renderCitas() sincronizar el
  calendario (mínima intrusión); datesSet -> sincroniza citasDesde/citasHasta
  al rango visible y llama loadCitas() con guardia anti-bucle; eventClick ->
  openViewLeadModal(id,'actual'); ocultar Desde/Hasta en modo calendario.
  Checks: unit test scripts/tests/citas-calendar.test.mjs (hash estable,
  fin+60 con rollover de medianoche, conversión Miami), lint, test, build.
- [x] T3: Estados y acabado: spinner "Cargando calendario…", error con
  Reintentar si falla el chunk; día por defecto en <640px; overrides CSS
  claro/oscuro coherentes con [data-theme]; altura mínima móvil; foco visible.
  Checks: check-app, lint, build, test.

## Criterios de aceptación
- En Citas aparece el selector y por defecto sigue la Lista intacta.
- Día/Semana/Mes muestran las citas con color por asesora y leyenda.
- Hoy/◀/▶ navegan y cargan el rango visible; los filtros (resultado, sede,
  campaña, medio, asesora) se aplican también al calendario.
- Click en cita abre la ficha del lead existente.
- Temas claro/oscuro correctos; en móvil se puede usar sin scroll horizontal en
  día y mes.
- npm run check:app, npm run lint, npm test y npm run build pasan.

## Decisiones aceptadas
- v6.1.21 (v7 descartada: sin daygrid/timegrid 7.x en npm).
- Naive Miami sin plugin timezone; nowIndicator off; duración visual fija 60m.
- Colores derivados por hash estable (djb2) de palette fija, no guardados en BD.
- Calendario de solo lectura en v1 (sin drag & drop).

## Reutilización investigada
- existente: citasCache, loadCitas, renderCitas, miamiToday,
  appointmentLocal, openViewLeadModal(leadId,'actual'), escapeAttr, estilos
  appointment-*.
- canónica: FullCalendar v6 (doc oficial legacy.fullcalendar.io/v6
  initialize-es6; v6 inyecta su CSS, sin imports de hoja de estilos).
- alternativas descartadas: CDN (dependencia externa), calendario propio
  (riesgo de bugs de fechas), React (reescritura innecesaria), FullCalendar v7
  (ecosistema de plugins incompleto).

## Evidencia
- T1 (worker ses_ed944957fffejibm35tFUcxBPq, verificador ses_ed9037a69ffea0tK4oVB3y85IA, ambos RESULT: success):
  deps 6.1.21 exactas en package.json; src/citas-calendar.js con window.citasCalendarApi
  (ensureCalendar con import dinámico core+daygrid+timegrid); index.html con script module,
  #citasViewBar (Lista/Día/Semana/Mes, aria-selected), #citasCalendarNav, #citasCalendarWrap,
  #citasCalendarLegend, #citasCalendar, #citasCalendarMsg, setCitasViewMode y citasCalendarNav
  globales sin catch vacío; check-app OK (98 sobrescrituras light), tsc --noEmit OK,
  npm run build OK con chunks separados core 169 kB / timegrid 29 kB (carga bajo demanda real),
  lint OK.
- Corrección post-T1 (inline, autorizada por "corrige los errores"): @vitejs/plugin-react
  fijado a 6.1.1 exacto (6.1.2 se publicó con dependencia rota "workspace:*" que rompe npm
  y cualquier resolución estricta); árbol reinstalado con pnpm 11.28.5 (bun no instalado en
  esta máquina; bun.lock queda intacto y desactualizado — decisión de gestor canónico pendiente
  del humano antes de cualquier commit); pnpm-lock.yaml regenerado coherente.
- T2 (worker ses_ed8f3bdf5ffeg0W9U7wmIx1473, verificador ses_ed8ea8e23ffetSLKOcqO7jOKJk,
  ambos RESULT: success): puras miamiNaive/addMinutesNaive/advisorColor exportadas y testeadas
  (12/12), API window.citasCalendarApi completa (updateEvents/setView/getTitle/getViewRange,
  ensureCalendar con onRangeChange/onEventClick), citasEventsFromRows mapea citasCache filtrada
  con color por advisor_user_id||advisor_name, renderCitas extendido solo con llamada final,
  leyenda con DOM seguro (sin XSS), eventClick -> openViewLeadModal(id,'actual') idéntico al
  botón Ver ficha, guardia anti-bucle en onRangeChange, eventos vía scheduled_at con Miami-naive
  (sin new Date del navegador). npm test 274/274.
- T3 (worker ses_ed8e689f9ffe5yjZnXiJdDfTnL, verificador ses_ed8e0b789ffeCJKz7R00iUVgvb,
  ambos RESULT: success): 'Cargando calendario…' + botón Reintentar (textContent/createElement,
  catch con await real, sin unhandled rejection), móvil <640px fuerza vista día (comentado),
  min-height 70vh móvil / 42rem escritorio, overrides .fc dark/[data-theme=light] (bordes,
  encabezados, .fc-day-today indigo suave, .fc-event redondeado, sin .fc-button),
  #citasCalendarWrap role=region aria-label aria-live=polite, chips leyenda aria-hidden.
  Checks finales verificados read-only: check-app OK (99 overrides light), tsc OK,
  citas-calendar.test.mjs 12/12, lint OK, build OK (chunks core 169 kB / timegrid 29 kB /
  daygrid 0.45 kB separados).
- Fix runtime (reportado por el humano con captura: "No se pudo cargar el calendario"):
  ensureCalendar desestructuraba `default` de @fullcalendar/core, pero Calendar es export
  CON NOMBRE (verificado en runtime: core.default=undefined, core.Calendar=function; tsc
  no lo detecta porque allowJs sin checkJs no valida propiedades en .js). Corregido a
  `[{ Calendar }, { default: dayGridPlugin }, { default: timeGridPlugin }]` + comentario
  del porqué. Añadido test de contrato de imports en citas-calendar.test.mjs (Calendar
  nombrado sin default; plugins con default) para convertir esta clase de error en rojo
  pre-merge. Re-verificado: check-app OK, tsc OK, 276/276 tests, build OK con chunks.
- Fix 2 (reportado por el humano con captura: calendario renderiza pero toast
  "Rango de fechas no válido", sin citas ni leyenda): datesSet/getViewRange emitían
  naive CON hora ('YYYY-MM-DDTHH:mm'); un <input type="date"> sanea cualquier valor
  con hora a '', dejando citasDesde vacío y bloqueando loadCitas -> 0 datos. Añadido
  helper puro toMiamiDay() (ISO/Date -> 'YYYY-MM-DD' Miami) usado en datesSet y
  getViewRange (contrato día-only documentado) + 3 tests de regresión (sin hora,
  Date y cruce medianoche UTC->Miami, inválidos). getViewRange no tiene otros
  consumidores en index.html. Re-verificado: check-app OK, tsc OK, 279/279 tests,
  build OK, qa-gate --strict OK.

## Progreso
- Estado: cerrada (verificación completa; pendiente chequeo visual del humano y decisión de gestor de paquetes antes de commit)
- Última tarea: T3 implementada y verificada read-only
- Siguiente paso: humano prueba la vista en navegador; decidir gestor canónico (pnpm aquí vs bun.lock del repo); commit solo bajo petición explícita
- Bloqueos: ninguno

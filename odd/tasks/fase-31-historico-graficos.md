# Fase 31: historico — tabla y configuraciones de los 8 graficos a reportes.js

## Objetivo
Extraer de renderHistoricalAnalytics las piezas puras: filas de la tabla
resumen (tablaHistoricoHtml), estado vacio y las 8 configuraciones de
Chart.js como funciones que devuelven objetos (sin tocar canvas); el
wrapper queda con ctx/canvas y new Chart.

## Problema y por que
Los datos ya viven en reportes.js (historicalChartSeries, historicalKpiTotals,
historicalSummaryRows, histRangeNoticeText), pero lasplantillas de la tabla
y los objetos de configuracion (monthly/conversion/campaign/medio/agent/
monthlyStates/monthlyCampaigns/funnel) siguen inline: cerca de 190 lineas
sin tests directos, el mayor bloque restante del monolito.

## Alcance
- `tablaHistoricoHtml(filas)` + `tablaVaciaHistoricoHtml()`: marcado exacto
  del bloque resumen y del estado vacio (colspan 9).
- `histChartConfigs({ series, kpis, monthLabels, ... })` u ocho funciones
  `histChartLoginX` que devuelven el objeto { type, data, options }
  EXACTO de cada grafico, yendo por parametros los datos ya preparados
  (historicalChartSeries) y la paleta fija si la hay.
- El wrapper renderHistoricalAnalytics queda con: canvas getElementById,
  new Chart(..., histChartX(...)), destruccion previa (histCharts) y
  escritura de la tabla.

## Restricciones
Sin stage/commit/push/remoto. Los chart config no deben referenciar window
ni Chart: son objetos puros testeables via node.

## No romper
- Colores/labels/tooltip/scales byte a byte (t5 golden y revision visual;
  Chart.js no cambia resultado con configs equivalentes).
- Suite, lint, build, smoke.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion via deepEqual de configs contra captura del HEAD (patron
golden de fase 30). RED por export ausente.

## Tareas
- [x] T1: extraer letras/configs con registro window, caracterizar y
  adaptar sandboxes.
- [x] T2: contraste independiente, suite, lint, build, smoke, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [ ] renderHistoricalAnalytics sin configs inline de Chart.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- El destruido previo y los canvas quedan en el wrapper (DOM de Chart.js).

## Reutilizacion investigada
- historicalChartSeries, historicalKpiTotals y historicalSummaryRows ya
  viven en reportes.js; no duplicar computos.

## Evidencia
- T1 (2026-10-14): extraidas 11 piezas puras a src/legacy/reportes.js —
  tablaHistoricoHtml, tablaVaciaHistoricoHtml y las 8 configs
  (histChartMonthly/Conversion/Campaign/Medio/Agent/MonthlyStates/
  MonthlyCampaigns/Funnel) con paletas inline movidas a reportes.js; el
  wrapper renderHistoricalAnalytics quedo con canvas/getElementById,
  destruccion previa histCharts, chartTheme/commonScales (DOM/tema) y
  new Chart(ctx, histChartX(...)). Nombres y estructura de options intactos.
- Tests: scripts/tests/historico-graficos.test.mjs (8 tests, patron golden
  fase 30): render de HEAD vs arbol en sandbox vm con Chart simulado que
  registra configs, coincidencia byte a byte en 3 samples (leads actuales,
  tipo historico, vacio) + tabla/empty 9 cols + destroys de re-render + mock
  funcional sin Chart.js. Estado: passed (8/8).
- Adaptados: t5-frontend-edge.test.mjs (inyeccion de los 10 nuevos exports
  en la sandbox frontend; sus tests de tabla/historico existentes siguen
  pasando). session-isolation.test.mjs no requeria cambio (stub).
- Verificacion: node --test nuevos + historicos + t5 + session-isolation:
  271 pass. pnpm test completo: 587 pass. pnpm lint OK (check-app OK).
  pnpm build OK (dist 365.83 kB). git diff --check OK. Sin stage/commit.

## Progreso
Estado: autorizado por continuacion del paso natural (2026-10-14).
T1: passed (2026-10-14). Siguiente tarea: T2.
Bloqueos: ninguno.

## Evidencia (T2)
- Estado: passed. Verificador read-only: 8 configs byte a byte (paletas,
  tooltips, callback `val + '%'`, stacked huespes inline, chart mixto sin
  type top); tabla y empty byte-exactos (colspan 9); wrapper conserva
  destroy() previo de los 8, canvas/chartTheme/commonScales en wrapper
  (DOM) y escritura de tabla; golden desde git show HEAD (no sobreajuste,
  sandbox simuladas); t5 solo inyeccion aditiva.
- Estado: passed. historico-graficos 8/8 (222 relevantes t5+iso), suite
  completa 587/587 Node + 11 Python, lint OK, git diff --check limpio.
  Build ejecutado por worker (dist 365.83 kB), no repetido por
  verificador (read-only).
- Estado: pending. T3 revision visual humana y ZAP del tramo no
  ejecutados.

## Progreso
Estado: implementada y contrastada independientemente; sin commit
(2026-10-14). Siguiente tarea: T3 (visual humana y ZAP separado).
Bloqueos: ninguno.

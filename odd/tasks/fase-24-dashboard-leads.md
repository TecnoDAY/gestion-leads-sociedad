# Fase 24: KPIs y matriz del dashboard a leads.js

## Objetivo
Extraer a src/legacy/leads.js las metricas del dashboard (contadores y
porcentajes), la eleccion del subtitulo del KPI de total y la matriz
cruzada gestion x campana (thead/tbody/tfoot); los wrappers escriben DOM.

## Problema y por que
updateKpis y renderMatrix mezclan DOM con computos puros (conteos por
GESTION, porcentajes, agregados por celda/columna y plantillas con clases
por estado). Es el nucleo analitico del dashboard y no tiene tests directos.

## Alcance
- `metricasLeads(leads)`: { total, agendados, inscritos, conversion,
  agendadosPct } con las mismas reglas (GESTION contiene 'agendad' /
  'inscrit', toFixed(1) y 0.0 sin leads).
- `subtituloKpiTotal(ctx)`: mismas ramas y textos (rango dash presente,
  mes sin historico, filtros activos con visibles cargados, else por
  batch).
- `matrizLeadsHtml(leads)`: { thead, tbody, tfoot } con orden alfabetico
  compareAlphaEs, 'Sin Definir'/'General', clases por estado, '-' en ceros,
  totales por fila/columna y gran total.
- Los wrappers updateKpis/renderMatrix quedan escribiendo nodos.

## Restricciones
- HTML byte a byte identico (t5 y revision visual son el golden).
- Misma rama; sin push/merge/deploy; sin trabajo ajeno.

## No romper
- Filtrado desde la matriz por data-matrix-* (data-ev delegado ya existia).
- Suite, lint, build y smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test

## Tareas
- [ ] T1: caracterizar las tres piezas (RED).
- [ ] T2: extraer a leads.js con registro window; wrappers; inyecto en
  t5/session-isolation.
- [ ] T3: suite, lint, build, smoke.

## Criterios de aceptacion
- [ ] Sin conteos ni plantillas de KPIs/matriz en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- Los porcentajes se devuelven ya formateados (fidelidad con el DOM actual).
- getVisibleBaseLeads().length entra como parametro en el subtitulo.

## Reutilizacion investigada
- compareAlphaEs, escapeHtml/escapeAttr y getField ya llegan a leads.js.

## Evidencia
- T1: caracterizacion en `scripts/tests/dashboard-leads.test.mjs` (RED por
  export ausente): contadores/porcentajes con 0.0 sin leads; subtitulo con
  las 4 ramas y prioridad del rango; matriz con columnas 'General' para
  campana vacia, orden es, clases por estado, '-' en ceros, totales por
  columna y gran total, y caso sin leads. Correcciones de mis tests: regex
  de la celda '-' (hay atributos entre class y >) y extraccion de totales
  con espacios.
- T2: `metricasLeads`, `subtituloKpiTotal` y `matrizLeadsHtml` en leads.js
  (compareAlphaEs/escapeAttr importados) con registro window; updateKpis y
  renderMatrix quedan escribiendo nodos; inyectadas en t5 y
  session-isolation.
- T3: suite completa verde (Node + 11 Python), lint, build (tres paginas
  con CSP estricta), preview OK, blanco OK; index.html queda en ~6400
  lineas con 6 modulos (8691 totales).

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano (dashboard: KPIs, subtitulo,
  matriz y filtrado por celda) y commit atomico con orden
- Bloqueos: ninguno

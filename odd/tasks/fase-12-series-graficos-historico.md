# Fase 12: series de los graficos historicos

## Objetivo
Extraer a src/legacy/reportes.js la construccion pura de las series de
datos de los 8 graficos del panel historico (historicalChartSeries),
dejando en index.html solo paletas, opciones y la instanciacion Chart.js.

## Problema y por que
Las series (mapas por campana/medio/agente, ordenes, top-N, bucket
"Otros/Otras" y embudo) son logica de datos sin tests mezclada con
presentacion. Extraerlas completa la logica pura del historico.

## Alcance
- `historicalChartSeries(data, aggregates, kpis)` pura:
  - monthly: inscritos/total/conversion por mes activo.
  - campaigns: top 6 por total con inscritos ('Sin Campaña' fallback).
  - medios: top 6 por frecuencia ('Directo/Otro' fallback).
  - agents: top 6 por inscritos con la regla exacta 'Sin Asignar' oculto
    salvo total > 2.
  - statesStacked: top 6 por total + serie 'Otros' (Math.max, negativo -> 0)
    si hay mas.
  - campsStacked: top 5 por total + 'Otras' si hay mas.
  - funnel: etapas fijas y valores [totalLeads, gestionados, agendados,
    inscritos].
- Render consume las series; paletas y opciones Chart.js permanecen ahi.
- Tests de caracterizacion por serie, regla Sin Asignar, buckets Otros,
  embudo y no mutacion.

## Restricciones
- Sin cambios de UX ni colores visibles, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Mismas series, ordenes y top-N que hoy (los charts deben pintar igual).
- Suite, lint y build autocontenido verdes; t5 ejecuta el cuerpo real del
  render: inyectar el export nuevo.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: caracterizar las series (RED por export ausente).
- [ ] T2: extraer la funcion, registrar API global y reescribir los charts
  del render; inyectar en t5.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Las 8 series caracterizadas coinciden; sin logica de series
  duplicada en index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- La funcion recibe aggregates (ya calculados por el render) y kpis para
  no recomputar agregados ni estados; funnelGestionados sale de aggregates.
- Paletas, estilos y opciones permanecen en el render (presentacion).

## Reutilizacion investigada
- computeHistoricalAggregates (fase 4), historicalKpiTotals (fase 9) y
  normalizeGestion/normalizeLeadMonth viven en el modulo canonico.
- El bloque de charts es index.html ~5670-5905.

## Evidencia
- T1: `scripts/tests/series-graficos-historico.test.mjs` observo RED por
  export ausente; caracteriza series mensuales con conversion numerica,
  top6 campanas con 'Sin Campaña', top6 medios con 'Directo/Otro', regla
  'Sin Asignar' oculto salvo total > 2 (y su entrada cuando crece),
  series apiladas de estados/campanas sin bucket, 'Otras campanas' con
  residuo Math.max por mes, embudo con etapas fijas, invasores y no
  mutacion.
- T2: `historicalChartSeries(data, aggregates, kpis)` extraida a
  `src/legacy/reportes.js` (reutiliza getField y normalizeGestion del
  modulo; recibe agregados y kpis ya calculados por el render para no
  recomputar); los 8 charts del render consumen `series` con paletas y
  opciones Chart.js intactas; el embudo destructura etapas/valores de
  series.funnel. t5 inyecta el export (el test de los 8 graficos ejecuta
  el cuerpo real en el vm).
- T3: series+t5 144/144; `pnpm test` 471/471 Node y 11 Python OK; `pnpm
  lint` (tsc + check-app) OK; `pnpm build` OK (dist 804 kB); `git diff --check`
  OK; smoke localhost:3000 root 200. index.html pierde 38 lineas mas
  (5133 en check-app).
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase12-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 319 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 471/471, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano del puerto activo 3000
  (orden de commit recibida tras el resultado ZAP)
- Ultima tarea: verificacion ZAP contra localhost:3000
- Commit atomo de la fase 12 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

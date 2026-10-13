# Fase 8: matriz CSV del resumen historico

## Objetivo
Extraer la construccion de filas del resumen historico exportado
(exportHistoricalSummaryCSV) a src/legacy/reportes.js como funcion pura,
dejando en index.html solo filtro DOM, toasts y descarga.

## Problema y por que
La funcion mezcla topCampana/topAgente con percentuales, escape CSV y DOM.
La matriz es reutilizable y no tiene tests; caracterizarla primero evita
romper el export y facilita el siguiente tramo del monolito.

## Alcance
- Nueva `historicalSummaryCsv(data)` en reportes: mismos headers y fila por
  mes con histMonthLabel, totales, % conversion, % del total, campana mas
  fuerte y asesor con mas cierres; cada campo por csvReporteField del
  modulo; empate conserva el primero con recuento estricto (>).
- Retornar {csv, months}; el wrapper mantiene el aviso de vacio, el nombre
  de fichero con miamiToday y el suffix de excluidos en el toast.
- Tests: fila tipica, mes sin datos cero porcentajes, top por recuento y
  orden, escape de campana con comillas y neutralizacion de formula,
  vacios/invasores y no mutacion.

## Restricciones
- Sin cambios de UX/CSV visibles, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Mismo contenido CSV y nombre de fichero (Historical_Summary_<miamiToday>).
- Aviso vacio "No hay registros para exportar" y toast con excluidos.
- Tests existentes de reportes, export y t5; build autocontenido.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: caracterizar la matriz con tests del modulo (RED por export
  ausente).
- [ ] T2: extraer la funcion, registrar API global y delegar desde el
  wrapper; adaptar t5.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Mismo CSV caracterizado para todos los casos y sin duplicacion en
  index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- La funcion devuelve el CSV completo (incluye cabecera) + months para el
  aviso de vacio; toasts y filename quedan en el wrapper.
- El empate de top campana/agente conserva el primero (comportamiento
  original con recuento estricto).

## Reutilizacion investigada
- reportes.js ya exporta csvReporteField, histMonthLabel y
  computeHistoricalAggregates usados por la funcion original.
- Patron window + inyeccion t5 establecido; exportHistoricalSummaryCSV ya
  esta en la lista de extraccion de t5 (cuerpo sigue en index.html).

## Evidencia
- T1: `scripts/tests/csv-resumen-historico.test.mjs` observo RED por export
  ausente; caracteriza fila tipica (totales, % conversion, % del total,
  top por recuento estricto no alfabetico), mes OTRO con etiqueta, escape
  de formula `=SUM(A1)` y comillas dobladas, months cero con CSV de solo
  cabecera, entradas inesperadas y no mutacion.
- T2: `historicalSummaryCsv(data)` extraida a `src/legacy/reportes.js`
  (reutiliza computeHistoricalAggregates, histMonthLabel y csvReporteField
  del modulo); registro `window.historicalSummaryCsv`; el wrapper
  `exportHistoricalSummaryCSV` queda con aviso de vacio, downloadCSV y
  toast con suffix de excluidos. t5 inyecta el export nuevo.
- T3: tests csv+t5 141/141; `pnpm test` 446/446 Node y 11 Python OK;
  `pnpm lint` (tsc + check-app) OK; `pnpm build` OK (dist autocontenido
  804 kB); `git diff --check` OK; smoke localhost:3000 root 200 y modulo
  reportes 200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase8-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 306 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 446/446, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada en el puerto
  activo 3000 (CSV descargado con cabecera/valores correctos; el usuario
  confirmo "todo bien")
- Ultima tarea: revision visual del export CSV
- Commit atomo de la fase 8 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

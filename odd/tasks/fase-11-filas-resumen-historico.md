# Fase 11: filas del resumen historico

## Objetivo
Unificar la construccion de la fila mensual (tabla y CSV) del panel
historico sobre una funcion pura `historicalSummaryRows(data)` en
src/legacy/reportes.js, eliminando la duplicacion de logica de top
campana/agente y % entre la fase 8 y el render.

## Problema y por que
La tabla del render repite hoy el bucle de mConv/mYearPct/topCamp/topAg
que historicalSummaryCsv ya tiene (fase 8). Duplicado = dos fuentes de
verdad para la misma fila; unirlas baja el riesgo de divergencia.

## Alcance
- `historicalSummaryRows(data)`: array de objetos {mes, total, agendados,
  noContesta, inscritos, conv, monthPct, topCamp, topAg} con la misma
  semantica actual (conv/monthPct toFixed(1) sin '%', '%' agregado por el
  consumidor; empate conserva el primero con '>').
- `historicalSummaryCsv` se reescribe para consumir las filas (CSV byte
  identico al actual; las pruebas de la fase 8 deben seguir verdes).
- El render consume las filas para pintar la tabla (mismo markup).
- Tests: shape de fila tipica, empate, OTRO, invasores, no mutacion y
  compatibilidad CSV (las pruebas de fase 8 son la golden).

## Restricciones
- Sin cambios de UX ni textos visibles, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- CSV byte identico (fase 8 como golden), markup de tabla identico y
  charts intactos (siguen usando monthlyStats/activeMonths directos).
- t5: el cuerpo real del render corre en el vm; se inyecta el nuevo
  export.
- Suite completa, lint y build autocontenido verdes.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: caracterizar las filas (RED por export ausente).
- [ ] T2: extraer y reescribir CSV + tabla sobre las filas; inyectar en t5.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Una sola fuente para la fila mensual; sin logica de top/%
  duplicada entre CSV y tabla.
- [ ] CSV y markup de tabla identicos a los actuales.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- Las filas devuelven conv/monthPct como strings toFixed(1) SIN '%' (los
  consumidores lo agregan), igual que hoy.
- Los totales del agregado se pasan como numeros crudos; toLocaleString y
  escape siguen siendo responsabilidad del consumidor de presentacion.

## Reutilizacion investigada
- historicalSummaryCsv (fase 8) contiene ya el bucle canonico: se mueve a
  historicalSummaryRows y se reescribe el CSV como capa de escape.
- La tabla del render (index.html ~5638-5674) es el segundo consumidor.

## Evidencia
- T1: `scripts/tests/filas-resumen-historico.test.mjs` observo RED por
  export ausente; caracteriza shape tipico (mes/totales/conv/monthPct sin
  %/top), mes OTRO, reparto de % del total entre meses (33.3/66.7),
  invasores/vacios y no mutacion.
- T2: `historicalSummaryRows` extraida (bucle canonico de la fase 8)
  `historicalSummaryCsv` reescrito como capa de escape sobre las filas y
  la tabla del render consume `historicalSummaryRows(data)` con el mismo
  markup (mConv>=15 chip, toLocaleString, escapeHtml). El CSV sale byte
  identico: las pruebas de la fase 8 actuan como golden. t5 inyecta el
  export nuevo (el render corre real en el vm).
- T3: filas+CSV+t5 145/145; `pnpm test` 462/462 Node y 11 Python OK;
  `pnpm lint` (tsc + check-app) OK; `pnpm build` OK (dist 804 kB);
  `git diff --check` OK; smoke localhost:3000 root 200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase11-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 316 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 462/462, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada en el puerto
  activo 3000 (CSV correcto: aritmetica de % verificada a mano, 9
  columnas alineadas, tops por mes coherentes; la caja en minusculas es
  formato de Google Sheets, el servidor sirve MONTH_CHRONO en mayusculas
  verificado con curl)
- Ultima tarea: revision visual del CSV y tabla
- Commit atomo de la fase 11 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

# Fase 22: piezas puras de Campanas a reportes.js

## Objetivo
Extraer a src/legacy/reportes.js las piezas puras de la seccion Campanas:
universo de campanas (campanasDeFuentes), resumen, fila, total, estado
vacio y lineas del CSV; los wrappers conservan RPC, DOM y toasts.

## Problema y por que
loadCampanas mezcla RPC con el cruce catalogo/rollup/stats (puro) y
renderCampanas/exportCampanasCSV construyen plantillas y CSV sin tests
directos; las fases anteriores ya dejaron campaignTotals/
campaignCosteResultado en el modulo.

## Alcance
- `campanasDeFuentes(catalogo, rollupRows, statRows)`: universo unico
  (catalogo + rollup + stats), nombres limpios, orden es y mapeo exacto de
  campos con Number/fallbacks.
- `resumenCampanasHtml(rows, totals)`: 4 metricas del resumen o ''.
- `estadoVacioCampanasHtml(loadFailed, mesLabel)`: mensajes de error/vacio.
- `filaCampanaHtml(r, { esEditor, isAdmin, monthStr })`: fila con estados,
  inputs de editor o spans, botones Guardar/Eliminar por permiso y
  data-ev (recuerda la puerta de encodeURIComponent del nombre).
- `totalCampanasHtml(totals, mesLabel)`: fila TOTAL.
- `campanasCsvLines(rows, monthStr, generado)`: lineas del CSV con total.
- Wrappers: RPC/DOM/toasts y composicion.

## Restricciones
- Strings byte a byte identicos; mismos permisos (isAdmin, esEditor).
- Misma rama; sin push/merge/deploy; sin trabajo ajeno.

## No romper
- t5 de campanas (filas, edicion, CSV, recalc) intactos; suite/lint/build.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 golden.

## Tareas
- [ ] T1: caracterizar las seis piezas (RED).
- [ ] T2: extraer con registro window; composicion en wrappers; inyecto en
  t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke; ZAP si hay daemon.

## Criterios de aceptacion
- [ ] Sin plantillas ni CSV de campanas en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- monthStr entra como parametro (el original leia el select dentro).

## Reutilizacion investigada
- campaignTotals y campaignCosteResultado ya viven en reportes.js.

## Evidencia
- T1: caracterizacion en `scripts/tests/campanas-render.test.mjs` (RED por
  export ausente): universo de fuentes (mapeo exacto y orden), fila editor
  vs lectura (encodeURIComponent del nombre, permisos, stat nulo), resumen
  o vacio, estado vacio (fallo/vacio) y CSV con total y coste.
- T2: 6 piezas en reportes.js (campanasDeFuentes, resumenCampanasHtml,
  estadoVacioCampanasHtml, filaCampanaHtml, totalCampanasHtml,
  campanasCsvLines) con registro window; los wrappers conservan RPC, DOM,
  toasts y la lectura de fallback de monthStr; inyectadas en t5 y
  session-isolation.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  943 kB guardia LIMPIA, preview 200, blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano de Campanas (tabla, edicion,
  CSV) y commit atomico solo con orden
- Bloqueos: ninguno para esta fase; quedan los hallazgos ZAP nuevos
  (Source Code Disclosure Java x16 en el bundle inline y CSP de
  /privacidad.html) para decision humana

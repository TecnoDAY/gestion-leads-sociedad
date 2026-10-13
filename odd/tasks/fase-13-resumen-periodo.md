# Fase 13: resumen del reporte por periodo

## Objetivo
Extraer la logica pura del reporte por periodo fuera del monolito:
`consolidateLeadsById` (utilitario generico de ids) a `src/legacy/helpers.js`
(base, sin imports) y `buildPeriodSummary` + `validatePeriodoSummary` a
`src/legacy/reportes.js`, dejando en `index.html` solo el resto del flujo.

## Problema y por que
`buildPeriodSummary` (agrupa por catalogos activos, extras, matriz
gestion x campana y validacion interna) es la agregacion pura mas grande
que queda en el monolito; sus tests ya existen en t5/session-isolation
pero extraen el cuerpo del HTML. Moverla al modulo canonico la hace
importable directamente y completa la seccion Periodo.

## Ciclo de imports evitado
- `leads.js` importa `MONTH_CHRONO` de `reportes.js`, por lo que
  `reportes.js` NO puede importar de `leads.js` (ciclo).
- Solucion: `compareLeadIdsDescending` (generico) + `consolidateLeadsById`
  van a `helpers.js`, la base sin imports; `reportes.js` importa
  `consolidateLeadsById` de `helpers.js`. Grafo resultante aciclico:
  helpers <- reportes <- leads.

## Alcance
- `compareLeadIdsDescending` + `consolidateLeadsById` a `helpers.js`
  (registro en window de helpers).
- `buildPeriodSummary` + `validatePeriodoSummary` a `reportes.js`
  (importan `consolidateLeadsById` de helpers; registro en window).
- `index.html`: retirar los 3 cuerpos (consolidateLeadsById,
  buildPeriodSummary, validatePeriodoSummary); se resuelven via window.
- Adaptar t5, session-isolation (names/extract + inyeccion de exports) y
  leads-helpers.test (comparador ahora desde helpers).
- Test de caracterizacion a nivel modulo para los 3 exports nuevos.

## Restricciones
- Sin cambios de UX ni comportamiento; mismo error `period_range_invalid`
  y mismo mensaje de validacion.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Los tests existentes de t5 y session-isolation sobre buildPeriodSummary,
  validatePeriodoSummary y consolidateLeadsById deben seguir verdes tras
  la inyeccion (prueba de preservacion).
- Suite completa, lint y build autocontenido verdes.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios; los t5/session existentes actuan
  como golden de regresion.

## Tareas
- [ ] T1: caracterizar los 3 exports a nivel modulo (RED por export
  ausente).
- [ ] T2: mover funciones, registrar window y retirar de index.html;
  adaptar t5, session-isolation y leads-helpers.test.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Sin logica de periodo consolidada/matrizar duplicada en index.html.
- [ ] Grafo de imports aciclico; los 3 exports importables.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- `compareLeadIdsDescending` se muda a helpers.js (base) para evitar el
  ciclo leads->reportes; su test pasa a importarlo de helpers.
- `consolidateLeadsById` se muda a helpers.js por ser generico (dedup por
  id + orden); lo consume reportes.js via import.

## Reutilizacion investigada
- periodoValidDate, parseFechaLead, compareAlphaEs y getField ya viven en
  helpers/reportes.
- t5 y session-isolation ya caracterizan profundamente estas funciones
  (catálogo+extras, dedup, archivados, matriz coherente, rango invalido);
  tras la inyeccion siguen ejecutandose.

## Evidencia
- T1: `scripts/tests/resumen-periodo.test.mjs` caracteriza los 3 exports a
  nivel modulo: consolidacion por id con merge y orden desc (y lanzamiento
  ante id ausente), resumen perido (total/fechas invalidas, catalogo
  activo + extras + 'Sin definir' con 0, orden alfabetico), matriz
  gestion x campana coherente, rango invalido/invetido ->
  period_range_invalid, leads vacios y validador con tampering.
  Correccion en camino: mi expectativa del caso vacio omitia que los
  catalogos activos aparecen con 0 (comportamiento original); corregido el
  test, no el codigo.
- T2: compareLeadIdsDescending + consolidateLeadsById mudados a
  `src/legacy/helpers.js` (base, sin imports; registro window ahi);
  buildPeriodSummary + validatePeriodoSummary mudados a
  `src/legacy/reportes.js` con import de consolidateLeadsById desde
  helpers (grafo aciclico: helpers <- reportes <- leads); index.html sin
  los 3 cuerpos (resuelven via window). t5: nombres fuera de extract + 4
  exports inyectados (helpers del dup en leadsMod corregido);
  session-isolation: lo mismo; leads-helpers.test importa el comparador
  de helpers.
- T3: afectados 235/235 (t5 y session-isolation inyectados = preservacion
  de comportamiento); `pnpm test` 478/478 Node y 11 Python OK; `pnpm lint`
  OK; `pnpm build` OK (dist 801 kB, monolito 5045 lineas en check-app);
  `git diff --check` OK; smoke localhost:3000 root 200 y helpers 200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase13-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 357 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 478/478, lint, build, smoke) con
  ZAP pasivo valido y commit aprobado por el humano (orden explicita "haz
  commit" tras el resultado ZAP)
- Ultima tarea: verificacion ZAP contra localhost:3000
- Commit atomo de la fase 13 aprobado; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

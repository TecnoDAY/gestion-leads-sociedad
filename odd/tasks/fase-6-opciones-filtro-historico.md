# Fase 6: opciones de filtros del historico

## Objetivo
Extraer la construccion pura de opciones de campana, agente, mes y ano del
panel historico a `src/legacy/reportes.js`, dejando en `index.html` solo la
lectura/escritura del DOM y el marcado HTML.

## Problema y por que
`populateHistoricalFilterOptions` mezcla deduplicacion, orden de opciones y
lecturas del DOM. Separar la parte pura permite caracterizarla sin navegador
ni estado global y reduce el siguiente tramo del monolito.

## Alcance
- Nueva funcion pura `historicalFilterOptions(data)` en reportes.
- Conservar orden alfabetico de campanas/agentes, orden cronologico de meses,
  `OTRO` al final y anos ascendentes con `SIN-FECHA` al final.
- Conservar la forma de los valores que el wrapper usa para renderizar.
- Tests de datos vacios, deduplicacion, acentos, anos, fechas invalidas,
  `OTRO` y no mutacion.

## Restricciones
- Sin cambios de UX, contratos del reporte, SQL o Supabase.
- Sin cambiar catalogLabel, escapeHtml/escapeAttr ni catalogOptions del DOM.
- No tocar CSP ni ficheros ajenos.
- Sin push, merge ni deploy sin peticion explicita.

## No romper
- Las opciones visibles y la seleccion actual se conservan.
- `populateHistoricalFilterOptions` mantiene sus ids, placeholders y markup.
- Suite, lint, build y smoke deben seguir verdes.

## TDD
- Modo: off | Fuente: default | Runner: `pnpm test`.

## Tareas
- [x] T1: caracterizar la funcion pura.
- [x] T2: extraerla, registrar API global y delegar desde el wrapper.
- [x] T3: suite completa, lint, build, smoke y revision del diff.

## Criterios de aceptacion
- [x] Mismas opciones y orden para todos los casos caracterizados.
- [x] Sin logica de construccion de opciones duplicada en `index.html`.
- [x] Checks locales verdes; sin commit automatico.

## Decisiones aceptadas
- La funcion devuelve valores normalizados, no HTML.
- El wrapper conserva seleccion, placeholders y escape/render del DOM.

## Reutilizacion investigada
- `reportes.js` ya contiene `MONTH_CHRONO`, `leadReportDate` y
  `normalizeLeadMonth`.
- `index.html` conserva `catalogOptions`, `catalogLabel`, `escapeAttr` y
  `escapeHtml` porque pertenecen al render y a otros catalogos.

## Evidencia
- T1: `scripts/tests/opciones-filtro-historico.test.mjs` caracterizo vacio,
  deduplicacion, orden espanol, meses cronologicos con `OTRO`, anos,
  `SIN-FECHA`, valores vacios, entradas inesperadas y no mutacion.
- T2: `historicalFilterOptions(data)` vive en `src/legacy/reportes.js`, se
  registra en `window`; `populateHistoricalFilterOptions` conserva DOM,
  placeholders, seleccion y `catalogOptions` activo para agentes, delegando
  la deduplicacion/orden a la funcion pura. t5 inyecta el export nuevo.
- T3: `pnpm test` 431/431 Node y 11 Python OK; `pnpm lint` (tsc +
  check-app) OK; `pnpm build` OK (dist autocontenido 804 kB); `git diff --check`
  OK; smoke localhost:3001 root 200 y modulo reportes 200.
- Verificacion ZAP sobre la version activa: escaneo pasivo contra el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase6-3000.log`), spider 28 URLs
  contra `http://127.0.0.1:3000/` y cola pasiva 0: 0 High, 34 instancias
  Medium (17 `CSP: script-src unsafe-inline` y 17 `CSP: style-src
  unsafe-inline`), 0 Low, 283 informativas (317 total); la raiz presenta los
  mismos 2 tipos Medium preexistentes de la Fase 4, sin hallazgos nuevos
  atribuibles a las extracciones 5-6. Los intentos previos con heap alto
  murieron por memoria (Tech Detection/Foxhound GraalJS); en este valido se
  desactivaron temporalmente esas reglas informativas y quedaron activas las
  de seguridad (CSP, cabeceras). Sin active scan ni autenticacion; la
  auditoria global sigue abierta por el CSP preexistente y sin escaneo
  autenticado. El Daemon MCP quedo intacto.

## Progreso
- Estado: implementada y verificada localmente con ZAP pasivo valido;
  revision visual del humano confirmada en el puerto activo 3000
- Commit atomo de las fases 5-6 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

# Fase 10: texto del aviso de rango historico

## Objetivo
Extraer a src/legacy/reportes.js la construccion del texto del aviso del
rango historico (histRangeNoticeText) y dejar en index.html solo la
visibilidad y escritura del elemento.

## Problema y por que
updateHistRangeNotice mezcla el armado del mensaje (fechas ISO, conteos,
avisos de mes anulado y excluidos) con el DOM. El texto es visible y no
tiene tests; su contrato exacto debe quedar caracterizado.

## Alcance
- `histRangeNoticeText(filtered)` pura: {visible, text}; misma redaccion y
  orden de partes: desde/hasta, 'N leads en rango', aviso de mes anulado,
  'N sin fecha valida excluidos'; separador ' · ' con prefijo 'Rango: '.
- Invasores tolerados sin lanzar (null, range ausente, data no array,
  excludedNoDate no numerico).
- Delegacion desde updateHistRangeNotice (hidden/textContent intactos).
- Caracterizacion con toLocaleString: los conteos usan el locale del
  proceso; la redaccion concreta se aserta solo en la parte literal y con
  conteos < 1000 para independencia de separadores.

## Restricciones
- Sin cambios de UX ni textos visibles, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Mismo texto final en todos los casos y misma visibilidad del elemento.
- t5: su sandbox extrae y ejecuta el cuerpo real de este wrapper en 3
  tests; se inyectara el export nuevo.
- Tests existentes de reportes, t5 y build autocontenido.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: caracterizar el texto con tests del modulo (RED por export
  ausente).
- [ ] T2: extraer la funcion, registrar API global y delegar; inyectar en
  t5.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Mismo aviso caracterizado en todos los casos y sin duplicacion en
  index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- La fecha ISO del mensaje se conserva con slice(0, 10) del original.
- toLocaleString permanece dentro de la funcion (igual que en el original).

## Reutilizacion investigada
- Patron window + inyeccion t5 establecido; el wrapper ya esta extraido en
  t5 por extractFunction (3 usos), por lo que la inyeccion es la pieza
  critica del tramo.

## Evidencia
- T1: `scripts/tests/aviso-rango-historico.test.mjs` observo RED por export
  ausente; caracteriza desde/hasta completos y parciales, mes anulado por
  rango, excluidos al final, rango inactivo/null invisible, conteos con
  toLocaleString (comparando solo la parte literal y conteos < 1000) e
  invasores (range ausente, data no array, excludedNoDate no numerico).
- T2: `histRangeNoticeText` extraida a `src/legacy/reportes.js` con
  registro en window; `updateHistRangeNotice` queda solo con
  `hidden`/`textContent`. t5 ya extraia el cuerpo real del wrapper (3
  usos); export nuevo inyectado en el contexto base del vm.
- T3: aviso + t5 verdes; `pnpm test` 458/458 Node y 11 Python OK; `pnpm
  lint` (tsc + check-app) OK; `pnpm build` OK (dist 804 kB); `git diff --check`
  OK; smoke localhost:3000 root 200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase10-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 313 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 458/458, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada en el puerto
  activo 3000 ("correcto todo")
- Ultima tarea: revision visual del aviso de rango
- Commit atomo de la fase 10 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

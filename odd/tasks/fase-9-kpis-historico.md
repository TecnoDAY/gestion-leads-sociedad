# Fase 9: KPIs del panel historico

## Objetivo
Extraer a src/legacy/reportes.js los KPIs puros de renderHistoricalAnalytics:
totales por estado, % conversion (historicalKpiTotals) y mes record
(historicalRecordMonth), dejando en index.html solo la escritura en DOM.

## Problema y por que
Los totales y el mes record son reglas de datos (normalizeGestion, bucle con
maximo estricto) incrustadas en render; no tienen tests directos. Extraerlos
los hace caracterizables y libera el siguiente tramo del monolito.

## Alcance
- `historicalKpiTotals(data)`: totalLeads, totalInscritos, totalAgendados,
  totalNoContesta y convRate (mismos includes INSCRIT/AGENDAD/NO CONTEST y
  toFixed(1) con 0.0 en vacio).
- `historicalRecordMonth(monthlyStats, activeMonths)`: maximo con
  comparador estricto >, guarda el primer mes con ese maximo, etiqueta con
  histMonthLabel; '-' y 0 si no hay meses; sin lanzar ante entradas
  inesperadas.
- Testss de caracterizacion: includes parciales, conversion, vacio, empate
  del record, orden de activeMonths, no mutacion e invasores.
- Delegacion desde renderHistoricalAnalytics (escritura DOM intacta). t5
  extrae y ejecuta el cuerpo real del render (correccion en T2: se inyectan
  ambos exports en el vm; el stub del contexto no cubre esos tests).

## Restricciones
- Sin cambios de UX, contratos del reporte, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Mismos textos de KPIs (toLocaleString en pantalla, 'X leads' del record;
  el appends de % y leads siguen en el wrapper).
- Tests existentes de reportes, t5 y build autocontenido.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: caracterizar KPIs y record con tests del modulo (RED por export
  ausente).
- [ ] T2: extraer funciones, registrar API global y delegar desde render.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Mismos KPIs y record para todos los casos caracterizados.
- [ ] Sin calculo de KPIs duplicado en index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- El appends de '%' y ' leads' permanecen en el wrapper (presentacion).
- En empate del record gana el primero de activeMonths (comportamiento
  original con comparador estricto).

## Reutilizacion investigada
- normalizeGestion e histMonthLabel ya viven en reportes.js; patron window +
  caracterizacion establecido en fases 4-8.
- `renderHistoricalAnalytics` esta stubbeado en el contexto base de t5 pero
  existen tests que extraen su cuerpo real al vm (descubierto en T3 con la
  suite completa: ReferenceError); se corrigio inyectando ambos exports.

## Evidencia
- T1: `scripts/tests/kpis-historico.test.mjs` observo RED por export
  ausente; caracteriza variantes de estados con sufijo (INSCRITO *,
  AGENDADÓ, NO CONTESTO), conversion, vacio, maximo estricto del record
  (empate conserva el primero de activeMonths, verificado con ENERO/MARZO),
  etiqueta histMonthLabel, vacios/invasores y no mutacion.
- T2: `historicalKpiTotals` y `historicalRecordMonth` extraidas a
  `src/legacy/reportes.js` con registro en window; el render escribe en DOM
  via los objetos retornados y conserva el appends de '%' y ' leads'.
  Correcciones en el camino: (1) t5 ejecuta el cuerpo REAL del render
  (supuesto errado corregido inyectando ambos exports); (2) el cuerpo del
  render usa totalAgendados/totalInscritos en el chart del funil: la
  desestructuracion se amplio a esos campos para no romperlo (suite roja
  la detecto y quedo verde).
- T3: tests afectados 14/14; `pnpm test` 452/452 Node y 11 Python OK;
  `pnpm lint` (tsc + check-app) OK; `pnpm build` OK (dist 804 kB);
  `git diff --check` OK; smoke localhost:3000 root 200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase9-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 309 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 452/452, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada en el puerto
  activo 3000 (KPIs y mes record "funciona sin problemas")
- Ultima tarea: revision visual de los KPIs
- Commit atomo de la fase 9 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

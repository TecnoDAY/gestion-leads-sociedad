# Fase 14: CSV y validador de actividad del periodo

## Objetivo
Extraer a src/legacy/reportes.js la construccion pura de las lineas del
CSV del reporte por periodo (periodoCsvLines) y el validador de actividad
(validatePeriodoActividad), dejando en el wrapper solo guardas de estado,
descarga y toasts.

## Problema y por que
exportReportePeriodoCSV mezcla guardas de sesion con 30+ filas de contenido
(resumenes, matriz, gestiones por estado, canales y agenda). El armado de
lineas es puro y hoy no tiene tests directos; validatePeriodoActividad es
el compañero de los validadores ya movidos en la fase 13.

## Alcance
- `periodoCsvLines(summary, actividad, generado)` pura: mismas secciones y
  orden exactos (titulo, desde/hasta, generado, excluidos, 3 bloques
  resumen con Categoría/Leads/% y TOTAL, matriz, actividad de gestiones
  con por_estado ordenado alfabeticamente, canales, agenda); campos via
  csvReporteField y porcentajes via periodoPct del modulo.
- `validatePeriodoActividad(data, desde, hasta)` pura (companera de los
  validadores de fase 13; mismo mensaje de error).
- El wrapper conserva guardas (rango cambiado, revision, actividad), el
  nombre de fichero y los toasts; el generado (miamiToday) se pasa como
  parametro para determinismo en tests.
- Tests: secciones y orden, % via periodoPct, matriz, por_estado ordenado,
  neutralizacion CSV, validador ok/alterado/rango distinto.

## Restricciones
- Sin cambios de UX ni contenido del CSV; bytes identicos.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- el CSV exportado debe ser byte identico al actual (los t5 de CSV del
  periodo actuan como golden tras la inyeccion).
- Suite completa, lint y build verdes.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios; los t5 de CSV del periodo son la
  golden de regresion.

## Tareas
- [ ] T1: caracterizar periodoCsvLines y validatePeriodoActividad (RED).
- [ ] T2: extraer ambas, registrar window y delegar desde el wrapper;
  inyectar en t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Sin armado de lineas CSV del periodo en index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- El generado (miamiToday) entra como parametro; el wrapper lo evalua.
- periodoTip y positionPeriodoTip quedan en index.html (markup/layout).

## Reutilizacion investigada
- csvReporteField, periodoPct y compareAlphaEs ya viven en reportes.js.
- exportReportePeriodoCSV y validatePeriodoActividad ya estan en las listas
  de extract de t5/session-isolation (cuerpos ejecutados en el vm).

## Evidencia
- T1: caracterizacion extendida en `scripts/tests/resumen-periodo.test.mjs`
  (RED por export ausente): validatePeriodoActividad ok/tamper/rango
  distinto/por_estado invalido; periodoCsvLines con cabecera exacta, tres
  bloques con TOTAL y % via periodoPct, matriz, por_estado ordenado
  alfabeticamente (AGENDADO C antes que INSCRITO) y envoltura de campos.
  Correcciones de tests en el camino: (1) mi caso vacio omitia catalogos
  activos con 0 (ya corregido en fase 13); (2) el split naive por comas
  rompe la line Nota ( texto con comas internas) — asercion valida:
  lineas no vacias empiezan y terminan entre comillas.
- T2: `validatePeriodoActividad` y `periodoCsvLines` extraidas a
  `src/legacy/reportes.js` (reutilizan csvReporteField, periodoPct,
  compareAlphaEs); registro window; el wrapper exportReportePeriodoCSV
  queda con guardas, nombre de fichero y toast; el generado (miamiToday)
  se evalua en el wrapper. index.html -50 lineas (5014).
- T3: afectados 222/222 tras retirar validatePeriodoActividad de las
  listas de extract (fallo detectado en sandbox); `pnpm test` 482/482 Node
  y 11 Python OK; `pnpm lint` OK; `pnpm build` OK (dist 801 kB); `git diff
  --check` OK (linea final del test corregida); smoke localhost:3000 root
  200.
- ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el daemon
  MCP en 8080 (evidencia `/tmp/opencode/zap-fase14-3000.log`), spider 28
  URLs y cola pasiva 0, estados verificados al arrancar (50001/40100
  desactivadas, 10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 360 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base; sin hallazgos nuevos atribuibles a esta extraccion. Sin
  active scan ni autenticacion; auditoria global sigue abierta por el CSP
  preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 482/482, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada ("funciona sin
  problema")
- Ultima tarea: revision visual del CSV del periodo
- Commit atomo de la fase 14 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado.

# Fase 21: piezas puras de renderReporteV2 a reportes.js

## Objetivo
Extraer la pantalla del reporte diario a piezas puras en
src/legacy/reportes.js: indice de notas, total del dia, tablas de detalle
por asesora, manuales de problemas/observaciones y el armado de bloque y
panel; renderReporteV2 queda como_orquestador con permisos y DOM.

## Problema y por que
renderReporteV2 (60+ lineas de plantillas y computos) mezcla indexing de
notas, totalizador, reglas de edicion, DOM y plantillas. Los t5 de panel
son el golden; faltan tests directos de las piezas.

## Alcance
- `indiceNotas(notas)` + `notaDeBloque(indice, b)`: mapeo uid/nombre exacto.
- `totalDiario(bloques)`: {g,l,c,r,v} con mismo numero de fallos.
- `detallesBloqueHtml(b)`: las 4 tablas con las filas exactas (incluidas
  'Otras procedencias' y 'Otros o sin canal' de la fase 16).
- `manualBloqueHtml(i, nota, editable)`: textarea botones Guardar/Eliminar
  (nota.id) o paragrafo de solo lectura.
- `bloqueDiaHtml(b, i, manualHtml)`: details/summary/body con open en la
  primera asesora y gestiones en el summary.
- `cuerpoReporteDiario(notasOk, total, bloquesHtml)`: aviso de notas y shell
  final (Resumen general + Comparativa).
- Wrapper renderReporteV2: indice, total, permisos (own/editable), DOM y
  composicion; sin plantillas propias.

## Restricciones
- Strings byte a byte idénticos (t5 es el golden directo del panel).
- Misma rama; sin push/merge/deploy; sin trabajo ajeno.

## No romper
- t5: panel, acciones de guardar/eliminar con data-ev, permisos y aviso.
- Suite completa, lint, build, smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 golden del panel.

## Tareas
- [ ] T1: caracterizarlas piezas (RED).
- [ ] T2: extraer con registro window; composicion en el wrapper;
  inyecto en t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke; ZAP si hay daemon.

## Criterios de aceptacion
- [ ] Sin plantillas del reporte diario en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- La edicion (own/editable) permanece en el wrapper: depende de usuario
  y de la fecha en pantalla.

## Reutilizacion investigada
- escapeHtml/miamiToday ya viven en helpers.js y llegan a reportes.js.

## Evidencia
- T1: caracterizacion en `scripts/tests/reporte-diario-render.test.mjs`
  (RED por export ausente): 6 tests (indice/notas, total 5 llaves,
  4 tablas con coherencia Total = suma de filas, manuales con
  Guardar/Eliminar condicionado por nota.id, bloque con open en la
  primera, shell con aviso). Correcciones de mis tests: nota sin id no
  muestra Eliminar, y num como helper local de bloqueDiaHtml.
- T2: 7 piezas puras en reportes.js (indiceNotas, notaDeBloque,
  totalDiario, detallesBloqueHtml, manualBloqueHtml, bloqueDiaHtml,
  cuerpoReporteDiario) con registro window; el wrapper solo permisos,
  fecha en pantalla y composicion; el Total de Canales reutiliza
  totalCanalesVisibles (igual formula, sin duplicar). Ajustes t5: 3
  aserciones de fuente apuntan a reportes.js (motivo: extraccion),
  inyectados los 7 en el contexto vm.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  943 kB guardia LIMPIA, preview 200, blanco OK.

## Correccion reabierta (T4): filtro de asesoras volvia a Todas
- Reportado y verificado: al elegir una asesora, la respuesta trae solo su
  bloque y el select se reconstruia con los DEMAS como entradas de catalogo
  con `value=""`; elegir otra asesora enviaba `null` y mostraba "Todas".
  Reproducido en el sandbox: la opcion de Bea quedaba sin su id.
- Fix (sin tocar el remoto): `asesorasDisponibles(bloques, catalogo,
  previas)` en reportes.js fusiona la respuesta, el catalogo y los ids
  recordados (un id real gana sobre el solo-nombre); el wrapper cachea
  `reporteAsesorasCatalogo`, la resetea en los cierres de sesion y
  reconstruye el select desde la cache.
- Tests: caracterizacion de la fusion (ids estables al filtrar, id real
  gana, sin duplicados/vacios) + regresion en t5 (Ana y Bea conservan
  id tras filtrar; pasar de Ana a Bea consulta por 'b', no por null).

## Progreso
- Estado: implementada y verificada localmente (incluida la correccion
  del filtro de asesoras); sin commit
- Ultima tarea: T4 (correccion del filtro)
- Siguiente paso: revision visual del humano (cambiar entre asesoras en
  el reporte diario, incluida una sin datos) y commit atomico con orden
- Bloqueos: ZAP fases 15-20 en curso (spider listo; cola drenando)

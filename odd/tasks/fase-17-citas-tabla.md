# Fase 17: filtrado, conteo y fila de cita a citas.js

## Objetivo
Extraer a src/legacy/citas.js las partes puras de renderCitas:
filtrarCitas, conteoCitas, filaCitaHtml y el marcado de tabla vacia; el
wrapper queda con lecturas de filtros DOM, KPIs, calendario y conteo.

## Problema y por que
renderCitas mezcla lecturas de DOM con el filtro (5 condiciones), el conteo
de estados y una plantilla de fila con botones condicionales por rol. La
logica es pura y solo cuenta con golden indirecto en t5.

## Alcance
- `filtrarCitas(citas, filtros)`: mismas 5 condiciones en el mismo orden
  (status, campana via getField del lead, sede con especial 'sin', medio,
  advisor).
- `conteoCitas(rows)`: { counts, denom } con los 5 estados canonicos y
  denom = ASISTIO + NO_ASISTIO.
- `filaCitaHtml(r, { isAdmin, userId })`: plantilla exacta (botones via
  data-ev y permisos iguales a hoy).
- `CITAS_TABLA_VACIA`: marcado exacto del estado vacio.
- El wrapper renderCitas conserva lecturas DOM, renderCitasKpis, el conteo
  de citasCount y el calendario; renderCitasKpis y updateCitasCalendar
  quedan en el monolito (escriben DOM).

## Restricciones
- Sin cambios de UX ni de permisos; bytes del HTML identicos.
- Misma rama; sin push/merge/deploy sin peticion explicita; sin trabajo ajeno.

## No romper
- t5 del area Citas (permisos de botones, asesora asignada) intactos.
- Suite completa, lint, build, smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 actua como golden del marcado renderizado.

## Tareas
- [ ] T1: caracterizar filtrarCitas, conteoCitas, filaCitaHtml y el vacio.
- [ ] T2: extraer a citas.js con registro window; delegar en renderCitas.
- [ ] T3: suite completa, lint, build, smoke y ZAP pasivo si hay daemon.

## Criterios de aceptacion
- [ ] Sin filtrado ni plantilla de fila de citas en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- renderCitasKpis permanece en el monolito: solo escribe DOM con inputs
  ya calculados por el wrapper via conteoCitas.

## Reutilizacion investigada
- getField, escapeHtml y appointmentLocal ya viven en helpers.js/citas.js.
- loadCitas/updateCitasCalendar ya existen; nada nuevo comparable.

## Evidencia
- T1: caracterizacion en `scripts/tests/citas-tabla.test.mjs` (RED por
  export ausente): filtrado de las 5 condiciones (incluida sede 'sin'),
  conteo de los 5 estados + denom, acciones por permiso/validez de id,
  estado vacio con data-ev. Correccion: getField lee claves planas del
  lead (fixture ajustado).
- T2: `filtrarCitas`, `conteoCitas`, `filaCitaHtml` y `CITAS_TABLA_VACIA`
  extraidos a src/legacy/citas.js con registro window; renderCitas queda
  con lecturas de filtros DOM, conteo en pantalla, tabla y calendario.
- Ajustes t5: 3 aserciones que miraban la plantilla en index.html ahora
  apuntan a citas.js (motivo: extraccion fase 17).
- T3: suite completa verde (Node + 11 Python), lint, build 943 kB,
  guardia CSP LIMPIA, preview 200, blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano de la seccion Citas y commit
  atomico solo con orden
- Bloqueos: ZAP fase 15 incompleto (daemon caido)

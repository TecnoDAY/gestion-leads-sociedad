# Fase 26: notas y gestiones de la ficha a leads.js

## Objetivo
Extraer a src/legacy/leads.js las plantillas de la ficha: notas
(notasLeadHtml) y gestiones/cambios (gestionesLeadHtml); los wrappers
conservan DOM, lucide y el foco del textarea en edicion.

## Problema y por que
renderLeadNotes y renderLeadGestiones mezclan DOM con plantillas con
estado (edicion por admin), fechas formateadas y normalizacion de canal
(Llamada Data Dura / Llamada WhatsApp); sin tests directos.

## Alcance
- `notasLeadHtml(notas, { isAdmin, editingNoteId })`: vacio, fecha
  es-ES corta, sufijo ' · editada', textarea inline en edicion, acciones
  admin (editar/borrar) y autor por defecto 'Agente'.
- `gestionesLeadHtml(gestiones)`: vacio, fecha dd/mm/yyyy, flecha con
  anterior, badges y etiqueta de canal normalizada; autor por defecto.
- Wrappers: escribir nodos, lucide.createIcons y el foco/seleccion del
  textarea de edicion.

## Restricciones
- HTML byte a byte identico; mismos permisos y data-ev.
- Misma rama; sin push/merge/deploy; sin trabajo ajeno.

## No romper
- t5/session-isolation de la ficha (notas, edicion, permisos).
- Suite, lint, build y smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test

## Tareas
- [ ] T1: caracterizar notasLeadHtml y gestionesLeadHtml (RED).
- [ ] T2: extraer a leads.js con registro window; wrappers; inyecto en
  t5/session-isolation.
- [ ] T3: suite, lint, build, smoke.

## Criterios de aceptacion
- [ ] Sin plantillas de notas ni gestiones en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- Las citas de la ficha quedan para su propia fase (tienen mas botones y
  estados).

## Reutilizacion investigada
- badgeGestionHtml (fase 25) se reutiliza para los estados.

## Evidencia
- T1: caracterizacion en `scripts/tests/ficha-lead.test.mjs` (RED por
  export ausente): notas vacio/autor/fecha/escapado, acciones admin,
  'editada', edicion inline solo de la nota objetivo; gestiones vacio,
  fecha dd/mm/yyyy, flecha con anterior, etiquetas de canal (Llamada Data
  Dura/Llamada WhatsApp/otro/-) y autor por defecto.
- T2: `notasLeadHtml` y `gestionesLeadHtml` en leads.js (reutilizando
  badgeGestionHtml) con registro window; los wrappers escriben nodos,
  lucide y el foco/seleccion del textarea; inyectadas en t5 y
  session-isolation (incluido el destructure de imports, detectado al
  correr la suite) y ajuste t5 de la normalizacion de canal (ahora en
  leads.js).
- T3: suite completa verde (Node + 11 Python), lint, build y blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano de la ficha (notas y
  cambios de gestion) y commit con orden
- Bloqueos: ninguno

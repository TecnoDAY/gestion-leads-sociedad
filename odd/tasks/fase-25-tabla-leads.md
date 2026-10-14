# Fase 25: tabla de leads y paginacion a leads.js

## Objetivo
Extraer a src/legacy/leads.js las piezas puras de la tabla de leads: fila
(filaLeadHtml), badge de gestion (badgeGestionHtml), estado vacio, info de
paginacion, controles (controlesPaginacionHtml) y rango de paginas
(rangoPaginacion). Los wrappers conservan DOM, lucide y el corte de pagina.

## Problema y por que
renderTable y updatePaginationUI mezclan DOM con plantillas largas (fila con
permisos, badge por estado, 2025 para historico, telefono deshabilitado) y
aritmetica de paginacion sin tests directos; es la superficie mas visible
del panel.

## Alcance
- `badgeGestionHtml(gestion)`: mismas clases por palabra clave.
- `filaLeadHtml(lead, { leadId, origin, isAdmin })`: fila exacta con
  nuevoBadge, originBadge 2025, boton de WhatsApp deshabilitado solo con
  telefono limpio no vacio, editar/archivar/ver por permisos y data-ev.
- `tablaVaciaLeadsHtml()`: estado vacio.
- `infoPaginacion(start, end, total)`: texto o 'Sin registros'.
- `rangoPaginacion(current, total)`: 1..n con '...' segun posicion.
- `controlesPaginacionHtml(currentPage, totalPages)`: flechas con disabled
  en bordes, numeros con aria-current y etiqueta movil.
- Wrappers renderTable/updatePaginationUI: corte de pagina, escritura de
  nodos y lucide.

## Restricciones
- HTML byte a byte identico; mismos permisos y data-ev.
- Misma rama; sin push/merge/deploy; sin trabajo ajeno.

## No romper
- Filtros, paginacion y acciones de la tabla (t5 golden y revision visual).
- Suite, lint, build y smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test

## Tareas
- [ ] T1: caracterizar las seis piezas (RED).
- [ ] T2: extraer a leads.js con registro window; wrappers; inyecto en
  t5/session-isolation.
- [ ] T3: suite, lint, build, smoke.

## Criterios de aceptacion
- [ ] Sin plantilla de fila ni de paginacion en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- El indice de fila (leadId de respaldo) y origin los resuelve el wrapper.

## Reutilizacion investigada
- nuevoBadge, getLeadOrigin y escapeAttr ya viven en leads.js/helpers.js.

## Evidencia
- T1: caracterizacion en `scripts/tests/tabla-leads.test.mjs` (RED por
  export ausente): badge por palabra clave, fila con data-ev/2025/telefono
  deshabilitado/nombre por defecto, permisos de archivar (no en
  historico), estado vacio, info de paginacion, rango y controles con
  bordes/apagado/activa/elipsis. Correcciones de mis tests: en historico
  no se archiva ni con admin, y la pagina activa SI lleva aria-current.
- T2: `badgeGestionHtml`, `filaLeadHtml`, `tablaVaciaLeadsHtml`,
  `infoPaginacion`, `rangoPaginacion` y `controlesPaginacionHtml` en
  leads.js con registro window; los wrappers renderTable/
  updatePaginationUI solo cortan pagina y escriben nodos; renderGestionBadge
  y getPaginationRange quedan como alias en el monolito (los usan otros 5
  puntos); ajuste t5 del uso de nuevoBadge (ahora en leads.js).
- T3: suite completa verde (Node + 11 Python), lint, build, blanco OK;
  index.html baja a 6229 lineas.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano (tabla de leads: badges,
  telefonos, acciones por rol, 2025, paginacion y vacio) y commit con orden
- Bloqueos: ninguno

# Kanban: rango por fecha de ingreso

## Decisión posterior: Tablero rápido (sustituye la cobertura completa descrita abajo)
El usuario aprobó priorizar una sola carga compartida de los últimos 2.000 leads de Leads frente a consultar todos los registros. El Tablero espera `loadLeadsPromise` si está activa y usa `allLeads` sin ejecutar `fetchLeadsByIdCursor` ni iniciar una carga nueva. Desde/Hasta filtra solo ese conjunto; el rango predeterminado es el mes actual en Miami y se conserva tras cambios de tarjetas y al volver a la vista. La entrada lateral se llama «Tablero». El aviso y el vacío aclaran que el alcance son los últimos 2.000 cargados, no toda la base.

Verificación de esta decisión: pruebas de fecha de Miami (incluye cambio de mes y febrero bisiesto), carga compartida pendiente/terminada/fallida y sesión obsoleta, límite de 2.000 al cargar Leads anteriores, filtros, mensaje, ficha, scroll y respuestas antiguas. `pnpm test`: 854 JS y 11 Python correctos; `pnpm build`, `pnpm check:app` y `git diff --check` correctos. Pendiente: comprobar visualmente con una sesión autenticada y datos reales. Las secciones siguientes registran la implementación anterior, reemplazada, sin autorizar una consulta completa automática.

## Objetivo
Dejar Buscar, Desde y Hasta en Kanban; resultados completos por fecha de ingreso comercial.

## Problema y por que
Mes/Año duplican controles y el rango actual filtra solo la ventana operativa (máximo 2.000), mostrando totales incompletos.

## Alcance
- Quitar Mes/Año solo de Kanban.
- Recuperar todos los leads actuales autorizados con la paginación canónica y aplicar rango inclusivo por `Fecha`.
- Buscar y contar sobre el mismo conjunto; errores/fechas inválidas explícitos.

## Out of scope
No cambiar filtros de Leads, esquema Supabase, Data Dura, citas ni estados.

## Restricciones
Mantener HTML principal sin duplicar consultas ni parser; reusar `fetchLeadsByIdCursor` y `parseFechaLead`.

## No romper
Ficha/modal, drag, scroll horizontal y vertical, CSP, build autocontenido, controles de sesión y pruebas existentes.

## TDD
Modo: off. Fuente: default. Runner: `node --test scripts/tests/kanban-periodo.test.mjs`; comprobaciones funcionales obligatorias.

## Tareas
- T1 [x] Eliminar Mes/Año de Kanban y sus listeners.
- T2 [x] Conectar paginación completa y rango de ingreso validado, sin mostrar parciales.
- T3 [x] Probar extremos, rango vacío/inválido, sesión y regresiones de compilación.

## Criterios de aceptación
- [x] Solo Buscar/Desde/Hasta en Kanban; ambos extremos inclusivos; no inventar fecha para leads sin `Fecha`.
- [x] Un rango incompleto o inválido muestra error; sin fechas se consultan todos los actuales.
- [x] No se truncan silenciosamente resultados por ventana operativa ni por paginación del servidor.
- [ ] Verificación visual/manual: tarjetas, navegación, scroll y contraste de cifras contra rango conocido.

## Decisiones aceptadas
Rango por `Fecha` comercial (no fecha de gestión ni `created_at`); sin filtros de mes/año.

## Reutilizacion investigada
`index.html:fetchLeadsByIdCursor` pagina por ID con guardas de sesión; `src/legacy/reportes.js:parseFechaLead` valida formatos/fechas; Kanban consume ambos sin nueva RPC. No se reutiliza `loadLeadsByMonth`, porque filtra por etiqueta `Mes` sin año.

## Evidencia
T1 — Estado: passed. `node --test scripts/tests/kanban-periodo.test.mjs`: solo Buscar/Desde/Hasta en el contenedor Kanban; Mes/Año siguen en Leads.

T2 — Estado: passed. Tests de rango inclusivo/fecha inválida y adaptador que usa `fetchLeadsByIdCursor('*')`; no consulta con rango incompleto; guardas de sesión del CRM, invalidación de respuestas antiguas y limpieza en cierre de sesión. No se ha contrastado visualmente con datos remotos.

T3 — Estado: passed. `pnpm test`: 849 tests JS correctos y 11 Python correctos; `pnpm build` y `pnpm check:app` sin errores; `git diff --check` limpio. `qa-gate --strict`: staged no aplicable; rutas rastreadas comprobadas. Verificación visual/manual con sesión real: pending (sin navegador autenticado disponible).

## Progreso
Estado: código y checks locales completados. Última tarea: T3. Siguiente paso: comprobación visual con sesión autenticada, comparar un rango conocido con el CRM. Bloqueos: falta verificación manual.

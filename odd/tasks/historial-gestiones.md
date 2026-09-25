# Historial de gestiones (huella) + estados DATADURA

## Objetivo
Cada cambio de estatus de un lead queda registrado con fecha, estado anterior → nuevo, canal y autor, visible en la ficha; los estados `INSCRITO DATADURA` y `AGENDADO DATADURA` se gestionan como cualquier otro estado.

## Problema y por qué
Hoy el lead solo guarda su última gestión: al cambiar `Colgó` (agosto) → `Información` (septiembre) el estado anterior se sobrescribe y no queda rastro del trabajo realizado. La atribución por mes ya es correcta (los agregados agrupan por campo `Mes`, verificado en `computeHistoricalAggregates` index.html:3406-3414), así que el lead de agosto inscrito en septiembre suma en agosto; lo que falta es la huella visible de la gestión hecha en septiembre.

## Alcance
- **T1** Migración `supabase/migrations/202609250001_create_lead_gestiones.sql`: tabla append-only `lead_gestiones` (lead_id FK cascade, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor server-side, created_at) + índice + RLS solo lectura sin políticas de escritura + trigger en `leads` (AFTER UPDATE OF GESTION WHEN OLD IS DISTINCT FROM NEW) que inserta la fila. `fecha_gestion` se extrae de `Fecha Última Gestión ` (d/m/aaaa) con fallback a current_date. La revisa y ejecuta el humano en SQL Editor.
- **T2** Línea de tiempo "Historial de gestiones" en la ficha del lead (modal de vista), ordenada por fecha, junto a las notas.
- **T3** Verificación: build/lint/diff-check/node-check/qa-gate + checklist manual.

## Restricciones
- Sin nuevas dependencias; vanilla JS; patrón RLS/trigger ya auditado (referencia migración 0008).
- Nunca SQL remoto sin revisión del humano; nunca commit/push sin petición explícita.
- El historial es solo lectura para agentes y admins: escribe únicamente el trigger.

## No romper
- RPCs y RLS de `leads`, `lead_notes`, `lead_catalogs`, `user_access` existentes.
- Atribución por `Mes`: los agregados (KPI, mensual, embudo, gráficos) no se tocan.
- `handleUpdateLead`/`handleCreateLead`: mismos ids y campos; el trigger es transparente.
- Detección por prefijo de `INSCRITO*`/`AGENDADO*`: `INSCRITO DATADURA` y `AGENDADO DATADURA` entran sin cambios de código (agregados index.html:2110-2116, 3250-3260, 3414-3415).

## TDD
Modo: off | Fuente: default | Runner: no disponible (sin runner de tests; checks funcionales obligatorios).

## Tareas
- [x] T1 migración `lead_gestiones` + trigger
- [x] T2 línea de tiempo en la ficha del lead
- [x] T3 verificación e informe

## Criterios de aceptación
- [ ] Migración 202609250001 creada, NO ejecutada por el agente.
- [ ] Cambiar un estatus dos veces → la ficha muestra ambas líneas con fecha, anterior → nuevo, canal y autor.
- [ ] Lead de agosto inscrito en septiembre: `Mes` intacto (suma en agosto) y la gestión de septiembre visible en su historial.
- [ ] Agente no puede escribir en `lead_gestiones` (sin política de escritura; solo el trigger).
- [ ] build/lint/diff-check/node-check/qa-gate verdes.

## Decisiones aceptadas
- Trigger server-side sobre auto-nota del frontend (huella completa sin depender del agente) y sobre versionado de filas completas (YAGNI).
- Dos fechas no: una sola `fecha_gestion` (declarada) + `created_at` (registro) — suficiente para auditoría y para el reporte "actividad del mes" futuro (fase 2, fuera de alcance).
- `INSCRITO DATADURA` y `AGENDADO DATADURA` se crean desde Catálogos (autogestión del humano), no en migración; el motor ya los reconoce por prefijo.
- La historia nace con la migración: no hay retroactividad (limitación aceptada).
- "Lista Data Dura" = filtro `GESTION contiene DATADURA`; nada que mover ni copiar.

## Reutilización investigada
- Patrón RLS/RPC/trigger de `202609240008_create_lead_notes.sql` (RLS select activos, sin escritura directa, RPCs security definer) — aquí sin RPC de escritura porque escribe el trigger.
- Agregados por mes `computeHistoricalAggregates`/`normalizeLeadMonth` (index.html:3394, 3225) como referencia de no-regresión.
- Bloque de notas de la ficha (`renderLeadNotes`, index.html ~2682) como patrón de UI para la línea de tiempo.

## Evidencia
- T1 — Estado: passed (worker + verifier independiente). Fichero `supabase/migrations/202609250001_create_lead_gestiones.sql`; checks: `git diff --check` exit 0; verificador contrastó tabla/RLS/trigger/columnas exactas contra migración 0003 (4/5 OK, sin ejecución remota — NO aplicada, pendiente del humano).
- T2 — Estado: passed (worker + verifier independiente). `npm run build` OK (Vite, warning informativo de `__dirname`); `npm run lint` OK (`tsc --noEmit`); `git diff --check` OK; `node --check` OK. Historial paralelo a notas (`Promise.all`), orden por fecha/creación, todo dato inyectado con escapeHtml (verificador: sin vectores XSS), sección oculta si la tabla no existe (degradación silenciosa, notas intactas). Solo se modificó `index.html` vs HEAD 3185bbc.
- T3 — Estado: passed. Suite final: build 192.54 kB OK, lint OK, `git diff --check` OK, `node --check` OK (2 scripts inline), 0 `getElementById` sin id, qa-gate sin hallazgos nuevos (solo `.env.example` preexistente).
- Checklist manual pendiente del humano: aplicar migración 202609250001 → cambiar dos veces un estatus → la ficha muestra ambas líneas con fecha, canal y autor; lead de agosto con `INSCRITO DATADURA` suma en agosto con la gestión de septiembre visible.

## Progreso
- Estado: implementación completa y verificada en local (T1-T3 passed).
- Última tarea: T3.
- Siguiente paso: humano revisa y ejecuta `202609250001_create_lead_gestiones.sql` en SQL Editor, crea los estados DATADURA desde Catálogos y pasa el checklist manual; luego decide commit.
- Bloqueos: migración remota + prueba manual; commit/push pendiente de petición explícita.

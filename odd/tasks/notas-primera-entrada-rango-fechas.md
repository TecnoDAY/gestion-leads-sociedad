# Notas por lead, primera entrada 2025 y rango de fechas en histórico

## Objetivo
Tres mejoras aprobadas sobre el dashboard de leads: (F1) notas de equipo por lead en tabla `lead_notes` con protección real server-side; (F2) indicar en la ficha cuándo un contacto entró primero como lead en 2025; (F3) filtro de rango de fechas (calendario) en el panel de gráficos históricos, unificando la lógica de fechas.

## Problema y por qué
- F1: las observaciones se concatenan en `OBSERVACIONES ` (límite 5.000 con truncado silencioso); no hay historial de quién anotó qué ni cuándo, y los agentes no deberían poder editar/borrar notas ajenas (hoy no existe tal protección).
- F2: un contacto visto en 2026 que ya existía en 2025 no muestra su fecha real de primera entrada; el usuario ve repetidos entre años y quiere saber de entrada en la ficha.
- F3: el panel histórico solo filtra por mes; no se puede consultar "de este lunes a pasado martes" ni por rangos (últimos 7/30 días). Además la lógica de fecha está duplicada (~40 líneas) entre `renderHistoricalAnalytics` y `exportHistoricalSummaryCSV` (deuda registrada en `historicos-mensuales.md`).

## Alcance
- **F1**: migración `supabase/migrations/202609240008_create_lead_notes.sql` (tabla append-only + RLS + RPCs `create_lead_note`, `update_lead_note`, `delete_lead_note`); timeline de notas en la ficha (`openViewLeadModal`): añadir (agente/admin), editar/borrar (solo admin), todo vía RPC. El usuario revisa y ejecuta la migración en SQL Editor (nunca remota sin revisión).
- **F2**: línea "Primera entrada como lead: \<fecha\> (2025)" en la ficha cuando exista registro relacionado (mismo `telefono_normalizado`) con fecha anterior en 2025; cálculo client-side sobre `allLeads`+`allHistorico` ya cargados.
- **F3**: helper `parseFechaLead(lead)` (d/m/aaaa, d-m-aaaa, d/m/aa, aaaa-mm-dd) usado por todo; inputs `Desde`/`Hasta` (`type=date`) + presets (últimos 7 días, últimos 30 días, este mes, limpiar) en el panel histórico; precedencia rango > mes; contador visible de registros sin fecha válida excluidos; tabla mensual y CSV filtrados al rango; extraer agregación mensual común para eliminar la duplicación con `exportHistoricalSummaryCSV`.

## Restricciones
- Sin proveedor de email/SMTP; sin OTP. Auth solo por contraseña.
- Sin nuevas dependencias (solo Chart.js); sin React; vanilla JS en `index.html`.
- Nunca exponer claves service/secret en el frontend.
- Nunca ejecutar migraciones ni SQL remoto sin revisión/aprobación del humano.
- Nunca commit/push sin petición explícita.
- No sobrescribir teléfonos existentes de `leads`; el histórico 2025 es solo lectura y fuera de KPIs actuales por defecto.
- RLS/roles: protección de notas server-side real (RLS/RPC), no solo UI oculta.

## No romper
- Contratos RPC existentes: `create_lead`, `update_lead_followup`, `update_lead_full`, `archive_lead`, `restore_lead`, `admin_manage_user_access`, `is_active_user`, `is_admin_user`.
- Carga de `leads`/`leads_historico` con cursor id-desc por bloques de 1000; selector de origen (actual/histórico/todos); bloque de repetidos por origen+id en las 6 llamadas existentes.
- `npm run build`, `npm run lint` en verde; `git diff --check` sin whitespace.
- Fichas/exports existentes: `exportCurrentLeadsCSV`, badge "Histórico 2025", defensas de solo lectura del histórico.

## TDD
Modo: checks funcionales obligatorios (sin runner de tests en el proyecto). Por tarea: build + lint + `git diff --check` + qa-gate + checklist manual rol (agente/admin) documentado en Evidencia. F1 incluye checklist de seguridad RLS (agente no puede editar/borrar notas ajenas) verificable por revisión del SQL + prueba manual del humano tras ejecutar la migración.

## Tareas
- [x] T1 (F1): migración `lead_notes` + RPCs con guardas admin/append-only.
- [x] T2 (F1): timeline de notas en la ficha (añadir/editar/borrar vía RPC, editar/borrar ocultos a no-admin con defensa server-side).
- [x] T3 (F2): línea "Primera entrada como lead" calculada sobre registros relacionados.
- [x] T4 (F3): `parseFechaLead` + rango Desde/Hasta + presets + precedencia sobre mes + contador sin fecha + tabla/CSV filtrados + eliminar duplicación de agregación.
- [x] T5: verificación final (build, lint, diff --check, qa-gate) e informe a odd-verifier.

## Criterios de aceptación
- [x] Migración 0008 creada, revisable y NO ejecutada por el agente; usuario puede ejecutarla en SQL Editor.
- [x] `lead_notes`: INSERT/SELECT para agentes, UPDATE/DELETE solo admin, todo por RPC/RLS (sin políticas de escritura directa para agentes).
- [ ] Ficha: añadir nota funciona para agente y admin; editar/borrar visible solo para admin y rechazado por el servidor para agente. *(pendiente de prueba manual del humano tras ejecutar la migración)*
- [x] Ficha muestra "Primera entrada como lead: \<fecha\> (año)" cuando hay registro 2025 relacionado con teléfono igual; no la muestra si no hay relación.
- [x] Panel histórico: Desde/Hasta filtran gráficos, KPIs, tabla mensual y CSV; presets funcionan; rango tiene precedencia sobre mes; contador de sin-fecha visible cuando aplica.
- [x] `npm run build` OK, `npm run lint` OK, `git diff --check` OK, qa-gate sin hallazgos nuevos.
- [x] Sin duplicación de agregación mensual entre render y export (deuda de `historicos-mensuales.md` cerrada).

## Decisiones aceptadas
- F1 como tabla `lead_notes` (append-only), NO concatenación en `OBSERVACIONES` (riesgo de truncado a 5.000).
- Admin puede todo (editar/borrar cualquier nota); agente solo añade: protección real en RLS/RPC.
- F2 sin vista SQL: cálculo client-side sobre datos ya cargados.
- F3 con `<input type=date>` nativo + presets; rango precede al filtro de mes; helper único `parseFechaLead`.
- Migración 0008 la revisa y ejecuta el humano en SQL Editor.

## Reutilización investigada
- Patrón RLS/RPC y guardas `is_admin_user()`/`is_active_user()` de `202609230001_secure_otp_roles_archiving.sql` (reutilizado como canónico para `lead_notes`).
- Patrón de tabla de solo lectura + metadatos de `202609240004_create_leads_historico.sql`.
- Bloque de relacionados por teléfono en `openViewLeadModal` (líneas ~2487-2549 de `index.html`) reutilizado como fuente de registros para F2.
- Duplicación render/export registrada en `odd/tasks/historicos-mensuales.md` (se cierra en T4).

## Evidencia
- Verificación independiente (odd-verifier, sesión ses_f2a7cd8e7ffexRuZlrFHI0tTSD): **SUMMARY: 8/8 checks pasados / RESULT: PASS**. Checks: build 0, lint 0, `git diff --check` 0, `node --check` de ambos `<script>` inline OK, seguridad F1 (admin_required en update/delete, sin política de escritura directa, author_name server-side, revoke/grant correctos, migración NO aplicada), frontend F1 (guardas isAdmin + escapeHtml + sin módulo de notas en origen historico), F2 (solo si el mínimo es de 2025, excluye propio por origen+id, escapado), F3 (precedencia rango>mes, contador excludedNoDate, agregación sin duplicación, parseFechaLead probado con 9 casos), regresiones (0 ids inexistentes, 0 funciones sin definir).
- 4 observaciones no bloqueantes del verificador, corregidas: (1) `author_user_id` ahora nullable (antes `not null` + `on delete set null` contradictorio); (2) `revoke select ... from anon` añadido en la migración; (3) el sufijo del año en la línea F2 se calcula de la fecha mínima en vez de hardcodear `(2025)` (los datos tienen 3 filas fuera de 2025); (4) `parseFechaLead` ahora valida días por mes real (`31/02/2025` → null).
- Tras las correcciones: build 177.71 kB OK, lint OK, `git diff --check` OK, `node --check` OK, tests de `parseFechaLead` (9 casos: d/m/aaaa, d-m-aaaa, d/m/aa, ISO y inválidas) todos OK.
- qa-gate: sin hallazgos nuevos (solo aviso preexistente de `.env.example` rastreado).
- Fix extra (post-migración 0008, señalado por el humano): el modal de la ficha no hacía scroll con fichas largas (8 repetidos + notas). Aplicada Opción A: panel del modal con `max-h-[90dvh] flex flex-col`, `viewLeadContent` con `overflow-y-auto min-h-0` y header/footer con `shrink-0` (solo el cuerpo hace scroll). Verificado: build 177.78 kB OK, lint OK, `git diff --check` OK, `node --check` OK.
- Segunda pasada de limpieza (aprobada por el humano): (a) scroll aplicado a `modalNewLead`, `modalEditLead` y `panelAdminUsers` con el mismo patrón (`modalRls` ya lo tenía — referencia canónica); (b) edición inline de notas sustituyendo `prompt()`: estado `editingNoteId`, render cache-driven `renderLeadNotes()`, textarea con Guardar/Cancelar y foco automático, reset al cambiar de ficha y tras guardar/borrar. El `confirm()` de borrado se mantiene. Verificado: build 179.74 kB OK, lint OK, `git diff --check` OK, `node --check` OK, qa-gate sin hallazgos nuevos, `prompt(` solo en comentario.
- Checklists manuales por rol (agente/admin) pendientes de ejecución por el humano tras aplicar la migración 0008.

## Progreso
- Estado: implementación completa y verificada (PASS 8/8); correcciones de observaciones aplicadas.
- Última tarea: T5.
- Siguiente paso: humano revisa y ejecuta `202609240008_create_lead_notes.sql` en SQL Editor, luego prueba manual de notas (agente: solo añadir; admin: editar/borrar) y del panel de rango de fechas.
- Bloqueos: prueba manual F1 y commit/push pendientes de petición explícita del humano.

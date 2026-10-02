# Feature: nuevo Reporte Diario (RPC agregada + diseño Resumen → Comparativa → Detalle)

## Objetivo
Rediseñar la pestaña Reporte con las métricas de la hoja manual de las asesoras, conteos correctos (Asistió ya no cuenta como agendado), llamadas con desglose Data Dura, filtro por asesora y diseño Resumen → Comparativa por asesora → Detalle.

## Problema y por qué
- El reporte actual no tiene: procedencia por Medio (WhatsApp/FB·IG/CogniTalking/Directo-Referido/Otros), llamadas normales vs Data Dura vs Llamada+WhatsApp, Agendados Data Dura, ni filtro por asesora.
- Bug de conteo: `agendados` = todas las citas no-data-dura (incluye ASISTIO/NO_ASISTIO/CANCELADA/REPROGRAMADA) → quien asistió cuenta también como agendado pendiente.
- Cita histórica sin marcar: lead 4979 pasó a "Agendado data dura" (evento 9606 del 01/10/2026) y sus citas 9 (CANCELADA) y 10 (PROGRAMADA) se crearon cuando `is_data_dura` no existía → `is_data_dura=false` incorrecto. Evidencia remota: created_at de citas ≥ created_at del evento.

## Alcance
Incluye:
1. Migración `202610010004_daily_management_report.sql`:
   - Corrección guardada: UPDATE de lead_appointments 9 y 10 a is_data_dura=true SOLO si (lead 4979 con gestión Agendado data dura, evento 9606 existe sin borrar, citas existen con su created_at/stamp ≥ evento, respetar si ya son true → idempotente). Aborta si los IDs/datos no coinciden.
   - RPC `daily_management_report(p_fecha date, p_autor_user_id uuid default null)` jsonb, security definer, is_crm_user, revoke/grant como de costumbre.
2. Frontend `index.html`: cabecera Fecha|Asesora|CSV; Resumen general (5 KPIs); tabla Comparativa por asesora con "Ver detalle ▾"; Detalle por asesora con las 4 tablas (Procedencia, Llamadas, Citas pendientes+Resultados, Inscripciones) + Problemas/Observaciones; filtro de asesora alimenta la RPC.
3. CSV del reporte con todas las columnas nuevas, desde la misma respuesta.
4. Tests en `scripts/tests/t5-frontend-edge.test.mjs` (+ Python si aplica).

Excluye: WhatsApp (webhook); "Reserva de clientes SAH" (sin definición aprobada — NO aparece en la UI); gráficos; cambios en Campañas/histórico; ranking competitivo.

## Restricciones
- `Reserva de clientes SAH` queda EXPLÍCITAMENTE fuera (usuario no sabe qué es; no inventar).
- "Total Leads" actual = total gestionados (acciones), conservar la métrica vigente como pidió el usuario; el detalle podrá mostrar acciones por gestión dentro de procedencia.
- Clasificación Data Dura: reutilizar la misma regla que `isInscritoDataDura` (Mes distinto del mes del reporte o Fecha de otro año) — implementada en SQL.
- Identidad de asesora: por user_id cuando exista, nombre solo en fallback legacy.
- Granularidad de citas: scheduled_at en el día Miami (miamiDayBounds vigente).
- Sin PII en tests.

## No romper
- `update_lead_followup`/with_appointment/full recién aplicados; triggers gestión/meta/contactos; `campaign_monthly_rollup`.
- Suite actual: 189 Node + 11 Python.
- El reporte actual sigue funcionando si la RPC falla (fallback: bloques actuales) durante la transición — decidir en T2; mínimo un warning visible sin dejar pantalla vacía.

## TDD
Modo: on. Fuente: proyecto. Runner: `npm test` (Node+Python).

## Tareas
- [x] T1 Migración: corrección guardada de citas 9/10 + RPC daily_management_report.
- [x] T2 Frontend: cabecera con filtro asesora, Resumen (5 KPIs), tabla comparativa, detalle por asesora (4 tablas + notas), estados vacío/error/cargando, filtros desplegables móvil. Tests legacy sustituidos por 4 tests RPC del nuevo contrato.
- [x] T3 CSV actualizado desde la respuesta RPC.
- [x] T4 Integral: `npm test` 186 Node + 11 Python, `lint`, `build`, `git diff --check` y qa-gate verdes. Aplicación remota de la migración ya hecha (daily_management_report_v2, 20261002023907); commit/push pendiente de decisión humana.

## Criterios de aceptación
- UN lead con 1 llamada y 1 Whatsapp: Procedencia según Medio del lead; Llamadas según canal.
- Cita ASISTIO solo en Visitas, NO en Agendados.
- Cita Data Dura PROGRAMADA (como la 10) en "Agendados Data Dura", no en "Agendados del día".
- Filtro por asesora recorta bloques y KPIs.
- Total general = suma de bloques por asesora.
- UI en desktop 1 pantalla para el resumen; móvil con acordeones.

## Decisiones aceptadas
- Llamada WhatsApp = canal combinado únicamente (Llamada y WhatsApp), case-insensitive por variantes de title_case.
- Las gestiones exclusivamente WhatsApp NO son llamadas.
- Reserva SAH fuera hasta definición.
- Total Leads = métrica actual (gestionados/acciones) conservada.
- Diseño híbrido Resumen + Comparativa + Detalle (aprobado).

## Reutilización investigada
- `renderReporteBloque`/`renderReporteTotal` actuales se reescriben; mantener saveReporteNota/deleteReporteNota sin cambios (RPC válida).
- `miamiDayBounds`, `fetchPagedResult`, `groupGestionEstado`, `isInscritoDataDura` para la lógica equivalente en SQL.
- Pattern advisor filter: `filterAsesora` del dashboard (T5 previo) como referencia.

## Evidencia
- Remoto (2026-10-01): lead 4979 → evento 9606 (Repetido→Agendado data dura, 2026-10-01 20:23). Citas 9 (CANCELADA, created 20:23) y 10 (PROGRAMADA, created 20:29) — ambas is_data_dura=false, deberían ser true.
- Estados de citas actuales: ASISTIO 1, CANCELADA 3, NO_ASISTIO 2, PROGRAMADA 3, REPROGRAMADA 1 (todas no-data-dura; tras el fix, la cita 10 pasa a data-dura).

- Corrección del verificador aplicada: procedencia, llamadas y legado por nombre calculados en la RPC.
- T2: se sustituyeron los 7 tests legacy del reporte por cobertura RPC de fecha/KPIs, comparativa-detalle-notas, filtro y estados vacío/error. `npm test`, `npm run lint`, `npm run build` y `git diff --check` OK.

## Progreso
- Estado: T1–T4 verificadas (con corrección de T1 detectada por verifier antes de aplicarla). Migración aplicada en remoto; commit/push pendiente de decisión humana.
- Evidencia T1 remota: RPC registrada, `crm_access_forbidden` sin sesión (comportamiento esperado desde MCP), citas 9/10 `is_data_dura=true`, placeholder previo de migración purgado.

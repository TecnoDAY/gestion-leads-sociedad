# Feature: Teléfono editable por asesoras + Tipo de Última Gestión manual con Llamada Data Dura

## Objetivo
La asesora edita el Teléfono en el mismo formulario de seguimiento (hoy solo admin puede) y elige manualmente el tipo de última gestión, incluida "Llamada Data Dura"; el reporte la cuenta en su columna sin duplicados.

## Reglas confirmadas por el usuario
1. Selección MANUAL: el sistema no modifica ni elige la opción según el mes.
2. Opciones: Llamada, Llamada Data Dura, WhatsApp, Llamada y WhatsApp, Instagram, Visita Conservatorio.
3. Reporte: del_dia←Llamada; data_dura←Llamada Data Dura; llamada_whatsapp←Llamada y WhatsApp; total = suma de los 3.
4. Históricos sin marca explícita (is_data_dura NULL) conservan la regla antigua por Mes/Fecha.

## Diseño
- `leads."ULTIMA GESTION"` guarda literalmente "Llamada Data Dura" (para re-selección al abrir).
- Trigger `record_lead_gestion`: si el canal es "Llamada Data Dura" → `lead_gestiones.canal='Llamada'`, `is_data_dura=true`; si "Llamada" → `is_data_dura=false`; resto de canales → NULL.
- RPC `daily_management_report`: `llam_dd` usa `g.is_data_dura is true OR (is_data_dura is null AND regla Mes/Fecha)`; `llam_dia` usa `g.is_data_dura is false OR (null AND NOT regla)`. Canal normalizado lower+trim.
- `update_lead_followup` y `update_lead_with_appointment` (rama no-admin) aceptan `Telefono`:
  - Solo se VALIDA cuando cambia respecto al valor actual (7-15 dígitos tras limpiar); si no cambia, no se valida (los históricos vacíos no bloquean el seguimiento).
  - El trigger `leads_set_contact_id` ya recalcula `contact_id`.
- Frontend `handleUpdateLead`: enviar `Telefono` solo si cambió respecto al valor original; campo Teléfono visible para todos, junto a Nombre.
- Historial de la ficha: mostrar "Llamada Data Dura" cuando `lead_gestiones.is_data_dura = true`; la consulta de gestiones añade `is_data_dura`.

## Alcance
Incluye: migración `202610020001_canal_datadura_manual_telefono.sql`, index.html (selector, teléfono, historial), RPC reporte, tests.
Excluye: clasificación automática, backfill histórico, cambios en Medio/procedencia, WhatsApp/Meta.

## TDD
Modo: on. Fuente: proyecto. Runner: `npm test`.

## Tareas
- [x] T1 Migración: columna is_data_dura en lead_gestiones, trigger, RPCs de edición con Telefono, RPC reporte. Aplicada remoto como `canal_datadura_manual_telefono` (2026-10-02).
- [x] T2 Frontend: selector con las 6 opciones (preservando valores históricos), Teléfono editable fuera del bloque admin, envío solo si cambia, historial muestra Llamada Data Dura.
- [x] T3 Tests: canal data dura en reporte, teléfono asesora, teléfono inválido rechazado, no-duplicación de conteos, histórico NULL.
- [x] T4 Integral: gates (npm test, lint, build, diff-check, qa-gate) + aplicación remota + commit/push.

## Progreso
- Estado: completada. Ver evidencia abajo.

## Evidencia
- Migración aplicada en remoto (2026-10-02): `is_data_dura` en lead_gestiones, trigger normaliza canal, update_lead_followup/update_lead_with_appointment (no-admin) guardan "Telefono" con validación 7-15 dígitos solo cuando cambia, RPC daily_management_report con prioridad manual > regla histórica.
- Frontend: campo Teléfono al lado de Nombre en "Actualizar Seguimiento"; selector con 6 opciones; `handleUpdateLead` envía Telefono solo si cambió; historial de la ficha muestra "Llamada Data Dura" cuando is_data_dura=true.
- Tests: nuevas aserciones en t5-frontend-edge (Teléfono visible fuera del bloque admin, opción Llamada Data Dura presente, envío condicional en handleUpdateLead) y verificación del SQL (trigger/allowlist/RPC). 192 Node + 11 Python, lint, build, diff-check, qa-gate en verde.

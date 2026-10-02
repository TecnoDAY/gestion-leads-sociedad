# Sede de la cita: Doral / Weston

## Objetivo
Distinguir la sede de la cita (Doral o Weston) sin cambiar el estado de gestión ni la campaña de origen: un lead puede llegar por Weston y ser agendado en Doral.

## Decisión (aprobada)
- NO crear estados "Agendado Doral/Weston/Data Doral/Data Weston": estado (Agendado), clasificación (is_data_dura) y sede (campus) son conceptos separados.
- `lead_appointments.campus text check (campus in ('DORAL','WESTON'))` NULL = citas existentes (sin sede, no se inventa).
- Citas nuevas exigen sede; firmas RPC antiguas conservadas temporalmente crean con NULL para no romper clientes en transición.
- Reprogramar conserva campus. Corrección posterior: `update_lead_appointment_campus` (asesor asignado o admin).
- Reporte Diario: Agendados Doral, Doral Data Dura, Weston, Weston Data Dura + Total (sin duplicar).

## Tareas / Evidencia
- [x] T1 Migración `202610020007_appointment_campus.sql` aplicada remoto (3 partes: t1 columnas+RPCs de creación, t2 update/reschedule/campus-edit, t3 reporte; la última aplicada con execute_sql tras rechazar `,'')))` por la capa MCP como bloque multilínea; verificada con `pg_get_functiondef` = tiene_sede).
- [x] T2 Frontend: radios Doral/Weston obligatorios en las 3 rutas de cita; columna Sede, filtro y KPIs en Citas; ver/editar sede en la ficha (`update_lead_appointment_campus`, asesor asignado o admin).
- [x] T3 Reporte Diario: 4 contadores nuevos por sede en panel y CSV; ayuda actualizada; 200 Node + 11 Python, lint, build, diff-check, qa-gate.
- [ ] T4 commit/push.

## Correcciones durante implementación
- El wrapper SQL fallaba al crearse antes que la función de 6 args → se reordenó (nueva primero, wrapper después).
- La capa JSON/MCP devolvía `42601 syntax error at or near )` cuando el texto contenía `,'')))` sin espacio; normalizado a `, '')` en el archivo de migración y al reenviar.

## Progreso
- Estado: implementada y verificada; pendiente commit/push.

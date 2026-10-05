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
- [x] T2b Sede en lead ya Agendado: el modal Actualizar Seguimiento muestra la cita vigente con radios Doral/Weston, precarga la sede, obliga a elegirla cuando la cita historica no la tiene, y la guarda con `update_lead_appointment_campus` antes del seguimiento (sin crear ni duplicar citas). Si hay 0 o varias citas PROGRAMADA, o no hay permiso, muestra aviso y manda a la ficha.
- [x] T4 HOTFIX produccion 2026-10-05: regresion critica 400 `appointment_required_for_agendado_transition` porque `create_lead_with_appointment` llamaba a `create_lead` (que prohibe AGENDAD*). Migracion `202610050001_fix_atomic_appointment_creation.sql`: funcion interna `_create_lead_with_gestion`, ruta publica solo-rechaza-sin-cita y ruta atomica usa la interna; revoking absorcion de la interna (auth, anon, service_role, public = false). Ademas: los bloques condicionales de cita pasan de `hidden`+required a controles `disabled` cuando no aplican, limpieza completa de campos, traduccion de errores RPC a mensajes comprensibles y ficha + citas incluyen campus/is_data_dura. Gates: 202 Node + 11 Python, lint, build, diff-check, qa-gate.
- [x] T5 Hotfix frontend `6f5ad08`: se definio `appointmentCampusFrom`, cuya ausencia lanzaba `ReferenceError` antes de cualquier RPC. Produccion verificada con la funcion publicada; 203 Node + 11 Python, lint, build y diff-check verdes.
- [x] T6 Contrato RPC completo para asesoras/admin: corregido `p_advisor_user_id: null` en Informacion -> Agendado y crear cita desde ficha; tests runtime cubren las 8 mutaciones y los conjuntos exactos de parametros. Ademas, seguimiento + correccion de sede usan la RPC atomica nueva `update_lead_followup_with_appointment_campus` para evitar guardados parciales.
- [x] T7 Hora de citas siempre Miami: los cuatro `datetime-local` se convierten desde `America/New_York`, las vistas muestran Miami y los filtros arrancan con fecha Miami; pruebas cubren EST, EDT, hora DST inexistente y ambigua. No se modifican citas existentes.
- [ ] T8 Verificacion integral local y remota: local pasado (207 Node + 11 Python, lint, build, diff-check); migracion nueva compila en remoto dentro de `ROLLBACK` (`persisted=false`). Pendiente autorizacion para aplicar backend, publicar frontend y prueba real de Loli con HTTP 200, una gestion y una cita sin duplicados.

## Correcciones durante implementación
- El wrapper SQL fallaba al crearse antes que la función de 6 args → se reordenó (nueva primero, wrapper después).
- La capa JSON/MCP devolvía `42601 syntax error at or near )` cuando el texto contenía `,'')))` sin espacio; normalizado a `, '')` en el archivo de migración y al reenviar.

## Progreso
- Estado: reabierta por 7 HTTP 404 en `update_lead_with_appointment` de una asesora. Causa confirmada: PostgREST exige el conjunto exacto de nombres y el frontend omite `p_advisor_user_id` para no-admin; la misma omision existe al crear cita desde la ficha.
- TDD: on (fuente: usuario/valor de regresion; runner: `node --test scripts/tests/t5-frontend-edge.test.mjs`, luego `npm test`).
- Evidencia T6: RED observado por ausencia de `p_advisor_user_id`; GREEN en `node --test scripts/tests/t5-frontend-edge.test.mjs` (71/71 tras matriz y atomicidad).
- Evidencia T7/T8 local: `npm test` = 207/207 Node + 11/11 Python; `npm run lint` OK; `npm run build` OK; `git diff --check` OK; dry-run Supabase de `202610050002_atomic_followup_appointment_campus.sql` = ok + rollback, no persistido.
- QA: sin hallazgos nuevos en el diff; `qa-gate` solo avisa por `.env.example` rastreado previamente e intencionalmente. Barrido reliability sin tiempo hardcodeado, mocks fragiles ni aleatoriedad nueva.
- Siguiente: aplicar backend primero con autorizacion, verificar definicion/ACL remota, despues commit/push frontend y prueba real de Loli.

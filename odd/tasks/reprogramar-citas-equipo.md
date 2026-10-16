# Reprogramar citas entre asesoras

## Objetivo
Cualquier asesora activa puede reprogramar una cita PROGRAMADA creada o asignada a otra asesora, con historial visible de quien lo hizo y de las horas anterior y nueva.

## Problema y por que
Los turnos compartidos impiden gestionar una cita cuando la asesora asignada no esta presente. La restriccion estaba en la RPC (`advisor_user_id = auth.uid()`) y en la UI. El historial `lead_appointment_events` ya registra actor y estados, pero no las horas.

## Alcance
- Incluye: RPC de reprogramacion, lectura del historial para el CRM, boton de reprogramar, historial en la ficha y ayuda.
- Ampliacion aprobada: asistencia, ausencia y cancelacion entre asesoras, con historial.
- Excluye: edicion de datos/sede y borrado; conservan sus permisos.

## Restricciones
- Conservar la asesora asignada original.
- Una sola cita PROGRAMADA por lead.
- Trafficker sigue sin acceso CRM.
- Sin escritura de datos de usuario durante la migracion.

## No romper
- `update_lead_appointment_details`, `update_lead_appointment_campus`, `delete_lead_appointment`.
- Indice unico de cita programada.
- Reportes que atribuyen la cita a `advisor_user_id` / `advisor_name`.

## TDD
Modo: off
Fuente: default
Runner: `node --test scripts/tests/citas-lead.test.mjs`

## Tareas
- [x] T1 Migracion: ampliar reprogramacion y columnas de hora del historial.
- [x] T2 UI: boton de reprogramar para cualquier asesora e historial en la ficha.
- [x] T3 Ayuda y tests.
- [x] T4 Aplicar y verificar en remoto.
- [x] T5 Ampliar resultados entre asesoras, conservar historial y verificar en local. Migracion remota pendiente de autorizacion aparte.

## Criterios de aceptacion
- [ ] Una asesora distinta ve y puede usar Reprogramar.
- [ ] El servidor acepta CRM activo y rechaza trafficker o inactivo.
- [ ] El historial muestra actor, hora anterior y hora nueva.
- [ ] Asistencia, ausencia y cancelacion disponibles entre asesoras con historial; edicion y borrado no cambian de permiso.
- [ ] La asesora asignada no cambia al reprogramar.

## Decisiones aceptadas
- Reutilizar `lead_appointment_events` en vez de `updated_by_user_id`.
- Anadir `scheduled_at_anterior/nuevo` porque el historial no podia reconstruir la hora cambiada.
- No transferir la cita a quien reprograma.

## Reutilizacion investigada
- Canonico: `reschedule_lead_appointment` y trigger `record_lead_appointment_event`.
- Descartado: columna de ultimo editor, porque no es historial.

## Evidencia
- T5: tests citas-lead + t5-frontend-edge: 147 passed, 0 failed. `npm run lint`: passed. Revision independiente: PASS (estatica, sin prueba PostgreSQL concurrente).
- QA strict: sin staged, rutas rastreadas comprobadas; no audita cambios unstaged.
- `202610160006_appointment_team_status.sql` preparada, NO aplicada. Prueba funcional remota entre asesoras pendiente de autorizacion de migracion; no se realizo push.
- 2026-10-16: `apply_migration` `reschedule_any_active_advisor` y `appointment_event_previous_time`: success.
- Remoto: reprogramar ya no exige asesor asignado, exige CRM, conserva `advisor_user_id`; asistencia sigue restringida; anon sin execute; columnas y politica de historial confirmadas.
- `node --test scripts/tests/citas-lead.test.mjs`: 8 pass, 0 fail.
- Correccion del verificador: el evento nuevo lee la hora de `rescheduled_from_id`.

## Progreso
Estado: T1-T4 remoto previo; T5 verificado local, pendiente aplicacion remota
Ultima tarea: T5
Siguiente paso: validar botones en local y autorizar migracion aparte para guardar acciones entre asesoras
Bloqueos: permiso remoto de resultados aun restringido a asesora asignada/admin

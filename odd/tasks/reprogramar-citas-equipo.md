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
- [x] T5 Ampliar resultados entre asesoras, conservar historial y verificar en local/remoto.
- [x] T6 Distinguir autora y asesora asignada; reparar carga de historial y avisar si falla.

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
- T6: encabezado `Creada por` / `Reprogramada por` toma `actor_name` del evento INSERT (`status_anterior IS NULL`). Si falta nombre/evento: `Autor no disponible`. Nunca inferir del ultimo seguimiento o de la asesora asignada. No se modifica atribucion de reportes.

## Reutilizacion investigada
- Canonico: `reschedule_lead_appointment` y trigger `record_lead_appointment_event`.
- Descartado: columna de ultimo editor, porque no es historial.
- T6: reutilizados `lead_appointment_events`, paginador por ID y plantilla `citasLeadHtml`; no se necesitan tablas, columnas ni otra consulta de perfiles. El evento INSERT existente es la fuente canonica del nombre del autor.

## Evidencia
- T5: tests citas-lead + t5-frontend-edge: 147 passed, 0 failed. `npm run lint`: passed. Revision independiente: PASS (estatica, sin prueba PostgreSQL concurrente).
- QA strict: sin staged, rutas rastreadas comprobadas; no audita cambios unstaged.
- `202610160006_appointment_team_status.sql` aplicada en Supabase como version `20261016165526`.
- Verificado RPC remoto, trigger de historial, `anon` sin EXECUTE y `authenticated` con EXECUTE. Advisories de seguridad/performance devuelven solo hallazgos preexistentes, no ligados a esta migracion.
- 2026-10-16: `apply_migration` `reschedule_any_active_advisor` y `appointment_event_previous_time`: success.
- Remoto: reprogramar ya no exige asesor asignado, exige CRM, conserva `advisor_user_id`; asistencia sigue restringida; anon sin execute; columnas y politica de historial confirmadas.
- `node --test scripts/tests/citas-lead.test.mjs`: 8 pass, 0 fail.
- Correccion del verificador: el evento nuevo lee la hora de `rescheduled_from_id`.
- T6 (2026-10-16): consulta SQL read-only confirma cita 51, previa 33, asignada Ana, creadora Jessica y evento INSERT Jessica. `authenticated` tiene SELECT de eventos; `anon` no. No se escribio en remoto.
- Causa raiz: la consulta de eventos omitia `id`, requerido por `fetchRowsByIdCursor`; este lanzaba `La paginacion por id no pudo avanzar` y el loader descartaba el error. Ahora incluye ID, usa solo orden ID durante paginacion y ordena el historial acumulado por fecha/ID al terminar. El fallo se muestra con `role="alert"` sin ocultar las citas.
- T6 passed: `node --test scripts/tests/citas-lead.test.mjs scripts/tests/session-isolation.test.mjs scripts/tests/t5-frontend-edge.test.mjs`: 225 passed. Primer intento detecto tres fixtures sin la nueva bandera de error; corregido el fixture compartido, no el comportamiento de produccion.
- T6 passed: `npm test`: 648 tests Node + 11 Python, cero fallos; `npm run lint`; `git diff --check`.
- T6 passed con limite: `bash ~/.config/opencode/scripts/qa-gate.sh --strict`: sin staged, rutas rastreadas comprobadas; no audita codigo unstaged. Revision manual del diff propio: sin secretos, logs nuevos ni catch vacios. Reliability: tests nuevos sin relojes ni esperas; sin hallazgos nuevos.
- Advisories consultados read-only: hallazgos preexistentes de funciones/indices y configuracion; ninguno prueba la causa de este fallo de UI. Referencia: https://supabase.com/docs/guides/database/database-linter . Logs consultados sin modificar configuracion.

## Progreso
Estado: T6 implementada, verificada y publicada en el commit actual pendiente de push
Ultima tarea: T6
Siguiente paso: smoke test autenticado con dos cuentas
Bloqueos: no se hizo smoke test autenticado; sin migraciones remotas nuevas

-- Ratificacion del modelo de citas por EQUIPO (turnos cruzados entre asesoras).
-- Las migraciones ya aplicadas no se editan: el contrato vigente se documenta
-- aqui con los comentarios de la funcion, que es la fuente que se lee al usar
-- la RPC. No cambia el comportamiento de ninguna funcion.
--
-- Contexto de negocio: las asesoras trabajan por turnos distintos, asi que la
-- visita agendada puede comprobarla y registrarla otra asesora. Por eso
-- cualquier usuario CRM activo puede registrar el resultado o reprogramar una
-- cita aunque la asesora asignada sea otra. La autoria NO se pierde: cada
-- cambio escribe un evento con el actor (action_user_id/action_name), que la
-- ficha muestra como historial. Editar los datos de la cita y eliminarla
-- siguen siendo de la asesora asignada o de un admin.
begin;

comment on function public.set_lead_appointment_status(bigint, text, text) is
  'Modelo de equipo ratificado (turnos cruzados): cualquier usuario CRM activo (is_active_user + is_crm_user) registra ASISTIO/NO_ASISTIO/CANCELADA de cualquier cita, aunque la asesora asignada sea otra. La autoria se conserva en lead_appointment_events (action_user_id/action_name = actor) y se ve en el historial de la ficha. Editar datos y eliminar cita siguen siendo de la asesora asignada o de un admin.';

comment on function public.reschedule_lead_appointment(bigint, timestamp with time zone, text) is
  'Modelo de equipo ratificado (turnos cruzados): cualquier usuario CRM activo reprograma una cita de otra asesora. El cambio queda en lead_appointment_events con el actor y las dos fechas (scheduled_at_anterior/scheduled_at_nuevo).';

comment on function public.record_lead_appointment_event() is
  'Trigger de trazabilidad: cada cambio de estado de una cita escribe actor (action_user_id/action_name), estado anterior y nuevo, y las fechas. Es la fuente del historial por actor que muestra la ficha del lead.';

comment on table public.lead_appointment_events is
  'Historial de resultados y reprogramaciones de citas. action_user_id/action_name = quien registro el cambio (actor), no la asesora asignada a la cita.';

commit;

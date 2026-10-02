-- Citas visibles para todo el equipo CRM (asesoras incluidas).
-- Las asesoras necesitan ver todos los agendados del rango; el calendario
-- compartido no es dato privado (los leads asociados ya son legibles por CRM).
-- La escritura sigue restringida por RPC: editar datos, asistencia, cancelacion
-- y reprogramacion solo para la asesora asignada o un admin.
begin;

drop policy if exists "lead_appointments_read_active_authorized" on public.lead_appointments;
create policy "lead_appointments_read_active_authorized"
on public.lead_appointments for select to authenticated
using (public.is_active_user() and public.is_crm_user());

commit;

-- Rollback manual: restaurar la politica anterior
-- (is_admin_user() or is_supervisor() or advisor_user_id = auth.uid()).

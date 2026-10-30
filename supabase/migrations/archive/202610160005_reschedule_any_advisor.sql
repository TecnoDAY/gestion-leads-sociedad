-- Cualquier asesora activa del CRM puede reprogramar una cita PROGRAMADA
-- de otra asesora. La asesora asignada se conserva; quien ejecuta el cambio
-- queda en created_by_user_id y en lead_appointment_events, con hora anterior
-- y nueva. Editar, asistencia, cancelacion y borrado siguen restringidos.

begin;

alter table public.lead_appointment_events
  add column if not exists scheduled_at_anterior timestamptz,
  add column if not exists scheduled_at_nuevo timestamptz;

create or replace function public.record_lead_appointment_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text; previous_at timestamptz;
begin
  select coalesce(nombre, '') into actor from public.user_access where user_id = auth.uid() limit 1;
  if tg_op = 'INSERT' and new.rescheduled_from_id is not null then
    select scheduled_at into previous_at from public.lead_appointments where id = new.rescheduled_from_id;
  elsif tg_op = 'UPDATE' then
    previous_at := old.scheduled_at;
  end if;
  if tg_op = 'INSERT' or old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at then
    insert into public.lead_appointment_events (
      appointment_id, status_anterior, status_nuevo, actor_user_id, actor_name, notes,
      scheduled_at_anterior, scheduled_at_nuevo
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      auth.uid(),
      coalesce(actor, ''),
      new.notes,
      previous_at,
      new.scheduled_at
    );
  end if;
  return new;
end;
$$;

create or replace function public.reschedule_lead_appointment(p_id bigint, p_scheduled_at timestamptz, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare old_appointment public.lead_appointments; created public.lead_appointments; new_notes text; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments where id = p_id;
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into old_appointment from public.lead_appointments
  where id = p_id and lead_id = target_lead_id and status = 'PROGRAMADA' for update;
  if old_appointment.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  perform 1 from public.user_access where user_id = old_appointment.advisor_user_id
    and activo = true and role in ('admin', 'agente', 'supervisor') for share;
  if not found then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  new_notes := case when coalesce(p_notes, '') = '' then old_appointment.notes else p_notes end;
  update public.lead_appointments set status = 'REPROGRAMADA', resolved_at = now(), updated_at = now() where id = p_id;
  insert into public.lead_appointments (
    lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id,
    created_by_user_id, is_data_dura, student_name, contact_email, student_age, campus
  )
  values (
    old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name,
    new_notes, p_id, auth.uid(), old_appointment.is_data_dura, old_appointment.student_name,
    old_appointment.contact_email, old_appointment.student_age, old_appointment.campus
  ) returning * into created;
  return created;
end;
$$;

drop policy if exists "lead_appointment_events_read_active_authorized" on public.lead_appointment_events;
create policy "lead_appointment_events_read_active_authorized"
on public.lead_appointment_events for select to authenticated
using (public.is_active_user() and public.is_crm_user());

revoke all on function public.reschedule_lead_appointment(bigint, timestamptz, text) from public, anon;
grant execute on function public.reschedule_lead_appointment(bigint, timestamptz, text) to authenticated;

comment on function public.reschedule_lead_appointment(bigint, timestamptz, text) is
  'Cualquier usuario CRM activo reprograma una cita PROGRAMADA. Conserva la asesora asignada y registra al actor en created_by_user_id y lead_appointment_events.';

commit;

-- Solo amplia los resultados de citas entre usuarios activos del CRM.
-- El trigger existente registra actor, fecha y estado en la misma transaccion.
begin;

create or replace function public.set_lead_appointment_status(p_id bigint, p_status text, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare updated public.lead_appointments; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_status is null or p_status not in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA') then raise exception using errcode = '22023', message = 'invalid_status'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments where id = p_id;
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and lead_id = target_lead_id for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  if updated.status = p_status then return updated; end if;
  if updated.status <> 'PROGRAMADA' then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments set status = p_status, resolved_at = now(), updated_at = now(), notes = case when coalesce(p_notes, '') = '' then notes else p_notes end
  where id = p_id returning * into updated;
  return updated;
end;
$$;

revoke all on function public.set_lead_appointment_status(bigint, text, text) from public, anon;
grant execute on function public.set_lead_appointment_status(bigint, text, text) to authenticated;

commit;

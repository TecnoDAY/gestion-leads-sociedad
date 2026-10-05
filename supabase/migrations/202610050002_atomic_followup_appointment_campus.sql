-- Guarda el seguimiento y la correccion de sede de una cita vigente como una
-- sola transaccion. Reutiliza las dos RPC canonicas para conservar permisos,
-- validaciones e historial, y valida que la cita pertenezca al lead.
begin;

create or replace function public.update_lead_followup_with_appointment_campus(
  p_id bigint,
  p_fields jsonb,
  p_appointment_id bigint,
  p_campus text
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_lead_id bigint;
  updated public.leads;
begin
  select lead_id into appointment_lead_id
  from public.lead_appointments
  where id = p_appointment_id;

  if appointment_lead_id is null or appointment_lead_id <> p_id then
    raise exception using errcode = 'P0002', message = 'appointment_not_found_or_wrong_lead';
  end if;

  -- Orden de locks: lead (update_lead_followup), despues cita
  -- (update_lead_appointment_campus), igual que las demas mutaciones.
  updated := public.update_lead_followup(p_id, p_fields);
  perform public.update_lead_appointment_campus(p_appointment_id, p_campus);
  return updated;
end;
$$;

revoke all on function public.update_lead_followup_with_appointment_campus(bigint, jsonb, bigint, text) from public, anon;
grant execute on function public.update_lead_followup_with_appointment_campus(bigint, jsonb, bigint, text) to authenticated;

commit;

-- Rollback manual:
-- drop function if exists public.update_lead_followup_with_appointment_campus(bigint, jsonb, bigint, text);

-- Borrado administrativo definitivo de una cita (correccion de errores o
-- duplicados). Solo el administrador activo puede ejecutarla; el resto
-- del equipo ve el boton oculto y la RPC lo rechaza en el servidor.
-- El borrado es irreversible: elimina tambien el historial de eventos de
-- esa cita (ON DELETE CASCADE) y desvincula citas que la referencien
-- como reprogramacion (ON DELETE SET NULL).
begin;

create or replace function public.delete_lead_appointment(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare target_lead_id bigint; removed public.lead_appointments;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_id is null or p_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_appointment_id';
  end if;
  -- Orden de locks canonico: lead primero, cita despues.
  select lead_id into target_lead_id
  from public.lead_appointments
  where id = p_id;
  if target_lead_id is null then
    raise exception using errcode = 'P0002', message = 'appointment_not_found';
  end if;
  perform 1 from public.leads where id = target_lead_id for update;
  delete from public.lead_appointments
  where id = p_id
  returning * into removed;
  if removed.id is null then
    raise exception using errcode = 'P0002', message = 'appointment_not_found';
  end if;
end;
$$;

revoke all on function public.delete_lead_appointment(bigint) from public, anon;
grant execute on function public.delete_lead_appointment(bigint) to authenticated;

comment on function public.delete_lead_appointment(bigint) is 'Borrado definitivo de una cita; solo administrador activo. Elimina su historial de eventos y desvincula reprogramaciones.';

commit;

-- Rollback manual (tras revision):
-- revoke all on function public.delete_lead_appointment(bigint) from authenticated;
-- drop function if exists public.delete_lead_appointment(bigint);

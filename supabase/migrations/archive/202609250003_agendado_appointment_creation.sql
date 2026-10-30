-- Revision manual requerida antes de aplicar en Supabase.
begin;

create or replace function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  created public.lead_appointments;
  access public.user_access;
  advisor public.user_access;
  lead_record public.leads;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into lead_record from public.leads where id = p_lead_id;
  if not found then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  if upper(btrim(coalesce(lead_record."GESTION", ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  if access.role = 'admin' and p_advisor_user_id is not null then
    select * into advisor from public.user_access where user_id = p_advisor_user_id and activo = true;
    if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  else advisor := access;
  end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid()) returning * into created;
  return created;
end;
$$;

-- Atomicamente crea el lead y su primera cita; solo admite GESTION AGENDAD*.
create or replace function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.leads language plpgsql security definer set search_path = public as $$
declare created public.leads;
begin
  if jsonb_typeof(p_lead) <> 'object' then raise exception using errcode = '22023', message = 'lead_object_required'; end if;
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  created := public.create_lead(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return created;
end;
$$;

revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid) from public;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid) from public;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid) to authenticated;

comment on function public.create_lead_appointment(bigint, timestamptz, text, uuid) is 'Creates appointments only for leads whose GESTION starts with AGENDAD.';
comment on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid) is 'Atomically creates an AGENDAD* lead and its first appointment.';

commit;

-- Rollback manual: restore 002 create_lead_appointment and revoke/drop the wrapper after review.

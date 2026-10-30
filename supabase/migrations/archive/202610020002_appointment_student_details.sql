-- Datos del estudiante por cita (opcionales y editables despues).
-- Decision (odd/tasks/appointment-student-details.md): columnas tipadas en cada
-- cita, RPC central de creacion con p_details, y RPC dedicada para corregirlos.
-- Cada funcion se reemplaza (drop + create) anadiendo p_details con default; las
-- llamadas por nombre existentes sin p_details siguen resolviendo. Reschedule
-- queda fijado: conserva is_data_dura y los datos del estudiante.
begin;

alter table if exists public.lead_appointments
  add column if not exists student_name text,
  add column if not exists contact_email text,
  add column if not exists student_age smallint;
comment on column public.lead_appointments.student_name is 'Nombre del estudiante citado; puede diferir del lead (representante).';
comment on column public.lead_appointments.contact_email is 'Correo de contacto para la cita (padre/madre o estudiante).';
comment on column public.lead_appointments.student_age is 'Edad del estudiante en años (0-120); opcional.';

-- Normaliza y valida el bloque de detalles; vacios -> null.
create or replace function public._appointment_details(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p->>'student_name', '')), 200);
  v_email text := lower(left(btrim(coalesce(p->>'contact_email', '')), 254));
  v_age_raw text := btrim(coalesce(p->>'student_age', ''));
  v_age integer;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'appointment_details_object_required';
  end if;
  if p - array['student_name', 'contact_email', 'student_age'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'appointment_details_fields_only';
  end if;
  if v_email <> '' and v_email !~ ('^[^@' || chr(92) || 's]+@[^@' || chr(92) || 's]+' || chr(92) || '.[^@' || chr(92) || 's]+$') then
    raise exception using errcode = '22023', message = 'appointment_email_invalid';
  end if;
  if v_age_raw <> '' then
    if v_age_raw !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'appointment_age_invalid';
    end if;
    v_age := v_age_raw::int;
    if v_age < 0 or v_age > 120 then
      raise exception using errcode = '22023', message = 'appointment_age_invalid';
    end if;
  end if;
  return jsonb_build_object(
    'student_name', nullif(v_name, ''),
    'contact_email', nullif(v_email, ''),
    'student_age', v_age);
end;
$$;

-- RPC central de creacion; p_details viaja desde los tres formularios.
drop function if exists public.create_lead_appointment(bigint, timestamptz, text, uuid);
create function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  created public.lead_appointments;
  access public.user_access;
  advisor public.user_access;
  lead_record public.leads;
  d jsonb := public._appointment_details(p_details);
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into lead_record from public.leads where id = p_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  if upper(btrim(coalesce(lead_record."GESTION", ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  select * into advisor from public.user_access
  where user_id = case when access.role = 'admin' and p_advisor_user_id is not null then p_advisor_user_id else access.user_id end
    and activo = true and role in ('admin', 'agente', 'supervisor')
  for share;
  if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id, is_data_dura, student_name, contact_email, student_age)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid(),
    upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATA DURA%'
    or upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATADURA%',
    d->>'student_name', d->>'contact_email', (d->>'student_age')::smallint) returning * into created;
  return created;
end;
$$;

-- Alta atomica lead + primera cita, ahora con detalles del estudiante.
drop function if exists public.create_lead_with_appointment(jsonb, timestamptz, text, uuid);
create function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.leads language plpgsql security definer set search_path = public as $$
declare created public.leads;
begin
  created := public.create_lead(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details);
  return created;
end;
$$;

-- Correccion posterior: solo asesor asignado o admin; no toca fecha/estado.
create or replace function public.update_lead_appointment_details(p_id bigint, p_details jsonb)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  updated public.lead_appointments;
  d jsonb := public._appointment_details(p_details);
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid())
  for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments
  set student_name = d->>'student_name',
      contact_email = d->>'contact_email',
      student_age = (d->>'student_age')::smallint,
      updated_at = now()
  where id = p_id
  returning * into updated;
  return updated;
end;
$$;

-- Edicion del lead que crea la cita en la misma operacion; p_details viaja a la cita.
-- El cuerpo replica el de 202610020001 (ultima version vigente) cambiando solo la
-- llamada final a create_lead_appointment con el sexto argumento.
drop function if exists public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid);
create function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_scheduled_at is null then
    raise exception using errcode = '22023', message = 'scheduled_at_required';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'notes_too_long';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono','')) is distinct from btrim(coalesce(current_lead."Telefono",''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono',''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then raise exception using errcode = '22023', message = 'telefono_invalido'; end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', '')));
  if previous_gestion like 'AGENDAD%' or next_gestion not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'agendado_transition_required';
  end if;

  if access.role = 'admin' then
    if p_fields - array[
      'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
      'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '
    ] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'full_edit_fields_only';
    end if;
    update public.leads
    set "Mes" = left(coalesce(p_fields->>'Mes', "Mes"), 40),
        "Fecha" = left(coalesce(p_fields->>'Fecha', "Fecha"), 40),
        "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
        "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
        "Campaña" = left(coalesce(p_fields->>'Campaña', "Campaña"), 120),
        "Medio" = left(coalesce(p_fields->>'Medio', "Medio"), 80),
        "Ciudad" = left(coalesce(p_fields->>'Ciudad', "Ciudad"), 120),
        "AGENTE" = left(coalesce(p_fields->>'AGENTE', p_fields->>'Agente', p_fields->>'Agente ', "AGENTE"), 120),
        "Odoo" = left(coalesce(p_fields->>'Odoo', "Odoo"), 80),
        "Fecha de Atencion" = left(coalesce(p_fields->>'Fecha de Atencion', "Fecha de Atencion"), 40),
        "LANDING" = left(coalesce(p_fields->>'LANDING', "LANDING"), 500),
        "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre','')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
    if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'followup_fields_only';
    end if;
    update public.leads
    set "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
        "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
       "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "ULTIMO AGENTE " = left(access.nombre, 120),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre,'')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details);
  return updated;
end;
$$;

-- Reschedule: conserva Data Dura y los datos del estudiante (antes se perdian).
create or replace function public.reschedule_lead_appointment(p_id bigint, p_scheduled_at timestamptz, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare old_appointment public.lead_appointments; created public.lead_appointments; new_notes text; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid());
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into old_appointment from public.lead_appointments
  where id = p_id and lead_id = target_lead_id and (public.is_admin_user() or advisor_user_id = auth.uid()) and status = 'PROGRAMADA' for update;
  if old_appointment.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  perform 1 from public.user_access where user_id = old_appointment.advisor_user_id
    and activo = true and role in ('admin', 'agente', 'supervisor') for share;
  if not found then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  new_notes := case when coalesce(p_notes, '') = '' then old_appointment.notes else p_notes end;
  update public.lead_appointments set status = 'REPROGRAMADA', resolved_at = now(), updated_at = now() where id = p_id;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id, created_by_user_id, is_data_dura, student_name, contact_email, student_age)
  values (old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name, new_notes, p_id, auth.uid(), old_appointment.is_data_dura, old_appointment.student_name, old_appointment.contact_email, old_appointment.student_age) returning * into created;
  return created;
end;
$$;

revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.update_lead_appointment_details(bigint, jsonb) from public, anon;
grant execute on function public.update_lead_appointment_details(bigint, jsonb) to authenticated;
revoke all on function public.reschedule_lead_appointment(bigint, timestamptz, text) from public, anon;
grant execute on function public.reschedule_lead_appointment(bigint, timestamptz, text) to authenticated;
revoke all on function public._appointment_details(jsonb) from public, anon, authenticated;

commit;

-- Rollback manual: restaurar create_lead_appointment de 202610010001,
-- create_lead_with_appointment de 202609300005, update_lead_with_appointment de
-- 202610020001 y reschedule de 202609300005; eliminar update_lead_appointment_details,
-- _appointment_details y las tres columnas si no hay datos que conservar.

-- Revision manual requerida antes de aplicar en Supabase.
-- Regla: pasar de una gestion NO agendada a una gestion AGENDAD* exige crear la
-- cita en la misma transaccion. Las RPC antiguas se endurecen para que no se
-- pueda saltarse esa regla, y el trigger de lead_gestiones sigue registrando
-- el cambio de gestion (por ejemplo Informacion -> Agendado).
begin;

create or replace function public.update_lead_followup(p_id bigint, p_fields jsonb)
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
  if p_fields - array['GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "GESTION" = left(coalesce(p_fields->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "ULTIMO AGENTE " = left(access.nombre, 120),
      "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return updated;
end;
$$;

create or replace function public.update_lead_full(p_id bigint, p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'lead_object_required';
  end if;
  if p_lead ?| array['id', 'archived_at', 'archived_by', 'created_at', 'updated_at'] then
    raise exception using errcode = '22023', message = 'protected_fields';
  end if;
  if p_lead - array[
    'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
    'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
    'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'full_edit_fields_only';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_lead->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "Mes" = left(coalesce(p_lead->>'Mes', "Mes"), 40),
      "Fecha" = left(coalesce(p_lead->>'Fecha', "Fecha"), 40),
      "Nombre" = left(coalesce(p_lead->>'Nombre', "Nombre"), 200),
      "Telefono" = left(coalesce(p_lead->>'Telefono', "Telefono"), 80),
      "Campaña" = left(coalesce(p_lead->>'Campaña', "Campaña"), 120),
      "Medio" = left(coalesce(p_lead->>'Medio', "Medio"), 80),
      "Ciudad" = left(coalesce(p_lead->>'Ciudad', "Ciudad"), 120),
      "AGENTE" = left(coalesce(p_lead->>'AGENTE', p_lead->>'Agente', p_lead->>'Agente ', "AGENTE"), 120),
      "Odoo" = left(coalesce(p_lead->>'Odoo', "Odoo"), 80),
      "Fecha de Atencion" = left(coalesce(p_lead->>'Fecha de Atencion', "Fecha de Atencion"), 40),
      "LANDING" = left(coalesce(p_lead->>'LANDING', "LANDING"), 500),
      "GESTION" = left(coalesce(p_lead->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_lead->>'Fecha Última Gestión', p_lead->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_lead->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "OBSERVACIONES " = left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return updated;
end;
$$;

-- Cambiar la gestion de un lead existente a AGENDAD* y crear su cita, en una
-- sola transaccion. El trigger de lead_gestiones registra el cambio de gestion
-- y un fallo al crear la cita revierte la actualizacion del lead.
create or replace function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
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

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

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
    if p_fields - array['GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'followup_fields_only';
    end if;
    update public.leads
    set "GESTION" = left(p_fields->>'GESTION', 80),
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

  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return updated;
end;
$$;

revoke all on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) from public;
grant execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) to authenticated;

comment on function public.update_lead_followup(bigint, jsonb) is 'Agentes actualizan solo campos de seguimiento; pasar a AGENDAD* exige crear cita.';
comment on function public.update_lead_full(bigint, jsonb) is 'Edicion completa de admin; pasar a AGENDAD* exige crear cita.';
comment on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) is 'Actualiza un lead a AGENDAD* y crea su cita en una sola transaccion; el cambio queda en lead_gestiones.';

commit;

-- Rollback manual: restaurar las funciones de 0003 (sin el guard de transicion),
-- revocar/drop update_lead_with_appointment y eliminar la regla de cita
-- obligatoria. No ejecutar automaticamente contra el remoto.

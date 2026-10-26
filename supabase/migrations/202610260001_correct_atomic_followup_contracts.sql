-- Correctiva local: no modificar las migraciones ya aplicadas 20261024/25.
-- Base: firmas canonicas de 202610210002 y ACL de hardening 20261018/20.
-- La firma de 5 argumentos fue ELIMINADA en 202610020002, no era una RPC
-- publica vigente. 202610250001 la recreo y le concedio EXECUTE por error.
-- Triggers comprobados en pg_trigger: gestion/meta se disparan por UPDATE OF
-- GESTION, ULTIMA GESTION, OBSERVACIONES (aunque el valor no cambie).
-- El UPDATE separado del par NO menciona esas columnas: no crea otra gestion.
-- LIMITE: leadUpdateFields envia tambien campos comerciales aunque solo cambie
-- el par, y el modal pone fecha de hoy. Ese payload SI registra una gestion con
-- los triggers vigentes. No inferir aqui intencion por igualdad de valores:
-- separar campos modificados y decidir registrar gestion vs programar requiere
-- decision UX/contrato y prueba integral; esta correctiva no cierra ese punto.
-- No cambia triggers, tablas, firmas publicas ni contratos de concurrencia.
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
  next_action text;
  followup_date_text text;
  followup_date date;
  set_parts text[] := array[]::text[];
  has_commercial boolean := false;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if (p_fields ? 'proxima_accion') is distinct from (p_fields ? 'fecha_seguimiento') then
    raise exception using errcode = '22023', message = 'followup_pair_required';
  end if;
  if p_fields ? 'proxima_accion' then
    if jsonb_typeof(p_fields->'proxima_accion') not in ('string', 'null')
       or jsonb_typeof(p_fields->'fecha_seguimiento') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'followup_string_required';
    end if;
    next_action := nullif(btrim(p_fields->>'proxima_accion', E' \t\r\n'), '');
    followup_date_text := nullif(btrim(p_fields->>'fecha_seguimiento', E' \t\r\n'), '');
    if (next_action is null) is distinct from (followup_date_text is null) then
      raise exception using errcode = '22023', message = 'followup_pair_required';
    end if;
    if length(next_action) > 200 then
      raise exception using errcode = '22023', message = 'proxima_accion_too_long';
    end if;
    if followup_date_text is not null then
      if followup_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end if;
      begin
        followup_date := followup_date_text::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end;
      if to_char(followup_date, 'YYYY-MM-DD') <> followup_date_text then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end if;
    end if;
    p_fields := p_fields || jsonb_build_object('proxima_accion', next_action, 'fecha_seguimiento', followup_date);
  end if;

  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  -- Solo fragmentos constantes; todos los valores JSON viajan en USING.
  -- A diferencia de quote_literal(NULL), los parametros admiten JSON null.
  if p_fields ? 'Nombre' then
    set_parts := array_append(set_parts, '"Nombre" = left(coalesce($1->>''Nombre'', "Nombre"), 200)');
    has_commercial := true;
  end if;
  if p_fields ? 'Telefono' then
    set_parts := array_append(set_parts, '"Telefono" = left(coalesce($1->>''Telefono'', "Telefono"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'GESTION' then
    set_parts := array_append(set_parts, '"GESTION" = left(coalesce($1->>''GESTION'', "GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'Fecha Última Gestión' or p_fields ? 'Fecha Última Gestión ' then
    set_parts := array_append(set_parts, '"Fecha Última Gestión " = left(coalesce($1->>''Fecha Última Gestión'', $1->>''Fecha Última Gestión '', "Fecha Última Gestión "), 40)');
    has_commercial := true;
  end if;
  if p_fields ? 'ULTIMA GESTION' then
    set_parts := array_append(set_parts, '"ULTIMA GESTION" = left(coalesce($1->>''ULTIMA GESTION'', "ULTIMA GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'OBSERVACIONES' or p_fields ? 'OBSERVACIONES ' then
    set_parts := array_append(set_parts, '"OBSERVACIONES " = left(coalesce($1->>''OBSERVACIONES'', $1->>''OBSERVACIONES '', "OBSERVACIONES "), 5000)');
    has_commercial := true;
  end if;
  if p_fields ? 'INTERESADO EN' then
    set_parts := array_append(set_parts, '"INTERESADO EN" = nullif(left(coalesce($1->>''INTERESADO EN'', "INTERESADO EN"), 120), '''')');
    has_commercial := true;
  end if;
  if p_fields ? 'proxima_accion' then
    set_parts := array_append(set_parts, 'proxima_accion = $1->>''proxima_accion'', fecha_seguimiento = ($1->>''fecha_seguimiento'')::date');
  end if;
  if has_commercial then
    set_parts := array_append(set_parts, '"ULTIMO AGENTE " = left($3, 120)');
  end if;
  if array_length(set_parts, 1) is null then
    updated := current_lead;
  else
    set_parts := array_append(set_parts, 'updated_at = now()');
    execute 'update public.leads set ' || array_to_string(set_parts, ', ') || ' where id = $2 and archived_at is null returning *'
      into updated using p_fields, p_id, access.nombre;
  end if;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
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
  followup_fields jsonb;
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
    'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'full_edit_fields_only';
  end if;
  -- No tocar columnas comerciales (ni sus triggers) al guardar solo el par.
  if p_lead - array['proxima_accion', 'fecha_seguimiento'] = '{}'::jsonb then
    return public.update_lead_followup(p_id, p_lead);
  end if;
  if p_lead ? 'Nombre' and btrim(coalesce(p_lead->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_lead ? 'Telefono'
     and btrim(coalesce(p_lead->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_lead->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
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
      "INTERESADO EN" = nullif(left(coalesce(p_lead->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_lead ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
  end if;
  -- Si falla validacion del par, tambien se revierte el UPDATE comercial.
  if p_lead ?| array['proxima_accion', 'fecha_seguimiento'] then
    select jsonb_object_agg(key, value) into followup_fields
    from jsonb_each(p_lead) where key in ('proxima_accion', 'fecha_seguimiento');
    updated := public.update_lead_followup(p_id, followup_fields);
  end if;
  return updated;
end;
$$;

create or replace function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text, p_advisor_user_id uuid, p_details jsonb, p_campus text)
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
  followup_fields jsonb;
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
  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
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
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'
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
        "INTERESADO EN" = nullif(left(coalesce(p_fields->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'] <> '{}'::jsonb then
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
        "INTERESADO EN" = nullif(left(coalesce(p_fields->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
  end if;
  -- Validacion y persistencia reutilizadas; cualquier error revierte lead/contacto.
  if p_fields ?| array['proxima_accion', 'fecha_seguimiento'] then
    select jsonb_object_agg(key, value) into followup_fields
    from jsonb_each(p_fields) where key in ('proxima_accion', 'fecha_seguimiento');
    updated := public.update_lead_followup(p_id, followup_fields);
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return updated;
end;
$$;

-- El frontend prioriza sede existente tambien para admin y envia campos full.
-- Conservar firma/ACL del wrapper y delegar cada whitelist al RPC apropiado.
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

  -- Orden de locks: lead primero; cita despues. Cada RPC conserva sus guards.
  if public.is_admin_user() then
    updated := public.update_lead_full(p_id, p_fields);
  else
    updated := public.update_lead_followup(p_id, p_fields);
  end if;
  perform public.update_lead_appointment_campus(p_appointment_id, p_campus);
  return updated;
end;
$$;

-- No borrar overloads ni romper dependencias internas; cerrar solo el acceso API.
revoke execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb, text) from public, anon;
revoke execute on function public.update_lead_full(bigint, jsonb) from public, anon;
revoke execute on function public.update_lead_followup(bigint, jsonb) from public, anon;
grant execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb, text) to authenticated;
grant execute on function public.update_lead_full(bigint, jsonb) to authenticated;
grant execute on function public.update_lead_followup(bigint, jsonb) to authenticated;

commit;

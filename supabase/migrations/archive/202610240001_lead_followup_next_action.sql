-- Seguimiento confirmado (proxima accion + fecha) integrado en el guardado.
-- Reescribe update_lead_followup para que:
--   * solo actualice las columnas presentes en p_fields (SQL dinamico);
--   * no dispare el trigger de gestion cuando solo cambian proxima_accion/fecha_seguimiento;
--   * valide que accion y fecha vayan juntas o vacias.
-- Migracion preparada localmente; se aplica con autorizacion humana.

begin;

alter table public.leads
  add column if not exists proxima_accion text,
  add column if not exists fecha_seguimiento date;

comment on column public.leads.proxima_accion is 'Accion confirmada para el siguiente contacto (llamar, enviar info, etc.).';
comment on column public.leads.fecha_seguimiento is 'Fecha comprometida para la proxima accion. Null si no hay seguimiento confirmado.';

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
  set_parts text[] := array[]::text[];
  has_commercial boolean := false;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_fields - array['Nombre','Telefono','GESTION','Fecha Última Gestión','Fecha Última Gestión ','ULTIMA GESTION','OBSERVACIONES','OBSERVACIONES ','INTERESADO EN','proxima_accion','fecha_seguimiento'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  -- accion y fecha deben ir juntas o vacias
  if (p_fields ? 'proxima_accion') is distinct from (p_fields ? 'fecha_seguimiento') then
    raise exception using errcode = '22023', message = 'followup_pair_required';
  end if;
  if p_fields ? 'proxima_accion' then
    if nullif(btrim(coalesce(p_fields->>'proxima_accion','')), '') is not null
       and nullif(btrim(coalesce(p_fields->>'fecha_seguimiento','')), '') is null then
      raise exception using errcode = '22023', message = 'followup_pair_required';
    end if;
    if nullif(btrim(coalesce(p_fields->>'fecha_seguimiento','')), '') is not null
       and nullif(btrim(coalesce(p_fields->>'proxima_accion','')), '') is null then
      raise exception using errcode = '22023', message = 'followup_pair_required';
    end if;
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre','')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono','')) is distinct from btrim(coalesce(current_lead."Telefono",''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono',''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  -- construir SET solo con las columnas presentes (evita disparar el trigger
  -- de gestion cuando solo cambian proxima_accion/fecha_seguimiento)
  if p_fields ? 'Nombre' then
    set_parts := array_append(set_parts, '"Nombre" = left(coalesce(' || quote_literal(p_fields->>'Nombre') || ', "Nombre"), 200)');
    has_commercial := true;
  end if;
  if p_fields ? 'Telefono' then
    set_parts := array_append(set_parts, '"Telefono" = left(coalesce(' || quote_literal(p_fields->>'Telefono') || ', "Telefono"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'GESTION' then
    set_parts := array_append(set_parts, '"GESTION" = left(coalesce(' || quote_literal(p_fields->>'GESTION') || ', "GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'Fecha Última Gestión' or p_fields ? 'Fecha Última Gestión ' then
    set_parts := array_append(set_parts, '"Fecha Última Gestión " = left(coalesce(' || quote_literal(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ')) || ', ' || quote_literal(coalesce(p_fields->>'Fecha Última Gestión ', p_fields->>'Fecha Última Gestión')) || ', "Fecha Última Gestión "), 40)');
    has_commercial := true;
  end if;
  if p_fields ? 'ULTIMA GESTION' then
    set_parts := array_append(set_parts, '"ULTIMA GESTION" = left(coalesce(' || quote_literal(p_fields->>'ULTIMA GESTION') || ', "ULTIMA GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'OBSERVACIONES' or p_fields ? 'OBSERVACIONES ' then
    set_parts := array_append(set_parts, '"OBSERVACIONES " = left(coalesce(' || quote_literal(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ')) || ', ' || quote_literal(coalesce(p_fields->>'OBSERVACIONES ', p_fields->>'OBSERVACIONES')) || ', "OBSERVACIONES "), 5000)');
    has_commercial := true;
  end if;
  if p_fields ? 'INTERESADO EN' then
    set_parts := array_append(set_parts, '"INTERESADO EN" = nullif(left(coalesce(' || quote_literal(p_fields->>'INTERESADO EN') || ', "INTERESADO EN"), 120), '''')');
    has_commercial := true;
  end if;
  if p_fields ? 'proxima_accion' then
    set_parts := array_append(set_parts, 'proxima_accion = nullif(left(coalesce(' || quote_literal(p_fields->>'proxima_accion') || ', ''''), 200), '''')');
  end if;
  if p_fields ? 'fecha_seguimiento' then
    set_parts := array_append(set_parts, 'fecha_seguimiento = nullif(' || quote_literal(p_fields->>'fecha_seguimiento') || ', '''')::date');
  end if;
  if has_commercial then
    set_parts := array_append(set_parts, '"ULTIMO AGENTE " = ' || quote_literal(left(coalesce(access.nombre, ''), 120)));
  end if;

  if array_length(set_parts, 1) is null then
    updated := current_lead;
  else
    set_parts := array_append(set_parts, 'updated_at = now()');
    execute 'update public.leads set ' || array_to_string(set_parts, ', ') || ' where id = $1 and archived_at is null returning *'
      using p_id into updated;
  end if;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre,'')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  return updated;
end;
$$;

revoke all on function public.update_lead_followup(bigint, jsonb) from public;
grant execute on function public.update_lead_followup(bigint, jsonb) to authenticated;

commit;
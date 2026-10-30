-- "INTERESADO EN": programa del catalogo (campaña) en el que el lead esta
-- interesado. Es SOLO INFORMATIVO: no cambia la campaña de origen ("Campaña"),
-- ni el estado de gestion, ni el programa de inscripcion.
--
-- Viaja en la MISMA operacion que el lead (create_lead* / update_lead*), asi
-- que no puede quedar guardado a medias. Si el valor no viaja (no cambio), la
-- columna conserva lo que tenia; una cadena vacia lo quita.
--
-- Los cuerpos de abajo son los VIGENTES (ver README.md) con el campo anadido:
-- solo cambian las listas de campos permitidos y el SET del UPDATE.
--
-- La columna es nullable y sin valor por defecto: añadirla no reescribe la
-- tabla ni bloquea a nadie.

alter table public.leads add column if not exists "INTERESADO EN" text;

comment on column public.leads."INTERESADO EN" is
  'Programa del catálogo (campaña) en el que el lead está interesado. Solo informativo: no sustituye a la campaña de origen ("Campaña") ni al programa de inscripción.';

create or replace function public.create_lead_record(p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.leads;
  access public.user_access;
begin
  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'lead_object_required';
  end if;
  if p_lead ?| array['id', 'archived_at', 'archived_by', 'created_at', 'updated_at'] then
    raise exception using errcode = '22023', message = 'protected_fields';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  insert into public.leads (
    "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION",
    "Ciudad", "AGENTE", "OBSERVACIONES ", "INTERESADO EN"
  ) values (
    left(coalesce(p_lead->>'Mes', ''), 40),
    left(coalesce(p_lead->>'Fecha', ''), 40),
    left(coalesce(p_lead->>'Nombre', ''), 200),
    left(coalesce(p_lead->>'Telefono', ''), 80),
    left(coalesce(p_lead->>'Campaña', ''), 120),
    left(coalesce(p_lead->>'Medio', ''), 80),
    left(coalesce(p_lead->>'GESTION', 'Información '), 80),
    left(coalesce(p_lead->>'Ciudad', ''), 120),
    case when access.role = 'admin' then left(coalesce(p_lead->>'AGENTE', p_lead->>'Agente', p_lead->>'Agente ', access.nombre), 120) else left(access.nombre, 120) end,
    left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', ''), 5000),
    nullif(left(coalesce(p_lead->>'INTERESADO EN', ''), 120), '')
  ) returning * into created;

  return created;
end;
$$;

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
  if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre','')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono','')) is distinct from btrim(coalesce(current_lead."Telefono",''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono',''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then raise exception using errcode = '22023', message = 'telefono_invalido'; end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
      "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
       "GESTION" = left(coalesce(p_fields->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "ULTIMO AGENTE " = left(access.nombre, 120),
      "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      "INTERESADO EN" = nullif(left(coalesce(p_fields->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

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
    'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN'
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
      "INTERESADO EN" = nullif(left(coalesce(p_lead->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_lead ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre,'')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
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
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
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
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN'
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
    if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
    if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN'] <> '{}'::jsonb then
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
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return updated;
end;
$$;
commit;

-- Rollback manual (solo tras revision):
-- alter table public.leads drop column if exists "INTERESADO EN";

-- Fix RPCs for the exact deployed leads column names.
begin;

create or replace function public.create_lead(p_lead jsonb)
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

  insert into public.leads (
    "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION",
    "Ciudad", "AGENTE", "OBSERVACIONES "
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
    left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', ''), 5000)
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

comment on function public.create_lead(jsonb) is 'Creates a lead using the deployed normalized lead columns.';
comment on function public.update_lead_followup(bigint, jsonb) is 'Agents update only normalized follow-up columns.';
comment on function public.update_lead_full(bigint, jsonb) is 'Admin full edit using the deployed normalized lead columns.';

commit;

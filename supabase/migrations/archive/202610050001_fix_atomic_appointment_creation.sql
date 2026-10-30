-- HOTFIX: create_lead_with_appointment llamaba a create_lead (rechaza AGENDAD*)
-- y TODA la creacion directa de un lead Agendado fallaba con HTTP 400
-- 'appointment_required_for_agendado_transition' (evidencia logs 2026-10-05).
-- Decision: una sola funcion interna _create_lead_with_gestion contiene la
-- logica comun (campania, fecha de llegada, Mes derivado, gestion inicial);
-- create_lead anade la prohibicion de AGENDAD* sin cita y la ruta atomica la
-- evita llamando a la interna. Asi nunca se pierden fecha/Mes/reporte.
begin;

create or replace function public._create_lead_with_gestion(p_lead jsonb)
returns public.leads language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  created public.leads;
  fecha_raw text := btrim(coalesce(p_lead->>'Fecha', ''));
  llegada date;
  hoy date := (now() at time zone 'America/New_York')::date;
  meses text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  autor text := '';
  v_canal text;
  v_dd boolean;
begin
  if not public.is_crm_user() then raise exception using errcode='42501', message='crm_access_forbidden'; end if;
  if not exists(select 1 from public.lead_catalogs c where c.kind='campana' and c.active and lower(btrim(c.value))=lower(btrim(coalesce(p_lead->>'Campaña', '')))) then raise exception using errcode='22023', message='campaign_not_in_catalog'; end if;

  -- Fecha de llegada: opcional; si viene, debe ser DD/MM/YYYY valida y no futura.
  if fecha_raw = '' then
    llegada := hoy;
  else
    if fecha_raw !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then raise exception using errcode='22023', message='fecha_llegada_invalida'; end if;
    begin
      llegada := to_date(fecha_raw, 'DD/MM/YYYY');
    exception when others then
      raise exception using errcode='22023', message='fecha_llegada_invalida';
    end;
    if llegada > hoy or llegada < date '2000-01-01' then raise exception using errcode='22023', message='fecha_llegada_invalida'; end if;
  end if;

  -- Mes se deriva de la fecha elegida: no se confia en el valor del navegador.
  v := jsonb_set(jsonb_set(p_lead, '{Fecha}', to_jsonb(to_char(llegada, 'DD/MM/YYYY'))), '{Mes}', to_jsonb(meses[extract(month from llegada)::int]));
  created := public.create_lead_record(v);

  -- La creacion es trabajo real del dia en Miami: una sola gestion inicial
  -- (gestion_anterior NULL), con el mismo mapeo de canal Data Dura del trigger.
  select coalesce(ua.nombre, '') into autor from public.user_access ua where ua.user_id = auth.uid();
  v_canal := created."ULTIMA GESTION";
  v_dd := null;
  if lower(btrim(coalesce(v_canal, ''))) = 'llamada data dura' then
    v_canal := 'Llamada'; v_dd := true;
  elsif lower(btrim(coalesce(v_canal, ''))) = 'llamada' then
    v_dd := false;
  end if;
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura)
  values (created.id, hoy, null, created."GESTION", v_canal, coalesce(autor, ''), auth.uid(), v_dd);
  return created;
end;
$$;

-- Ruta publica normal: sigue prohibiendo crear directamente un lead Agendado.
create or replace function public.create_lead(p_lead jsonb)
returns public.leads language plpgsql security definer set search_path = public as $$
begin
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;
  return public._create_lead_with_gestion(p_lead);
end;
$$;

-- Ruta atomica lead+cita: usa la interna (corrige el ciclo AGENDAD* -> create_lead).
drop function if exists public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb);
create function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.leads language sql security definer set search_path = public as $$
  select public.create_lead_with_appointment(p_lead, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;
create or replace function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text, p_advisor_user_id uuid, p_details jsonb, p_campus text)
returns public.leads language plpgsql security definer set search_path = public as $$
declare created public.leads;
begin
  if not public.is_crm_user() then raise exception using errcode='42501', message='crm_access_forbidden'; end if;
  if jsonb_typeof(p_lead) is distinct from 'object' then raise exception using errcode='22023', message='lead_object_required'; end if;
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) not like 'AGENDAD%' then raise exception using errcode='22023', message='lead_not_agendado'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023', message='scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode='22023', message='notes_too_long'; end if;
  created := public._create_lead_with_gestion(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return created;
end;
$$;

revoke all on function public._create_lead_with_gestion(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_lead(jsonb) from public, anon;
grant execute on function public.create_lead(jsonb) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb, text) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb, text) to authenticated;

commit;

-- Rollback manual: restaurar create_lead de 202610020004 y
-- create_lead_with_appointment de 202610020007, y eliminar
-- _create_lead_with_gestion.

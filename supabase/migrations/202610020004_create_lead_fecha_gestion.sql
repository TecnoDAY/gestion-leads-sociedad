-- Fecha de llegada editable al crear lead + la creacion cuenta como gestion del dia.
-- Problema: los leads recibidos de noche/madrugada se ingresan al dia siguiente y
-- create_lead fijaba Fecha a hoy, perdiendo la llegada real; ademas la creacion
-- no generaba lead_gestiones (el trigger cubre solo UPDATE), asi que el trabajo
-- de crear no aparecia en el reporte diario.
-- Decision (odd/tasks/fecha-llegada-gestion-creacion.md): create_lead es el unico
-- punto de creacion para usuarios; valida una Fecha opcional (hoy Miami por
-- defecto, solo fechas pasadas/actual), deriva Mes de esa fecha y registra UNA
-- gestion inicial. create_lead_record (imports) queda sin registro y
-- create_lead_with_appointment reutiliza create_lead: no duplica.
begin;

create or replace function public.create_lead(p_lead jsonb)
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
  if upper(btrim(coalesce(p_lead->>'GESTION',''))) like 'AGENDAD%' then raise exception using errcode='22023', message='appointment_required_for_agendado_transition'; end if;
  if not exists(select 1 from public.lead_catalogs c where c.kind='campana' and c.active and lower(btrim(c.value))=lower(btrim(coalesce(p_lead->>'Campaña','')))) then raise exception using errcode='22023', message='campaign_not_in_catalog'; end if;

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
  if lower(btrim(coalesce(v_canal,''))) = 'llamada data dura' then
    v_canal := 'Llamada'; v_dd := true;
  elsif lower(btrim(coalesce(v_canal,''))) = 'llamada' then
    v_dd := false;
  end if;
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura)
  values (created.id, hoy, null, created."GESTION", v_canal, coalesce(autor, ''), auth.uid(), v_dd);
  return created;
end;
$$;

revoke all on function public.create_lead(jsonb) from public, anon;
grant execute on function public.create_lead(jsonb) to authenticated;

commit;

-- Rollback manual: restaurar create_lead de 202610010002 (fijaba Fecha=hoy y
-- no registraba gestion inicial).

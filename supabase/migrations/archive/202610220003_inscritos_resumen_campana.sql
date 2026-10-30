-- Extension del reporte de inscritos por periodo y correcciones de actividad.
-- Solo lectura: no altera el historial ni las fechas manuales de programas.
--
-- 1) crm_inscripciones_resumen agrega por_campana (campaña ACTUAL del lead,
--    'Sin campaña' cuando esta vacia): desglose de personas inscritas del
--    periodo por campaña, con la misma poblacion del conteo (una persona por
--    rango, ultima entrada registrada dentro del rango).
-- 2) crm_inscripciones_detalle agrega la columna campana para que el CSV
--    permita verificar la matriz por campaña.
-- 3) management_period_summary (solo el bloque de actividad del reporte por
--    periodo; el reporte diario no se toca):
--    - distingue inscripciones realizadas (altas reales) de gestiones hechas
--      estando inscrito, y clasifica Inscrito/Data Dura por el estado del
--      evento, no por el mes de ingreso del lead;
--    - la clasificacion Data Dura de las llamadas se estabiliza: usa la fecha
--      de la propia gestion como referencia, no el inicio del rango;
--    - 'sin_sede' pasa a contar solo citas PROGRAMADA sin sede: antes sumaba
--      otros estados y no cuadraba con el total de programadas.

begin;

create or replace function public.crm_inscripciones_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  -- La funcion compartida valida tanto acceso como rango.
  with personas as (
    select h.id, h.estado_inscripcion,
           coalesce(nullif(btrim(l."Campaña"), ''), 'Sin campaña') as campana
    from public.crm_inscripciones_historial(p_desde, p_hasta, false) h
    join public.leads l on l.id = h.id
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'personas_inscritas', count(*),
    'normales', count(*) filter (where upper(estado_inscripcion) not like '%DATA%'),
    'data_dura', count(*) filter (where upper(estado_inscripcion) like '%DATA%'),
    'por_campana', (
      select coalesce(jsonb_agg(jsonb_build_object('campana', x.campana, 'personas', x.personas,
        'normales', x.normales, 'data_dura', x.data_dura) order by x.personas desc, x.campana), '[]'::jsonb)
      from (select campana, count(*) as personas,
                   count(*) filter (where upper(estado_inscripcion) not like '%DATA%') as normales,
                   count(*) filter (where upper(estado_inscripcion) like '%DATA%') as data_dura
            from personas group by campana) x
    ),
    'pendientes_fecha', (
      select count(*) from public.crm_inscripciones_historial(null, null, true) a
      where a.fecha_inscripcion is null
    )
  ) into result from personas;
  return result;
end;
$$;
revoke all on function public.crm_inscripciones_resumen(date, date) from public, anon;
grant execute on function public.crm_inscripciones_resumen(date, date) to authenticated;

-- La firma de salida cambia (nueva columna campana): Postgres exige DROP
-- previo para RETURNS TABLE. Es solo la funcion; los datos no se tocan.
drop function if exists public.crm_inscripciones_detalle(date, date);
create or replace function public.crm_inscripciones_detalle(p_desde date, p_hasta date)
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text,
  nombre text, telefono text, campana text, programa text, estado_actual text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  return query
    select h.id, h.gestion_id, h.fecha_inscripcion, h.estado_inscripcion,
      l."Nombre"::text, l."Telefono"::text,
      coalesce(nullif(btrim(l."Campaña"), ''), 'Sin campaña')::text,
      l."PROGRAMA INSCRIPCION"::text, l."GESTION"::text
    from public.crm_inscripciones_historial(p_desde, p_hasta, false) h
    join public.leads l on l.id = h.id;
end;
$$;
revoke all on function public.crm_inscripciones_detalle(date, date) from public, anon;
grant execute on function public.crm_inscripciones_detalle(date, date) to authenticated;

create or replace function public.management_period_summary(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if p_desde is null or p_hasta is null then raise exception using errcode='22023', message='period_range_required'; end if;
  if p_desde > p_hasta then raise exception using errcode='22023', message='period_range_invalid'; end if;
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with g as (
    select g.lead_id,
           lower(btrim(coalesce(g.canal, ''))) as canal,
           g.is_data_dura,
           g.fecha_gestion,
           l."Mes" as mes,
           l."Fecha" as fecha,
           upper(btrim(g.gestion_nueva)) as estado,
           upper(btrim(coalesce(g.gestion_anterior, ''))) as estado_anterior
    from public.lead_gestiones g
    left join public.leads l on l.id = g.lead_id
    where g.fecha_gestion between p_desde and p_hasta
  ),
  por_estado as (
    select estado as label,
           count(*) as eventos,
           count(distinct lead_id) as leads
    from g
    group by estado
  ),
  c as (
    select a.status, a.is_data_dura, a.campus
    from public.lead_appointments a
    where (a.scheduled_at at time zone 'America/New_York')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'gestiones', jsonb_build_object(
      'total_eventos', (select count(*) from g),
      'leads_unicos', (select count(distinct lead_id) from g),
      'agendados_normales', (select count(distinct lead_id) from g where estado like 'AGENDAD%' and estado not like '%DATA%DURA%'),
      'agendados_data_dura', (select count(distinct lead_id) from g where estado like 'AGENDAD%DATA%DURA%'),
      'inscripciones_realizadas_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado not like '%DATA%' and estado_anterior not like 'INSCRIT%'),
      'inscripciones_realizadas_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado like '%DATA%' and estado_anterior not like 'INSCRIT%'),
      'inscritos_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado not like '%DATA%'),
      'inscritos_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado like '%DATA%'),
      'por_estado', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'eventos', p.eventos, 'leads', p.leads) order by p.eventos desc, p.label) from por_estado p), '[]'::jsonb)),
    'canales', jsonb_build_object(
      'llamadas_normales', (select count(*) from g where canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamadas_data_dura', (select count(*) from g where canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamada_whatsapp', (select count(*) from g where canal = 'llamada y whatsapp'),
      'whatsapp', (select count(*) from g where canal = 'whatsapp'),
      'otros', (select count(*) from g where coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp'))),
    'citas', jsonb_build_object(
      'programadas_normales', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura is distinct from true),
      'programadas_data_dura', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura = true),
      'asistieron', (select count(*) from c where status = 'ASISTIO'),
      'no_asistieron', (select count(*) from c where status = 'NO_ASISTIO'),
      'canceladas', (select count(*) from c where status = 'CANCELADA'),
      'reprogramadas', (select count(*) from c where status = 'REPROGRAMADA'),
      'doral_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura is distinct from true),
      'doral_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura = true),
      'weston_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura is distinct from true),
      'weston_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura = true),
      'sin_sede', (select count(*) from c where status = 'PROGRAMADA' and campus is null))
  ) into result;
  return result;
end;
$$;
revoke all on function public.management_period_summary(date, date) from public, anon;
grant execute on function public.management_period_summary(date, date) to authenticated;

commit;

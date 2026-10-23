-- Canales del reporte por periodo: Instagram deja de contarse dentro de
-- "otros". No se toca el reporte diario ni ningun dato guardado.
-- Solo cambia el desglose de canales de management_period_summary.
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
           upper(btrim(coalesce(g.gestion_anterior, ''))) as estado_anterior,
           public._crm_inscripcion_clase(public._crm_fecha_ingreso(l."Fecha"), g.fecha_gestion) as clase_inscripcion
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
      'inscripciones_realizadas_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado_anterior not like 'INSCRIT%' and clase_inscripcion = 'NORMAL'),
      'inscripciones_realizadas_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado_anterior not like 'INSCRIT%' and clase_inscripcion = 'DATA_DURA'),
      'inscritos_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado not like '%DATA%'),
      'inscritos_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado like '%DATA%'),
      'por_estado', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'eventos', p.eventos, 'leads', p.leads) order by p.eventos desc, p.label) from por_estado p), '[]'::jsonb)),
    'canales', jsonb_build_object(
      'llamadas_normales', (select count(*) from g where canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamadas_data_dura', (select count(*) from g where canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamada_whatsapp', (select count(*) from g where canal = 'llamada y whatsapp'),
      'whatsapp', (select count(*) from g where canal = 'whatsapp'),
      'instagram', (select count(*) from g where canal = 'instagram'),
      'otros', (select count(*) from g where coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp', 'instagram'))),
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
comment on function public.management_period_summary(date, date) is 'Actividad del periodo: altas reales por clase de fechas; canales excluyentes con Instagram separado de otros.';

commit;

-- Reporte diario de trabajo: agendamientos por fecha de creación y resultados por fecha de registro.
-- La fecha programada permanece en Citas/calendario; no cuenta como trabajo del día.
begin;

create or replace function public.daily_management_report(p_fecha date, p_autor_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if p_fecha is null then raise exception using errcode='22023', message='report_date_required'; end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with
  booked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
  ),
  resolved as (
    select a.* from lead_appointments a
    where (a.resolved_at at time zone 'America/New_York')::date = p_fecha
  ),
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name), '') as name from lead_gestiones g where g.fecha_gestion=p_fecha
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from booked a left join user_access creator on creator.user_id = a.worker_id
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name), '') from resolved a
      union all select ua.user_id, ua.nombre from user_access ua where ua.activo and ua.role in ('admin','agente','supervisor')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name), '') from booked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from resolved a where a.advisor_user_id is null
    ) n where name is not null group by name
  ), filtered as (select * from people where p_autor_user_id is null or user_id=p_autor_user_id),
  gest as (
    select g.id, g.lead_id, g.autor_user_id, nullif(btrim(g.autor_name, ''), '') as autor_name,
      lower(btrim(coalesce(l."Medio", ''))) medio,
      lower(btrim(coalesce(g.canal, ''))) canal,
      g.is_data_dura,
      g.gestion_anterior,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g left join leads l on l.id = g.lead_id
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, '')))) as gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%') as inscritos_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_fecha)) as inscritos_dd,
      (select count(distinct lead_id) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'AGENDAD%' and estado not like '%DATA%DURA%') as aggest_dia,
      (select count(distinct lead_id) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'AGENDAD%DATA%DURA%') as aggest_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('whatsapp','whatsapp nuevo')) as p_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('instagram','comentarios de red')) as p_fb_ig,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio = 'cognitalkign') as p_cognitalking,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('lead directo','referido','referidos andres')) as p_directo,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(medio, '') not in ('whatsapp','whatsapp nuevo','instagram','comentarios de red','cognitalkign','lead directo','referido','referidos andres')) as p_otros,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'whatsapp' and gestion_anterior is null) as wa_nuevos,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'whatsapp' and gestion_anterior is not null) as wa_gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'instagram') as c_instagram,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'visita conservatorio') as c_visita,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp', 'instagram', 'visita conservatorio')) as c_sin_clasificar,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and not a.is_data_dura) as ag_dia,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.is_data_dura) as ag_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and not a.is_data_dura) as ag_doral,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and a.is_data_dura) as ag_doral_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and not a.is_data_dura) as ag_weston,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and a.is_data_dura) as ag_weston_dd,
      (select count(*) from resolved a where a.advisor_user_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.status = 'ASISTIO') as visits,
      (select count(*) from resolved a where a.advisor_user_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.status = 'NO_ASISTIO') as absent,
      (select count(*) from resolved a where a.advisor_user_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.status = 'CANCELADA') as cancelled,
      (select count(*) from resolved a where a.advisor_user_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.status = 'REPROGRAMADA') as rescheduled
    from filtered f left join user_access ua on ua.user_id = f.user_id
  ),
  shaped as (
    select jsonb_build_object(
      'autor_user_id', blocks.user_id,
      'autor_name', blocks.author,
      'procedencia', jsonb_build_object(
        'WhatsApp', blocks.p_whatsapp,
        'Facebook/Instagram', blocks.p_fb_ig,
        'CogniTalking', blocks.p_cognitalking,
        'Directo o Referido', blocks.p_directo,
        'Otros', blocks.p_otros),
      'llamadas', jsonb_build_object(
        'del_dia', blocks.llam_dia,
        'data_dura', blocks.llam_dd,
        'llamada_whatsapp', blocks.llam_wa,
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa),
      'whatsapp', jsonb_build_object(
        'nuevos', blocks.wa_nuevos,
        'gestionados', blocks.wa_gestionados,
        'total', blocks.wa_nuevos + blocks.wa_gestionados),
      'canales', jsonb_build_object(
        'llamada', blocks.llam_dia,
        'data_dura', blocks.llam_dd,
        'llamada_whatsapp', blocks.llam_wa,
        'whatsapp', blocks.wa_nuevos + blocks.wa_gestionados,
        'instagram', blocks.c_instagram,
        'visita', blocks.c_visita,
        'sin_clasificar', blocks.c_sin_clasificar,
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa + blocks.wa_nuevos + blocks.wa_gestionados + blocks.c_instagram + blocks.c_visita + blocks.c_sin_clasificar),
      'citas', jsonb_build_object(
        'agendados_dia', blocks.ag_dia,
        'agendados_data_dura', blocks.ag_dd,
        'agendados_gestionados_dia', blocks.aggest_dia,
        'agendados_gestionados_data_dura', blocks.aggest_dd,
        'agendados_doral', blocks.ag_doral,
        'agendados_doral_data_dura', blocks.ag_doral_dd,
        'agendados_weston', blocks.ag_weston,
        'agendados_weston_data_dura', blocks.ag_weston_dd,
        'total_agendados', blocks.ag_dia + blocks.ag_dd,
        'visitas', blocks.visits,
        'no_asistieron', blocks.absent,
        'canceladas', blocks.cancelled,
        'reprogramadas', blocks.rescheduled),
      'inscritos', jsonb_build_object(
        'del_dia', blocks.inscritos_dia - blocks.inscritos_dd,
        'data_dura', blocks.inscritos_dd,
        'total', blocks.inscritos_dia),
      'gestionados', blocks.gestionados
    ) as block
    from blocks
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'asesoras', coalesce((select jsonb_agg(blk order by blk->>'autor_name') from (select block as blk from shaped) q), '[]'::jsonb),
    'total', jsonb_build_object('gestionados', coalesce((select sum((blk->>'gestionados')::int) from (select block as blk from shaped) q), 0))
  ) into result;
  return result;
end;
$$;

revoke all on function public.daily_management_report(date, uuid) from public, anon;
grant execute on function public.daily_management_report(date, uuid) to authenticated;
comment on function public.daily_management_report(date, uuid) is 'Reporte diario: citas creadas por fecha Miami y autor de creación; resultados por fecha de resolución. La fecha programada se consulta en Citas.';

commit;

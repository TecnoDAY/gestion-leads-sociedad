-- Altas reales del dia: una persona por fecha, atribuida a la ultima entrada
-- registrada en ese dia. Conserva inscritos (seguimientos) y todos los ACL.
-- Solo redefine el reporte; no modifica leads, gestiones ni historial.
begin;

create or replace function public.daily_management_report(p_fecha date, p_autor_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_solo_asesoras boolean;
begin
  if p_fecha is null then raise exception using errcode = '22023', message = 'report_date_required'; end if;
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  v_solo_asesoras := coalesce(public.is_asesora_user(), false);
  with
  inscripciones as (
    -- Misma seleccion que crm_inscripciones_historial(..., false), sin llamar
    -- a ese RPC: su guard excluye al editor de campanas que si puede ver este.
    -- Primero elegir entre TODOS los autores; filtrar antes duplicaria altas.
    select e.id, g.autor_user_id, nullif(btrim(g.autor_name), '') as autor_name
    from (
      select distinct on (x.id) x.id, x.gestion_id
      from public._crm_inscripcion_eventos() x
      join public.leads l on l.id = x.id and l.archived_at is null
      where x.fecha_inscripcion = p_fecha
      order by x.id, x.registrado_at desc, x.gestion_id desc
    ) e
    join public.lead_gestiones g on g.id = e.gestion_id
  ),
  booked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is null
  ),
  rebooked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is not null
  ),
  result_events as (
    select e.*, e.actor_user_id as action_user_id, e.actor_name as action_name
    from public.lead_appointment_events e
    join public.lead_appointments a on a.id = e.appointment_id
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (e.created_at at time zone 'America/New_York')::date = p_fecha
      and (e.status_nuevo = 'REPROGRAMADA' or e.status_nuevo in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA'))
  ),
  resolved as (
    select a.* from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.resolved_at at time zone 'America/New_York')::date = p_fecha
  ),
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name), '') as name from lead_gestiones g
        join public.leads l on l.id = g.lead_id and l.archived_at is null
        where g.fecha_gestion=p_fecha
          and (not v_solo_asesoras or not exists (
            select 1 from user_access oculta where oculta.user_id = g.autor_user_id and oculta.role in ('admin','supervisor')))
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from booked a left join user_access creator on creator.user_id = a.worker_id
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.worker_id and oculta.role in ('admin','supervisor')))
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from rebooked a left join user_access creator on creator.user_id = a.worker_id
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.worker_id and oculta.role in ('admin','supervisor')))
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name), '') from resolved a
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.advisor_user_id and oculta.role in ('admin','supervisor')))
      union all select e.action_user_id, nullif(btrim(e.action_name), '') from result_events e
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = e.action_user_id and oculta.role in ('admin','supervisor')))
      union all select ua.user_id, ua.nombre from user_access ua
        where ua.activo and ua.role in ('admin','agente','supervisor') and (not v_solo_asesoras or ua.role = 'agente')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g
        join public.leads l on l.id = g.lead_id and l.archived_at is null
        where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name), '') from booked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from rebooked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from resolved a where a.advisor_user_id is null
      union all select nullif(btrim(e.action_name), '') from result_events e where e.action_user_id is null
    ) n where name is not null group by name
  ),
  gest as (
    select g.id, g.lead_id, g.autor_user_id, nullif(btrim(g.autor_name, ''), '') as autor_name,
      lower(btrim(coalesce(l."Medio", ''))) medio,
      lower(btrim(coalesce(g.canal, ''))) canal,
      g.is_data_dura, g.gestion_anterior,
      (g.gestion_anterior is null) as es_nuevo,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g join leads l on l.id = g.lead_id and l.archived_at is null
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from inscripciones i where i.autor_user_id is not distinct from f.user_id and (f.user_id is not null or i.autor_name = btrim(coalesce(f.name, '')))) as inscripciones_realizadas,
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
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and (canal = 'llamada data dura' or (canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_fecha)))))) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal in ('llamada', 'llamada data dura', 'llamada y whatsapp') and es_nuevo) as llam_nuevos,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'whatsapp') as c_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal not in ('llamada', 'llamada data dura', 'llamada y whatsapp') and es_nuevo) as wa_nuevos,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal not in ('llamada', 'llamada data dura', 'llamada y whatsapp') and not es_nuevo) as wa_gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'instagram') as c_instagram,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'visita conservatorio') as c_visita,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(canal, '') not in ('llamada', 'llamada data dura', 'llamada y whatsapp', 'whatsapp', 'instagram', 'visita conservatorio')) as c_sin_clasificar,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and not a.is_data_dura) as ag_dia,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.is_data_dura) as ag_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and not a.is_data_dura) as ag_doral,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and a.is_data_dura) as ag_doral_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and not a.is_data_dura) as ag_weston,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and a.is_data_dura) as ag_weston_dd,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'ASISTIO') as visits,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'NO_ASISTIO') as absent,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'CANCELADA') as cancelled,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'REPROGRAMADA') as rescheduled,
      (select count(*) from rebooked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, '')))) as rebooked_today
    from people f left join user_access ua on ua.user_id = f.user_id
  ),
  equipo_blocks as (
    select
      null::uuid as user_id, 'Total asesoras'::text as author,
      coalesce(sum(b.inscripciones_realizadas),0)::bigint as inscripciones_realizadas,
      coalesce(sum(b.gestionados),0)::bigint as gestionados,
      coalesce(sum(b.inscritos_dia),0)::bigint as inscritos_dia,
      coalesce(sum(b.inscritos_dd),0)::bigint as inscritos_dd,
      coalesce(sum(b.aggest_dia),0)::bigint as aggest_dia,
      coalesce(sum(b.aggest_dd),0)::bigint as aggest_dd,
      coalesce(sum(b.p_whatsapp),0)::bigint as p_whatsapp,
      coalesce(sum(b.p_fb_ig),0)::bigint as p_fb_ig,
      coalesce(sum(b.p_cognitalking),0)::bigint as p_cognitalking,
      coalesce(sum(b.p_directo),0)::bigint as p_directo,
      coalesce(sum(b.p_otros),0)::bigint as p_otros,
      coalesce(sum(b.llam_dia),0)::bigint as llam_dia,
      coalesce(sum(b.llam_dd),0)::bigint as llam_dd,
      coalesce(sum(b.llam_wa),0)::bigint as llam_wa,
      coalesce(sum(b.llam_nuevos),0)::bigint as llam_nuevos,
      coalesce(sum(b.c_whatsapp),0)::bigint as c_whatsapp,
      coalesce(sum(b.wa_nuevos),0)::bigint as wa_nuevos,
      coalesce(sum(b.wa_gestionados),0)::bigint as wa_gestionados,
      coalesce(sum(b.c_instagram),0)::bigint as c_instagram,
      coalesce(sum(b.c_visita),0)::bigint as c_visita,
      coalesce(sum(b.c_sin_clasificar),0)::bigint as c_sin_clasificar,
      coalesce(sum(b.ag_dia),0)::bigint as ag_dia,
      coalesce(sum(b.ag_dd),0)::bigint as ag_dd,
      coalesce(sum(b.ag_doral),0)::bigint as ag_doral,
      coalesce(sum(b.ag_doral_dd),0)::bigint as ag_doral_dd,
      coalesce(sum(b.ag_weston),0)::bigint as ag_weston,
      coalesce(sum(b.ag_weston_dd),0)::bigint as ag_weston_dd,
      coalesce(sum(b.visits),0)::bigint as visits,
      coalesce(sum(b.absent),0)::bigint as absent,
      coalesce(sum(b.cancelled),0)::bigint as cancelled,
      coalesce(sum(b.rescheduled),0)::bigint as rescheduled,
      coalesce(sum(b.rebooked_today),0)::bigint as rebooked_today,
      1 as es_equipo
    from blocks b
    join user_access rol on rol.user_id = b.user_id and rol.role = 'agente'
  ),
  salida_blocks as (
    select b.user_id, b.author, b.inscripciones_realizadas, b.gestionados, b.inscritos_dia, b.inscritos_dd, b.aggest_dia, b.aggest_dd,
      b.p_whatsapp, b.p_fb_ig, b.p_cognitalking, b.p_directo, b.p_otros,
      b.llam_dia, b.llam_dd, b.llam_wa, b.llam_nuevos,
      b.c_whatsapp, b.wa_nuevos, b.wa_gestionados, b.c_instagram, b.c_visita, b.c_sin_clasificar,
      b.ag_dia, b.ag_dd, b.ag_doral, b.ag_doral_dd, b.ag_weston, b.ag_weston_dd,
      b.visits, b.absent, b.cancelled, b.rescheduled, b.rebooked_today,
      0 as es_equipo
    from blocks b
    where p_autor_user_id is null or b.user_id = p_autor_user_id
    union all
    select e.user_id, e.author, e.inscripciones_realizadas, e.gestionados, e.inscritos_dia, e.inscritos_dd, e.aggest_dia, e.aggest_dd,
      e.p_whatsapp, e.p_fb_ig, e.p_cognitalking, e.p_directo, e.p_otros,
      e.llam_dia, e.llam_dd, e.llam_wa, e.llam_nuevos,
      e.c_whatsapp, e.wa_nuevos, e.wa_gestionados, e.c_instagram, e.c_visita, e.c_sin_clasificar,
      e.ag_dia, e.ag_dd, e.ag_doral, e.ag_doral_dd, e.ag_weston, e.ag_weston_dd,
      e.visits, e.absent, e.cancelled, e.rescheduled, e.rebooked_today,
      e.es_equipo
    from equipo_blocks e
  ),
  shaped as (
    select blocks.es_equipo, jsonb_build_object(
      'autor_user_id', blocks.user_id,
      'autor_name', blocks.author,
      'inscripciones_realizadas', blocks.inscripciones_realizadas,
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
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa,
        'nuevos', blocks.llam_nuevos,
        'gestionados', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa - blocks.llam_nuevos,
        'total_gestion', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa),
      'whatsapp', jsonb_build_object(
        'nuevos', blocks.wa_nuevos,
        'gestionados', blocks.wa_gestionados,
        'total', blocks.wa_nuevos + blocks.wa_gestionados),
      'canales', jsonb_build_object(
        'llamada', blocks.llam_dia,
        'data_dura', blocks.llam_dd,
        'llamada_whatsapp', blocks.llam_wa,
        'whatsapp', blocks.c_whatsapp,
        'instagram', blocks.c_instagram,
        'visita', blocks.c_visita,
        'sin_clasificar', blocks.c_sin_clasificar,
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa + blocks.c_whatsapp + blocks.c_instagram + blocks.c_visita + blocks.c_sin_clasificar),
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
        'citas_reprogramadas_hoy', blocks.rebooked_today,
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
    from salida_blocks blocks
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'asesoras', coalesce((select jsonb_agg(blk order by blk->>'autor_name') from (select block as blk from shaped where es_equipo = 0) q), '[]'::jsonb),
    'equipo', (select block from shaped where es_equipo = 1),
    'total', jsonb_build_object(
      'inscripciones_realizadas', coalesce((select sum((block->>'inscripciones_realizadas')::bigint) from shaped where es_equipo = 0), 0),
      'gestionados', coalesce((select sum((blk->>'gestionados')::int) from (select block as blk from shaped where es_equipo = 0) q), 0))
  ) into result;
  return result;
end;
$$;

revoke all on function public.daily_management_report(date, uuid) from public, anon;
grant execute on function public.daily_management_report(date, uuid) to authenticated;
comment on function public.daily_management_report(date, uuid) is 'Reporte diario por fecha_gestion. inscripciones_realizadas cuenta personas con entrada a INSCRIT segun historial, ultima entrada registrada en el dia y autor de esa entrada; incluye todas las clases y excluye archivados. inscritos conserva seguimientos. Equipo independiente del filtro; permisos y demas metricas conservados.';

commit;

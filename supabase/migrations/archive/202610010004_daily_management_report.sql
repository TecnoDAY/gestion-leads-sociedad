-- Reporte diario agregado. Revisar y aplicar manualmente en Supabase; no se aplica remoto.
begin;

-- Estas dos citas se crearon después del evento que introdujo is_data_dura, cuando
-- la columna aún no existía; la corrección queda condicionada a toda la evidencia.
do $fix$ declare ev record; begin
  select * into ev from public.lead_gestiones where id = 9606;
  if not found or ev.lead_id <> 4979
     or upper(btrim(ev.gestion_nueva)) not like 'AGENDADO%DATADURA%'
        and upper(btrim(ev.gestion_nueva)) not like '%DATA DURA%'
  then raise exception 'event_9606_unexpected'; end if;
  if not exists (select 1 from public.leads where id=4979 and upper(btrim(coalesce("GESTION",''))) like '%DATA DURA%') then raise exception 'lead_4979_unexpected'; end if;
  update public.lead_appointments set is_data_dura = true
  where id in (9,10) and lead_id = 4979
    and (created_at >= ev.created_at or scheduled_at >= ev.created_at)
    and is_data_dura = false;
  if (select count(*) from public.lead_appointments where id in (9,10) and lead_id=4979 and is_data_dura) <> 2 then raise exception 'appointments_9_10_not_marked'; end if;
end $fix$;

-- Regla equivalente a isInscritoDataDura: Mes canónico del lead y Fecha como respaldo.
create or replace function public._daily_report_data_dura(p_mes text, p_fecha text, p_report date) returns boolean language sql immutable as $$
  select (upper(coalesce(p_mes,'')) ~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
      and upper(coalesce(p_mes,'')) not like '%'||case extract(month from p_report)::int when 1 then 'ENERO' when 2 then 'FEBRERO' when 3 then 'MARZO' when 4 then 'ABRIL' when 5 then 'MAYO' when 6 then 'JUNIO' when 7 then 'JULIO' when 8 then 'AGOSTO' when 9 then 'SEPTIEMBRE' when 10 then 'OCTUBRE' when 11 then 'NOVIEMBRE' else 'DICIEMBRE' end||'%')
    or (upper(coalesce(p_mes,'')) !~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
      and nullif(substring(p_fecha from '(19|20)[0-9]{2}'), '') is not null
      and substring(p_fecha from '(19|20)[0-9]{2}')::int <> extract(year from p_report)::int)
$$;

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
  /* p_autor_user_id es solo filtro: cualquier usuario CRM puede consultar cualquier asesora.
     Un UUID sin gestiones ni citas devuelve bloques en cero (no un error). */
  with
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name),'') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha
      union all select ua.user_id, ua.nombre from user_access ua where ua.activo and ua.role in ('admin','agente','supervisor')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name),'') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha and a.advisor_user_id is null
    ) n where name is not null group by name
  ), filtered as (select * from people where p_autor_user_id is null or user_id=p_autor_user_id),
  gest as (
    select g.id, g.autor_user_id, nullif(btrim(g.autor_name),'') autor_name,
      lower(btrim(coalesce(l."Medio",''))) medio,
      lower(btrim(coalesce(g.canal,''))) canal,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g left join leads l on l.id = g.lead_id
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,'')))) as gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and estado like 'INSCRIT%') as inscritos_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_fecha)) as inscritos_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('whatsapp','whatsapp nuevo')) as p_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('instagram','comentarios de red')) as p_fb_ig,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio = 'cognitalkign') as p_cognitalking,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('lead directo','referido','referidos andres')) as p_directo,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and coalesce(medio,'') not in ('whatsapp','whatsapp nuevo','instagram','comentarios de red','cognitalkign','lead directo','referido','referidos andres')) as p_otros,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada' and not public._daily_report_data_dura(mes, fecha, p_fecha)) as llam_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada' and public._daily_report_data_dura(mes, fecha, p_fecha)) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and not a.is_data_dura) as ag_dia,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.is_data_dura) as ag_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'ASISTIO') as visits,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'NO_ASISTIO') as absent,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'CANCELADA') as cancelled,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'REPROGRAMADA') as rescheduled
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
      'citas', jsonb_build_object(
        'agendados_dia', blocks.ag_dia,
        'agendados_data_dura', blocks.ag_dd,
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

comment on function public.daily_management_report(date, uuid) is 'Reporte diario CRM: procedencia, llamadas, citas, inscritos y gestiones por asesora; el total detallado lo calcula el cliente sumando bloques.';
revoke all on function public.daily_management_report(date, uuid) from public, anon;
grant execute on function public.daily_management_report(date, uuid) to authenticated;
commit;

-- Rollback manual (no ejecutar remoto automáticamente): drop function public.daily_management_report(date,uuid); drop function public._daily_report_data_dura(text,text,date);

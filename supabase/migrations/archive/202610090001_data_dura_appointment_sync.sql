-- Data Dura: sincronia gestion<->cita y resumen de actividad por periodo.
-- Hallazgo auditado 2026-10-08: un lead actualmente "Agendado Data Dura" conserva
-- su cita PROGRAMADA con is_data_dura=false (17/10). El cambio Agendado<->DD no
-- crea cita nueva, asi que la bandera quedaba congelada en el valor del alta.
-- 1) Trigger central: al cambiar entre estados AGENDAD* con distinta clase Data Dura,
--    actualiza SOLO las citas PROGRAMADA del lead (las cerradas conservan su clase
--    historica). 2) Correccion guardada: espera exactamente 1 cita a true y 0 a
--    false, aborta en cualquier otro estado. 3) RPC agregada de actividad por
--    periodo. 4) Extension aditiva del diario: agendados por gestion vs por cita.
-- Aplicar en remoto solo tras revision; vacia si se ejecuta dos veces (idempotente
-- por guardas).
begin;

-- ---------------------------------------------------------------------------
-- 1. Trigger: leads.GESTION AGENDAD* <-> clase Data Dura de citas PROGRAMADA.
-- ---------------------------------------------------------------------------
create or replace function public.trg_sync_lead_agendado_dd_appointments()
returns trigger
language plpgsql
security definer
set search_path = public
as $tg$
declare
  v_old_ag boolean := upper(btrim(coalesce(old."GESTION", ''))) like 'AGENDAD%';
  v_new_ag boolean := upper(btrim(coalesce(new."GESTION", ''))) like 'AGENDAD%';
  v_old_dd boolean := upper(btrim(coalesce(old."GESTION", ''))) like 'AGENDAD%DATA%DURA%';
  v_new_dd boolean := upper(btrim(coalesce(new."GESTION", ''))) like 'AGENDAD%DATA%DURA%';
begin
  -- Solo aplica si ambos estados son agendados y cambia la clase Data Dura;
  -- el paso a Inscrito/u otro estado NO reescribe citas historicas.
  if v_old_ag and v_new_ag and v_old_dd is distinct from v_new_dd then
    update public.lead_appointments
    set is_data_dura = v_new_dd
    where lead_id = new.id and status = 'PROGRAMADA';
  end if;
  return new;
end;
$tg$;

drop trigger if exists trg_leads_sync_agendado_dd_appointments on public.leads;
create trigger trg_leads_sync_agendado_dd_appointments
  after update of "GESTION" on public.leads
  for each row execute function public.trg_sync_lead_agendado_dd_appointments();

comment on function public.trg_sync_lead_agendado_dd_appointments() is
  'Sincroniza lead_appointments.is_data_dura de citas PROGRAMADA cuando el lead cambia entre Agendado normal y Agendado Data Dura.';

-- ---------------------------------------------------------------------------
-- 2. Correccion guardada del desfase actual (esperado: 1 a true, 0 a false).
-- ---------------------------------------------------------------------------
do $fix$
declare v_to_true int; v_to_false int; v_rest int;
begin
  select count(*) into v_to_true
    from public.lead_appointments a join public.leads l on l.id = a.lead_id
   where l.archived_at is null and a.status = 'PROGRAMADA'
     and upper(btrim(coalesce(l."GESTION", ''))) like 'AGENDAD%DATA%DURA%'
     and a.is_data_dura = false;
  select count(*) into v_to_false
    from public.lead_appointments a join public.leads l on l.id = a.lead_id
   where l.archived_at is null and a.status = 'PROGRAMADA'
     and upper(btrim(coalesce(l."GESTION", ''))) like 'AGENDAD%'
     and upper(btrim(coalesce(l."GESTION", ''))) not like 'AGENDAD%DATA%DURA%'
     and a.is_data_dura = true;
  if v_to_true = 0 and v_to_false = 0 then
    raise notice 'citas ya consistentes; nada que corregir';
    return;
  end if;
  if v_to_true <> 1 or v_to_false <> 0 then
    raise exception 'dd_appointment_drift_unexpected to_true=% to_false=%', v_to_true, v_to_false;
  end if;
  update public.lead_appointments a set is_data_dura = true
    from public.leads l
   where l.id = a.lead_id and l.archived_at is null and a.status = 'PROGRAMADA'
     and upper(btrim(coalesce(l."GESTION", ''))) like 'AGENDAD%DATA%DURA%'
     and a.is_data_dura = false;
  select count(*) into v_rest
    from public.lead_appointments a join public.leads l on l.id = a.lead_id
   where l.archived_at is null and a.status = 'PROGRAMADA'
     and upper(btrim(coalesce(l."GESTION", ''))) like 'AGENDAD%'
     and a.is_data_dura is distinct from
         (upper(btrim(coalesce(l."GESTION", ''))) like 'AGENDAD%DATA%DURA%');
  if v_rest <> 0 then raise exception 'dd_appointment_fix_incomplete rest=%', v_rest; end if;
end $fix$;

-- ---------------------------------------------------------------------------
-- 3. Diario: aditivo — agendados por gestion del dia vs citas programadas hoy.
-- ---------------------------------------------------------------------------
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
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name), '') as name from lead_gestiones g where g.fecha_gestion=p_fecha
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
    select g.id, g.lead_id, g.autor_user_id, nullif(btrim(g.autor_name, ''), '') as autor_name,
      lower(btrim(coalesce(l."Medio", ''))) medio,
      lower(btrim(coalesce(g.canal, ''))) canal,
      g.is_data_dura,
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
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and not a.is_data_dura) as ag_dia,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.is_data_dura) as ag_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'DORAL' and not a.is_data_dura) as ag_doral,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'DORAL' and a.is_data_dura) as ag_doral_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'WESTON' and not a.is_data_dura) as ag_weston,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'WESTON' and a.is_data_dura) as ag_weston_dd,
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
comment on function public.daily_management_report(date, uuid) is
  'Diario aditivo: agendados_gestionados (dia de la gestion) vs agendados (dia programado de la cita); resto del contrato intacto.';

-- ---------------------------------------------------------------------------
-- 4. Actividad por periodo: gestiones (fecha_gestion) + citas (scheduled_at).
--    Solo conteos agregados; sin ids, nombres ni notas. Zona Miami en citas.
-- ---------------------------------------------------------------------------
create or replace function public.management_period_summary(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if p_desde is null or p_hasta is null then raise exception using errcode='22023', message='period_range_required'; end if;
  if p_desde > p_hasta then raise exception using errcode='22023', message='period_range_invalid'; end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with g as (
    select g.lead_id,
           lower(btrim(coalesce(g.canal, ''))) as canal,
           g.is_data_dura,
           l."Mes" as mes,
           l."Fecha" as fecha,
           upper(btrim(g.gestion_nueva)) as estado
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
      'inscritos_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and not public._daily_report_data_dura(mes, fecha, p_desde)),
      'inscritos_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_desde)),
      'por_estado', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'eventos', p.eventos, 'leads', p.leads) order by p.eventos desc, p.label) from por_estado p), '[]'::jsonb)),
    'canales', jsonb_build_object(
      'llamadas_normales', (select count(*) from g where canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, p_desde)))),
      'llamadas_data_dura', (select count(*) from g where canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_desde)))),
      'llamada_whatsapp', (select count(*) from g where canal = 'llamada y whatsapp'),
      'whatsapp', (select count(*) from g where canal = 'whatsapp'),
      'otros', (select count(*) from g where coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp'))),
    'citas', jsonb_build_object(
      'programadas_normales', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura is distinct from true),
      'programadas_data_dura', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura is true),
      'asistieron', (select count(*) from c where status = 'ASISTIO'),
      'no_asistieron', (select count(*) from c where status = 'NO_ASISTIO'),
      'canceladas', (select count(*) from c where status = 'CANCELADA'),
      'reprogramadas', (select count(*) from c where status = 'REPROGRAMADA'),
      'doral_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura is distinct from true),
      'doral_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura is true),
      'weston_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura is distinct from true),
      'weston_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura is true),
      'sin_sede', (select count(*) from c where campus is null))
  ) into result;
  return result;
end;
$$;

revoke all on function public.management_period_summary(date, date) from public, anon;
grant execute on function public.management_period_summary(date, date) to authenticated;
comment on function public.management_period_summary(date, date) is
  'Actividad del periodo: gestiones (por fecha_gestion, eventos y leads distintos) + citas (por fecha programada Miami) y canales; solo conteos agregados, sin PII.';

commit;

-- Rollback manual (solo tras revision):
-- drop trigger if exists trg_leads_sync_agendado_dd_appointments on public.leads;
-- drop function if exists public.trg_sync_lead_agendado_dd_appointments();
-- drop function if exists public.management_period_summary(date, date);
-- daily_management_report: restaurar la version de 202610020007_appointment_campus.sql.

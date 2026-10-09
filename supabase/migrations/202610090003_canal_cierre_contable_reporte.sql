-- Cierre contable del reporte diario: Procedencia = Canales = Gestiones.
-- Hallazgo (captura usuario 2026-10-08): Procedencia total 45, Llamadas 17 y
-- WhatsApp 22 -> faltaban 6 gestiones (2 Instagram + 4 iniciales WhatsApp sin
-- canal). Causa: create_lead nunca enviaba "ULTIMA GESTION", asi que la gestion
-- inicial quedaba con canal NULL aunque el medio fuera WhatsApp (65 historicos
-- entre 02/10 y 08/10). Ademas el encabezado por asesora leia una clave que
-- podia quedar en 0 pese a haber gestiones (se calcula ahora desde el detalle).
-- 1) Reconciliacion guardada: gestiones INICIALES (gestion_anterior IS NULL),
--    sin canal y con Medio WhatsApp/WhatsApp Nuevo -> canal 'WhatsApp'
--    (implicita, como ya hace el trigger del reporte). Aborta si el remanente
--    no llega a 0. Idempotente: sin filas -> notice y sale.
-- 2) Fallback en _create_lead_with_gestion: si el navegador no envia ULTIMA
--    GESTION y la procedencia es WhatsApp*, la gestion inicial registra
--    canal WhatsApp (la nueva UI ya lo envia explicito y editable).
-- 3) Extension ADITIVA de daily_management_report: bloque 'canales' con las
--    categorias excluyentes (llamada, data_dura, llamada_whatsapp, whatsapp,
--    instagram, visita, sin_clasificar) y total (= gestionados). Categorias de
--    canal leen lead_gestiones.canal (normalizado a minusculas); "Sin
--    clasificar" agrupa los nulos/vacios/desconocidos para que nada desaparezca.
-- Aplicar en remoto solo tras revision; idempotente por guardas.
begin;

-- ---------------------------------------------------------------------------
-- 1. Fallback del canal inicial por procedencia WhatsApp (solo si viene vacio).
-- ---------------------------------------------------------------------------
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

  v := jsonb_set(jsonb_set(p_lead, '{Fecha}', to_jsonb(to_char(llegada, 'DD/MM/YYYY'))), '{Mes}', to_jsonb(meses[extract(month from llegada)::int]));
  created := public.create_lead_record(v);

  select coalesce(ua.nombre, '') into autor from public.user_access ua where ua.user_id = auth.uid();
  v_canal := created."ULTIMA GESTION";
  v_dd := null;
  if lower(btrim(coalesce(v_canal, ''))) = 'llamada data dura' then
    v_canal := 'Llamada'; v_dd := true;
  elsif lower(btrim(coalesce(v_canal, ''))) = 'llamada' then
    v_dd := false;
  end if;
  -- Fallback: canal vacio por navegador antiguo y procedencia WhatsApp.
  if btrim(coalesce(v_canal, '')) = '' and lower(btrim(coalesce(created."Medio", ''))) in ('whatsapp', 'whatsapp nuevo') then
    v_canal := 'WhatsApp';
  end if;
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura)
  values (created.id, hoy, null, created."GESTION", v_canal, coalesce(autor, ''), auth.uid(), v_dd);
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Reconciliacion guardada de gestiones iniciales WhatsApp sin canal.
--    Solo filas que cumplen las TRES condiciones a la vez; el resto se deja.
-- ---------------------------------------------------------------------------
do $fix$
declare v_pendientes int; v_rest int;
begin
  select count(*) into v_pendientes
    from public.lead_gestiones g join public.leads l on l.id = g.lead_id
   where g.gestion_anterior is null
     and btrim(coalesce(g.canal, '')) = ''
     and lower(btrim(coalesce(l."Medio", ''))) in ('whatsapp', 'whatsapp nuevo');
  if v_pendientes = 0 then
    raise notice 'gestiones iniciales whatsapp ya clasificadas; nada que corregir';
    return;
  end if;
  update public.lead_gestiones g set canal = 'WhatsApp'
    from public.leads l
   where l.id = g.lead_id
     and g.gestion_anterior is null
     and btrim(coalesce(g.canal, '')) = ''
     and lower(btrim(coalesce(l."Medio", ''))) in ('whatsapp', 'whatsapp nuevo');
  select count(*) into v_rest
    from public.lead_gestiones g join public.leads l on l.id = g.lead_id
   where g.gestion_anterior is null
     and btrim(coalesce(g.canal, '')) = ''
     and lower(btrim(coalesce(l."Medio", ''))) in ('whatsapp', 'whatsapp nuevo');
  if v_rest <> 0 then raise exception 'whatsapp_canal_fix_incomplete rest=%', v_rest; end if;
end $fix$;

-- ---------------------------------------------------------------------------
-- 3. Diario: aditivo — bloque canales excluyente + total = gestionados.
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
comment on function public.daily_management_report(date, uuid) is
  'Diario aditivo: canales excluyentes con total = gestionados; whatsapp {nuevos, gestionados, total}; agendados por gestion vs por cita; resto del contrato intacto.';

commit;

-- Rollback manual (solo tras revision):
-- daily_management_report: restaurar la version de 202610090002_whatsapp_gestion_report.sql.
-- _create_lead_with_gestion: restaurar la version de 202610050001_fix_atomic_appointment_creation.sql.
-- La reconciliacion de canales no se deshace (datos historicos ya clasificados).

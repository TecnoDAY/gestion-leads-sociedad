-- Campañas por PERÍODOS de fechas + Reportes en lectura para el trafficker.
-- 1) Extensión btree_gist + tabla campaign_period_stats (Desde/Hasta por
--    campaña): períodos SIEMPRE dentro de un mismo mes civil; re-guardar el
--    mismo período exacto actualiza (unique); solapamientos prohibidos por
--    EXCLUDE (daterange &&) a nivel de base. Lectura para usuarios activos;
--    escrituras solo via RPC.
-- 2) upsert_campaign_period_stat: is_campaign_editor(); rango inválido, cruce
--    de mes o solape -> errores explícitos; editar fila ajena exige admin.
-- 3) delete_campaign_period_stat: solo admin (orden de guardas del original).
-- 4) reset_campaign_stat_auto: elimina la corrección mensual manual de una
--    campaña para volver a la suma automática de períodos (admin o creador).
-- 5) daily_management_report y management_period_summary: el trafficker pasa a
--    poder CONSULTAR los reportes agregados (sin PII); sigue sin poder escribir
--    en el CRM ni en las notas. Guard: is_active_user() and (is_crm_user() or
--    is_campaign_editor()).
-- 6) reporte_periodo_leads(): base del reporte período sin PII (id, Fecha,
--    Medio, Campaña, GESTION, archived_at); el resto de columnas de leads
--    sigue inaccesible para el trafficker.
-- No modifica campaign_stats ni sus RPC/RLS (histórico mensual intacto).
-- No amplía is_crm_user(): el trafficker sigue excluido del CRM de leads.
-- El coste/resultado NUNCA se guarda: se calcula en UI desde los totales
-- (gasto/resultados), igual que en campaign_stats; nunca se suman promedios.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extensión y tabla campaign_period_stats.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

create table if not exists public.campaign_period_stats (
  id bigint generated always as identity primary key,
  campaign_name text not null,
  desde date not null,
  hasta date not null,
  alcance int not null default 0 check (alcance >= 0),
  gasto numeric not null default 0 check (gasto >= 0),
  resultados int not null default 0 check (resultados >= 0),
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_period_stats_rango_valido check (desde <= hasta),
  constraint campaign_period_stats_rango_anios check (desde >= date '2024-01-01' and hasta <= date '2100-12-31'),
  constraint campaign_period_stats_un_mes check (date_trunc('month', desde) = date_trunc('month', hasta)),
  constraint campaign_period_stats_unique_period unique (campaign_name, desde, hasta)
);

-- Un rango [desde, hasta] por campaña no puede solaparse con otro (el índice
-- único cubre la re-lectura del mismo período exacto; el EXCLUDE impide el
-- solape parcial, incluso en inserciones concurrentes).
alter table public.campaign_period_stats
  add constraint campaign_period_stats_no_solape
  exclude using gist (campaign_name with =, daterange(desde, hasta, '[]') with &&);

create index if not exists campaign_period_stats_campaign_idx on public.campaign_period_stats (campaign_name);
create index if not exists campaign_period_stats_desde_idx on public.campaign_period_stats (desde);
create index if not exists campaign_period_stats_hasta_idx on public.campaign_period_stats (hasta);

alter table public.campaign_period_stats enable row level security;

-- Lectura para usuarios activos; escrituras solo via RPC (sin politica directa).
drop policy if exists "campaign_period_stats_read_active" on public.campaign_period_stats;
create policy "campaign_period_stats_read_active"
on public.campaign_period_stats for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.campaign_period_stats from anon, authenticated;
revoke select on public.campaign_period_stats from anon;
grant select on public.campaign_period_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 2. upsert_campaign_period_stat: misma política de roles y propiedad que
-- upsert_campaign_stat (is_campaign_editor(); fila ajena exige admin).
-- Sin ON CONFLICT: el EXCLUDE de solape no admite arbitraje, así que el mismo
-- período exacto se resuelve con select + update y el solape se detecta antes
-- con mensaje explícito; el EXCLUDE queda como última defensa (concurrencia).
-- ---------------------------------------------------------------------------
create or replace function public.upsert_campaign_period_stat(
  p_campaign_name text, p_desde date, p_hasta date,
  p_alcance int, p_gasto numeric, p_resultados int
)
returns public.campaign_period_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  period_row public.campaign_period_stats;
  stat_name text;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;

  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception using errcode = '22023', message = 'period_range_required';
  end if;
  if p_desde > p_hasta then
    raise exception using errcode = '22023', message = 'period_range_invalid';
  end if;
  if date_trunc('month', p_desde) <> date_trunc('month', p_hasta) then
    raise exception using errcode = '22023', message = 'period_month_required';
  end if;
  if coalesce(p_alcance, 0) < 0 or coalesce(p_gasto, 0) < 0 or coalesce(p_resultados, 0) < 0 then
    raise exception using errcode = '22023', message = 'negative_value_not_allowed';
  end if;

  -- Mismo período exacto: actualizar cifras (sin duplicar). Fila ajena: admin.
  select * into period_row
  from public.campaign_period_stats
  where campaign_name = stat_name and desde = p_desde and hasta = p_hasta;
  if period_row.id is not null then
    if access.role <> 'admin' and period_row.creado_por is distinct from access.user_id then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
    update public.campaign_period_stats
    set alcance = coalesce(p_alcance, 0),
        gasto = coalesce(p_gasto, 0),
        resultados = coalesce(p_resultados, 0),
        updated_at = now()
    where id = period_row.id
    returning * into period_row;
    return period_row;
  end if;

  -- Solape parcial con otro período de la misma campaña: rechazar con código propio.
  if exists (
    select 1 from public.campaign_period_stats
    where campaign_name = stat_name
      and daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]')
  ) then
    raise exception using errcode = '22023', message = 'period_overlap';
  end if;

  insert into public.campaign_period_stats (campaign_name, desde, hasta, alcance, gasto, resultados, creado_por)
  values (stat_name, p_desde, p_hasta,
          coalesce(p_alcance, 0), coalesce(p_gasto, 0), coalesce(p_resultados, 0), access.user_id)
  returning * into period_row;
  return period_row;
end;
$$;

revoke all on function public.upsert_campaign_period_stat(text, date, date, int, numeric, int) from public, anon;
grant execute on function public.upsert_campaign_period_stat(text, date, date, int, numeric, int) to authenticated;
comment on function public.upsert_campaign_period_stat(text, date, date, int, numeric, int) is
  'Admin/trafficker/supervisor (via is_campaign_editor()); períodos dentro de un mismo mes; mismo período exacto actualiza cifras; solape -> 22023 period_overlap; editar la fila de otro creador exige ser admin (42501 own_campaign_stat_required).';

-- ---------------------------------------------------------------------------
-- 3. delete_campaign_period_stat: solo admin, mismo orden de guardas que
-- delete_campaign_stat (admin primero, sin filtrar existencia).
-- ---------------------------------------------------------------------------
create or replace function public.delete_campaign_period_stat(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  delete from public.campaign_period_stats where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_period_stat_not_found';
  end if;
end;
$$;

revoke all on function public.delete_campaign_period_stat(bigint) from public, anon;
grant execute on function public.delete_campaign_period_stat(bigint) to authenticated;
comment on function public.delete_campaign_period_stat(bigint) is
  'Solo admin: elimina un período guardado de una campaña (Desde/Hasta).';

-- ---------------------------------------------------------------------------
-- 4. reset_campaign_stat_auto: "Volver al automático" del mes. Elimina la fila
-- manual mensual de campaign_stats para que el mes vuelva a ser la suma de
-- períodos. No toca los períodos. Admin o creador de la fila manual.
-- ---------------------------------------------------------------------------
create or replace function public.reset_campaign_stat_auto(p_campaign_name text, p_anio int, p_mes text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  stat_name text;
  stat public.campaign_stats;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;
  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  if p_mes is null or not (upper(btrim(p_mes)) = any (month_names)) then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;

  select * into stat from public.campaign_stats
  where campaign_name = stat_name and anio = p_anio and mes = upper(btrim(p_mes));
  if stat.id is null then
    return false; -- sin corrección manual: nada que reajustar
  end if;
  if access.role <> 'admin' and stat.creado_por is distinct from access.user_id then
    raise exception using errcode = '42501', message = 'own_campaign_stat_required';
  end if;
  delete from public.campaign_stats where id = stat.id;
  return true;
end;
$$;

revoke all on function public.reset_campaign_stat_auto(text, int, text) from public, anon;
grant execute on function public.reset_campaign_stat_auto(text, int, text) to authenticated;
comment on function public.reset_campaign_stat_auto(text, int, text) is
  'Admin o creador: elimina la corrección mensual manual de una campaña+mes para volver al cálculo automático (suma de períodos). No toca los períodos.';

-- ---------------------------------------------------------------------------
-- 5. Reportes en lectura para el trafficker: mismas definiciones vigentes
--    (202610100002 y 202610090001) cambiando SOLO el guard. La escritura del
--    CRM y de las notas sigue bloqueada (upsert/delete_daily_report_note y
--    el resto de RPCs conservan is_crm_user()).
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
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with
  booked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is null
  ),
  rebooked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is not null
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
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from rebooked a left join user_access creator on creator.user_id = a.worker_id
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name), '') from resolved a
      union all select ua.user_id, ua.nombre from user_access ua where ua.activo and ua.role in ('admin','agente','supervisor')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name), '') from booked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from rebooked a where a.worker_id is null
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
      (select count(*) from resolved a where a.advisor_user_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.status = 'REPROGRAMADA') as rescheduled,
      (select count(*) from rebooked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, '')))) as rebooked_today
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
  'Reporte diario (citas nuevas vs reprogramadas, resultados por fecha Miami); lectura CRM o editor de campanas (trafficker consulta, no escribe).';

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
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
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
  'Actividad del periodo (solo conteos agregados, sin PII); lectura CRM o editor de campanas (trafficker consulta, no escribe).';

-- ---------------------------------------------------------------------------
-- 6. reporte_periodo_leads: base del resumen de período SIN PII. Solo las
--    columnas que usa buildPeriodSummary + archived_at (el cliente filtra
--    archivados) + id (consolidateLeadsById lo exige).
-- ---------------------------------------------------------------------------
create or replace function public.reporte_periodo_leads()
returns table (id bigint, "Fecha" text, "Medio" text, "Campaña" text, "GESTION" text, archived_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l."Fecha", l."Medio", l."Campaña", l."GESTION", l.archived_at
  from public.leads l
  where public.is_active_user() and (public.is_crm_user() or public.is_campaign_editor())
$$;

revoke all on function public.reporte_periodo_leads() from public, anon;
grant execute on function public.reporte_periodo_leads() to authenticated;
comment on function public.reporte_periodo_leads() is
  'Base del reporte de periodo sin PII (Fecha/Medio/Campana/GESTION); lectura CRM o editor de campanas. Nunca exponer nombres ni telefonos.';

-- ---------------------------------------------------------------------------
-- Verificación sugerida (no ejecutada por esta migración):
--   con sesión de cada rol: trafficker puede leer campaign_period_stats y
--   ejecutar daily_management_report/management_period_summary/
--   reporte_periodo_leads; NO puede ejecutar upsert_daily_report_note,
--   delete_daily_report_note, create_lead ni leer leads directamente.
--   Editor no propietario de una fila: 42501 own_campaign_stat_required.
--   Período cruzando mes: 22023 period_month_required; solape: 22023
--   period_overlap (y 23P01 del EXCLUDE como defensa ante concurrencia).
-- ---------------------------------------------------------------------------

commit;

-- Rollback (manual, solo tras revision):
-- drop function if exists public.reporte_periodo_leads();
-- drop function if exists public.reset_campaign_stat_auto(text, int, text);
-- drop function if exists public.delete_campaign_period_stat(bigint);
-- drop function if exists public.upsert_campaign_period_stat(text, date, date, int, numeric, int);
-- drop table if exists public.campaign_period_stats;
-- drop extension if exists btree_gist; -- solo si ninguna otra tabla la usa
-- daily_management_report y management_period_summary: restaurar sus versiones
-- de 202610100002 y 202610090001 respectivamente.

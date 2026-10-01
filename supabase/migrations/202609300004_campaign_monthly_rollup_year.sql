-- T5: completar la atribucion mensual de leads con el anio de captacion.
-- RPC canonica: campaign_monthly_rollup (no campaign_crm_metrics en el repo).
-- Reutiliza Mes como mes de origen (odd/tasks/campanas.md) y las reglas de
-- parseFechaLead: d/m/aaaa, d-m-aaaa, d/m/aa y aaaa-mm-dd, calendario valido,
-- anios 2000..2100. created_at puede ser fecha de importacion, no captacion.
-- Sin Fecha valida no se inventa un anio: no suma leads_nuevos/inscritos.
-- Las citas siguen contando TODOS los estados, incluidas canceladas y
-- reprogramadas. Solo se distingue tambien el anio en agendados_previos;
-- con fecha desconocida se conserva la clasificacion anterior por Mes.
-- Incremental y local: no altera datos ni las migraciones anteriores.

begin;

create or replace function public.campaign_monthly_rollup(p_anio int, p_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  mes_idx int;
  month_name text;
  from_date date;
  result jsonb;
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  mes_idx := array_position(month_names, upper(btrim(coalesce(p_mes, ''))));
  if mes_idx is null then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  month_name := month_names[mes_idx];
  from_date := make_date(p_anio, mes_idx, 1);

  with lead_date_parts as (
    select l.id, l.archived_at, l."Mes", l."Campaña", l."GESTION",
           coalesce(
             regexp_match(btrim(coalesce(l."Fecha", '')), '^([0-9]{4})-([0-9]{2})-([0-9]{2})$'),
             regexp_match(btrim(coalesce(l."Fecha", '')), '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2}|[0-9]{4})$')
           ) as date_parts,
           btrim(coalesce(l."Fecha", '')) ~ '^[0-9]{4}-' as iso_date
    from public.leads l
  ),
  lead_date_numbers as (
    select l.*,
           case when iso_date then l.date_parts[1]::int
                when length(l.date_parts[3]) = 2 then 2000 + l.date_parts[3]::int
                else l.date_parts[3]::int end as capture_year,
           l.date_parts[2]::int as capture_month,
           case when iso_date then l.date_parts[3]::int else l.date_parts[1]::int end as capture_day
    from lead_date_parts l
  ),
  dated_leads as (
    select l.*,
           case when capture_year between 2000 and 2100
                     and capture_month between 1 and 12 and capture_day between 1 and 31
                then case when capture_day <= extract(day from (make_date(capture_year, capture_month, 1) + interval '1 month - 1 day'))
                          then make_date(capture_year, capture_month, capture_day) end
           end as capture_date
    from lead_date_numbers l
  ),
  base_campaigns as (
    -- Campanas con leads del periodo, citas del periodo o stats del periodo.
    select distinct campaign_name from (
      select btrim(l."Campaña") as campaign_name
      from dated_leads l
      where l.archived_at is null
        and btrim(coalesce(l."Campaña", '')) <> ''
        and upper(l."Mes") like '%' || month_name || '%'
        and extract(year from l.capture_date) = p_anio
      union
      select btrim(l."Campaña")
      from public.lead_appointments la
      join public.leads l on l.id = la.lead_id
      where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
        and btrim(coalesce(l."Campaña", '')) <> ''
      union
      select cs.campaign_name
      from public.campaign_stats cs
      where cs.anio = p_anio and cs.mes = month_name
    ) t
  ),
  lead_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as leads_nuevos,
           count(*) filter (where l."GESTION" ilike '%INSCRIT%') as inscritos
    from dated_leads l
    where l.archived_at is null
      and btrim(coalesce(l."Campaña", '')) <> ''
      and upper(l."Mes") like '%' || month_name || '%'
      and extract(year from l.capture_date) = p_anio
    group by btrim(l."Campaña")
  ),
  appt_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as agendados,
           count(*) filter (where la.status = 'ASISTIO') as asistieron,
           count(*) filter (where la.status = 'PROGRAMADA') as pendientes,
           count(*) filter (where upper(coalesce(l."Mes", '')) not like '%' || month_name || '%'
                            or extract(year from l.capture_date) <> p_anio) as agendados_previos
    from public.lead_appointments la
    join dated_leads l on l.id = la.lead_id
    where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
      and btrim(coalesce(l."Campaña", '')) <> ''
    group by btrim(l."Campaña")
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign_name', bc.campaign_name,
    'leads_nuevos', coalesce(lc.leads_nuevos, 0),
    'agendados', coalesce(ac.agendados, 0),
    'asistieron', coalesce(ac.asistieron, 0),
    'inscritos', coalesce(lc.inscritos, 0),
    'agendados_previos', coalesce(ac.agendados_previos, 0),
    'pendientes', coalesce(ac.pendientes, 0)
  ) order by lower(bc.campaign_name)), '[]'::jsonb)
  into result
  from base_campaigns bc
  left join lead_counts lc on lc.campaign_name = bc.campaign_name
  left join appt_counts ac on ac.campaign_name = bc.campaign_name;

  return result;
end;
$$;

revoke all on function public.campaign_monthly_rollup(int, text) from public;
revoke all on function public.campaign_monthly_rollup(int, text) from anon;
grant execute on function public.campaign_monthly_rollup(int, text) to authenticated;
comment on function public.campaign_monthly_rollup(int, text) is 'Conteos agregados del CRM por campana y periodo: Mes y anio de Fecha valida para leads; scheduled_at para citas, todos sus estados; cualquier usuario activo, sin lectura directa de leads.';

commit;

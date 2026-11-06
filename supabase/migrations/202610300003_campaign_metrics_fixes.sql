-- Correcciones a campaign_metrics_history:
-- 1) Excluir registros originales que ya tienen corrección (evita doble conteo).
-- 2) estimated solo cuando hubo prorrateo real.
-- 3) Evitar solapamiento de rangos en insert (validación en RPC).

begin;

-- ---------------------------------------------------------------------------
-- 1. Reemplazar aggregate_campaign_metrics con lógica de vigencia.
-- ---------------------------------------------------------------------------
create or replace function public.aggregate_campaign_metrics(
  p_campaign_name text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cname text;
  total_spend numeric := 0;
  total_leads int := 0;
  total_alcance int := 0;
  estimated boolean := false;
  rec record;
  block_days int;
  overlap_days int;
  ratio numeric;
  -- conjunto de originales que tienen al menos una corrección
  corrected_origins uuid[];
begin
  if not public.is_active_user() then raise exception using errcode='42501', message='active_user_required'; end if;
  cname := btrim(coalesce(p_campaign_name, ''));
  if cname = '' then raise exception using errcode='22023', message='campaign_name_required'; end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;

  select array_agg(distinct original_id) into corrected_origins
  from public.campaign_metrics_history
  where campaign_name = cname and is_correction = true and original_id is not null;

  for rec in
    select start_date, end_date, spend, meta_leads, alcance, id, is_correction, original_id, created_at
    from public.campaign_metrics_history
    where campaign_name = cname
      and start_date <= p_to and end_date >= p_from
    order by created_at asc
  loop
    -- Si es un original que tiene corrección, saltarlo (la corrección lo reemplaza).
    if (not rec.is_correction) and (corrected_origins is not null) and (rec.id = any(corrected_origins)) then
      continue;
    end if;
    -- Si es corrección, usar solo la última por original.
    if rec.is_correction then
      if exists (
        select 1 from public.campaign_metrics_history c
        where c.original_id = rec.original_id
          and c.is_correction = true
          and c.created_at > rec.created_at
      ) then
        continue;
      end if;
    end if;

    block_days := (rec.end_date - rec.start_date) + 1;
    overlap_days := (least(rec.end_date, p_to) - greatest(rec.start_date, p_from)) + 1;
    if overlap_days < 0 then overlap_days := 0; end if;
    if overlap_days = 0 then continue; end if;

    if rec.start_date = p_from and rec.end_date = p_to then
      total_spend := total_spend + rec.spend;
      total_leads := total_leads + rec.meta_leads;
      total_alcance := total_alcance + rec.alcance;
    else
      estimated := true;
      ratio := overlap_days::numeric / block_days::numeric;
      total_spend := total_spend + round(rec.spend * ratio, 2);
      total_leads := total_leads + round(rec.meta_leads * ratio)::int;
      total_alcance := total_alcance + round(rec.alcance * ratio)::int;
    end if;
  end loop;

  return jsonb_build_object(
    'campaign_name', cname,
    'from', p_from,
    'to', p_to,
    'spend', total_spend,
    'meta_leads', total_leads,
    'alcance', total_alcance,
    'cost_per_lead', case when total_leads > 0 then round(total_spend / total_leads, 4) else 0 end,
    'estimated', estimated
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Evitar solapamiento en insert_campaign_metric.
-- ---------------------------------------------------------------------------
create or replace function public.insert_campaign_metric(
  p_campaign_name text,
  p_start_date date,
  p_end_date date,
  p_spend numeric,
  p_meta_leads int,
  p_alcance int default 0,
  p_currency text default 'USD'
)
returns public.campaign_metrics_history
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  rec public.campaign_metrics_history;
  cname text;
  overlap_count int;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role not in ('admin', 'trafficker', 'supervisor') then
    raise exception using errcode='42501', message='campaign_editor_required';
  end if;
  cname := btrim(coalesce(p_campaign_name, ''));
  if cname = '' then raise exception using errcode='22023', message='campaign_name_required'; end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  if coalesce(p_spend, 0) < 0 or coalesce(p_meta_leads, 0) < 0 or coalesce(p_alcance, 0) < 0 then
    raise exception using errcode='22023', message='negative_value_not_allowed';
  end if;

  -- Evitar solapamiento con registros existentes (no correcciones)
  select count(*) into overlap_count
  from public.campaign_metrics_history
  where campaign_name = cname
    and is_correction = false
    and start_date <= p_end_date and end_date >= p_start_date;
  if overlap_count > 0 then
    raise exception using errcode='23505', message='overlapping_date_range';
  end if;

  insert into public.campaign_metrics_history
    (campaign_name, start_date, end_date, spend, meta_leads, alcance, currency, created_by)
  values (cname, p_start_date, p_end_date, coalesce(p_spend,0), coalesce(p_meta_leads,0),
          coalesce(p_alcance,0), coalesce(nullif(btrim(p_currency),''),'USD'), access.user_id)
  returning * into rec;
  return rec;
end;
$$;

commit;

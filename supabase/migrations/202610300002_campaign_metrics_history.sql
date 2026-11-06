-- Rediseño Campañas: métricas por rango de fecha con historial auditable (append-only).
-- ADITIVA: no toca campaign_stats ni el rollup existente. Convivencia temporal.
-- Aplicar con: supabase db push (o pegar en SQL editor).

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabla principal: un registro por carga del trafficker (append-only).
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_metrics_history (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  start_date date not null,
  end_date date not null,
  spend numeric(12,2) not null default 0 check (spend >= 0),
  meta_leads int not null default 0 check (meta_leads >= 0),
  alcance int not null default 0 check (alcance >= 0),
  currency text not null default 'USD',
  cost_per_lead numeric(12,4) generated always as (
    case when meta_leads > 0 then round(spend / meta_leads, 4) else 0 end
  ) stored,
  -- Auditoría
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Corrección: si es una corrección, apunta al original y guarda motivo
  is_correction boolean not null default false,
  original_id uuid references public.campaign_metrics_history(id) on delete set null,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  constraint campaign_metrics_history_date_order check (start_date <= end_date),
  constraint campaign_metrics_history_correction_requires_original check (
    (is_correction = false and original_id is null and correction_reason is null)
    or (is_correction = true and original_id is not null and correction_reason is not null and btrim(correction_reason) <> '')
  )
);

create index if not exists campaign_metrics_history_campaign_idx
  on public.campaign_metrics_history (campaign_name, start_date, end_date);

create index if not exists campaign_metrics_history_created_idx
  on public.campaign_metrics_history (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS: lectura para usuarios activos; escritura solo via RPC.
-- ---------------------------------------------------------------------------
alter table public.campaign_metrics_history enable row level security;

drop policy if exists "campaign_metrics_history_read_active" on public.campaign_metrics_history;
create policy "campaign_metrics_history_read_active"
on public.campaign_metrics_history for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.campaign_metrics_history from anon, authenticated;
revoke select on public.campaign_metrics_history from anon;
grant select on public.campaign_metrics_history to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC: insertar carga del trafficker (append-only).
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

  insert into public.campaign_metrics_history
    (campaign_name, start_date, end_date, spend, meta_leads, alcance, currency, created_by)
  values (cname, p_start_date, p_end_date, coalesce(p_spend,0), coalesce(p_meta_leads,0),
          coalesce(p_alcance,0), coalesce(nullif(btrim(p_currency),''),'USD'), access.user_id)
  returning * into rec;
  return rec;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: corrección (crea nuevo registro, no edita el original).
-- ---------------------------------------------------------------------------
create or replace function public.correct_campaign_metric(
  p_original_id uuid,
  p_start_date date,
  p_end_date date,
  p_spend numeric,
  p_meta_leads int,
  p_alcance int default 0,
  p_reason text default null
)
returns public.campaign_metrics_history
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  orig public.campaign_metrics_history;
  rec public.campaign_metrics_history;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role not in ('admin', 'trafficker', 'supervisor') then
    raise exception using errcode='42501', message='campaign_editor_required';
  end if;
  select * into orig from public.campaign_metrics_history where id = p_original_id;
  if orig.id is null then raise exception using errcode='P0002', message='original_metric_not_found'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode='22023', message='correction_reason_required';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  if coalesce(p_spend,0) < 0 or coalesce(p_meta_leads,0) < 0 or coalesce(p_alcance,0) < 0 then
    raise exception using errcode='22023', message='negative_value_not_allowed';
  end if;

  insert into public.campaign_metrics_history
    (campaign_name, start_date, end_date, spend, meta_leads, alcance, currency,
     created_by, is_correction, original_id, correction_reason, corrected_by, corrected_at)
  values (orig.campaign_name, p_start_date, p_end_date, coalesce(p_spend,0), coalesce(p_meta_leads,0),
          coalesce(p_alcance,0), orig.currency, access.user_id, true, p_original_id,
          btrim(p_reason), access.user_id, now())
  returning * into rec;
  return rec;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: agregación por rango (con prorrateo por días para sub-rangos).
-- Devuelve totales + flag estimated si algún bloque fue parcial.
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
begin
  if not public.is_active_user() then raise exception using errcode='42501', message='active_user_required'; end if;
  cname := btrim(coalesce(p_campaign_name, ''));
  if cname = '' then raise exception using errcode='22023', message='campaign_name_required'; end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;

  for rec in
    select start_date, end_date, spend, meta_leads, alcance
    from public.campaign_metrics_history
    where campaign_name = cname
      and start_date <= p_to and end_date >= p_from
  loop
    -- días del bloque cargado
    block_days := (rec.end_date - rec.start_date) + 1;
    -- días de solapamiento con el rango solicitado
    overlap_days := (least(rec.end_date, p_to) - greatest(rec.start_date, p_from)) + 1;
    if overlap_days < 0 then overlap_days := 0; end if;

    if overlap_days = 0 then
      continue;
    end if;

    -- Si el bloque coincide exactamente con el rango, no es estimación
    if rec.start_date = p_from and rec.end_date = p_to then
      total_spend := total_spend + rec.spend;
      total_leads := total_leads + rec.meta_leads;
      total_alcance := total_alcance + rec.alcance;
    else
      -- prorrateo por días
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
-- 6. RPC: listar historial por campaña (para el panel inferior).
-- ---------------------------------------------------------------------------
create or replace function public.list_campaign_metrics(p_campaign_name text)
returns setof public.campaign_metrics_history
language sql
stable
security definer
set search_path = public
as $$
  select * from public.campaign_metrics_history
  where campaign_name = btrim(coalesce(p_campaign_name, ''))
  order by start_date desc, created_at desc;
$$;

-- Grants
revoke all on function public.insert_campaign_metric(text,date,date,numeric,int,int,text) from public;
revoke all on function public.correct_campaign_metric(uuid,date,date,numeric,int,int,text) from public;
revoke all on function public.aggregate_campaign_metrics(text,date,date) from public;
revoke all on function public.list_campaign_metrics(text) from public;
grant execute on function public.insert_campaign_metric(text,date,date,numeric,int,int,text) to authenticated;
grant execute on function public.correct_campaign_metric(uuid,date,date,numeric,int,int,text) to authenticated;
grant execute on function public.aggregate_campaign_metrics(text,date,date) to authenticated;
grant execute on function public.list_campaign_metrics(text) to authenticated;

commit;

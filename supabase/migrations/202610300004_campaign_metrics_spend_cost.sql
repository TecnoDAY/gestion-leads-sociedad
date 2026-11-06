-- Pending additive migration; historical campaign_stats/period rows are untouched.
-- Live inputs begin November 1, 2026. October demo data stays browser-local.
begin;

create table if not exists public.campaign_metrics_history_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  start_date date not null,
  end_date date not null,
  alcance int not null default 0 check (alcance >= 0),
  spend numeric not null check (spend >= 0 and spend::text not in ('NaN','Infinity','-Infinity')),
  cost_per_result numeric not null check (cost_per_result >= 0 and cost_per_result::text not in ('NaN','Infinity','-Infinity')),
  derived_results numeric generated always as (
    case when cost_per_result > 0 then spend / cost_per_result else 0 end
  ) stored,
  reported_meta_leads int,
  currency text not null default 'USD',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  is_correction boolean not null default false,
  original_id uuid references public.campaign_metrics_history_v2(id) on delete set null,
  revision int not null default 1 check (revision > 0),
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  constraint v2_date_order check (isfinite(start_date) and isfinite(end_date) and start_date <= end_date and start_date >= date '2026-11-01'),
  constraint v2_positive_spend_requires_cost check (spend = 0 or cost_per_result > 0),
  constraint v2_correction_requires_original check (
    (is_correction = false and original_id is null and correction_reason is null)
    or (is_correction = true and original_id is not null and correction_reason is not null and btrim(correction_reason) <> '')
  ),
  constraint v2_reported_leads_nonnegative check (reported_meta_leads is null or reported_meta_leads >= 0)
);
create index if not exists v2_campaign_range_idx
  on public.campaign_metrics_history_v2 (campaign_name, start_date, end_date);
create unique index if not exists v2_root_revision_idx
  on public.campaign_metrics_history_v2 ((coalesce(original_id,id)), revision);

alter table public.campaign_metrics_history_v2 enable row level security;
drop policy if exists "v2_read_active" on public.campaign_metrics_history_v2;
create policy "v2_read_active"
on public.campaign_metrics_history_v2 for select to authenticated
using (public.is_active_user());
revoke insert, update, delete on public.campaign_metrics_history_v2 from anon, authenticated;
revoke select on public.campaign_metrics_history_v2 from anon;
grant select on public.campaign_metrics_history_v2 to authenticated;

-- Owner-only implementation detail: never grant callers a guard-free reader.
-- Revision, not now(), orders corrections within the same transaction.
create or replace function public.current_campaign_metrics_v2(p_campaign_name text)
returns setof public.campaign_metrics_history_v2
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct on (coalesce(h.original_id,h.id)) h.*
  from public.campaign_metrics_history_v2 h
  where h.campaign_name = p_campaign_name
  order by coalesce(h.original_id,h.id), h.revision desc;
$$;
revoke all on function public.current_campaign_metrics_v2(text) from public, anon, authenticated, service_role;

create or replace function public.insert_campaign_metric_v2(
  p_campaign_name text, p_start_date date, p_end_date date, p_alcance int,
  p_spend numeric, p_cost_per_result numeric,
  p_reported_meta_leads int default null, p_currency text default 'USD'
)
returns public.campaign_metrics_history_v2
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  access public.user_access;
  rec public.campaign_metrics_history_v2;
  cname text;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role not in ('admin','trafficker','supervisor') then
    raise exception using errcode='42501', message='campaign_editor_required';
  end if;
  cname := btrim(coalesce(p_campaign_name,''));
  if cname = '' then raise exception using errcode='22023', message='campaign_name_required'; end if;
  if p_start_date is null or p_end_date is null or not isfinite(p_start_date) or not isfinite(p_end_date) or p_start_date > p_end_date then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  if p_start_date < date '2026-11-01' then
    raise exception using errcode='22023', message='metrics_start_2026_11_01';
  end if;
  if p_spend is null or p_cost_per_result is null or p_spend::text in ('NaN','Infinity','-Infinity') or p_cost_per_result::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023', message='invalid_metric_value';
  end if;
  if coalesce(p_alcance,0) < 0 or p_spend < 0 or p_cost_per_result < 0 or coalesce(p_reported_meta_leads,0) < 0 then
    raise exception using errcode='22023', message='negative_value_not_allowed';
  end if;
  if p_cost_per_result = 0 and p_spend > 0 then
    raise exception using errcode='22023', message='cost_required_for_positive_spend';
  end if;

  -- Both write RPCs lock the same campaign before reading current versions.
  perform pg_advisory_xact_lock(hashtext(cname));
  if exists (select 1 from public.current_campaign_metrics_v2(cname)
    where start_date <= p_end_date and end_date >= p_start_date) then
    raise exception using errcode='23505', message='overlapping_date_range';
  end if;
  insert into public.campaign_metrics_history_v2
    (campaign_name,start_date,end_date,alcance,spend,cost_per_result,reported_meta_leads,currency,created_by)
  values (cname,p_start_date,p_end_date,coalesce(p_alcance,0),p_spend,p_cost_per_result,
    p_reported_meta_leads,coalesce(nullif(btrim(p_currency),''),'USD'),access.user_id)
  returning * into rec;
  return rec;
end;
$$;

create or replace function public.correct_campaign_metric_v2(
  p_original_id uuid, p_start_date date, p_end_date date, p_alcance int,
  p_spend numeric, p_cost_per_result numeric,
  p_reported_meta_leads int default null, p_reason text default null
)
returns public.campaign_metrics_history_v2
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  access public.user_access;
  orig public.campaign_metrics_history_v2;
  rec public.campaign_metrics_history_v2;
  root_id uuid;
  next_revision int;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role not in ('admin','trafficker','supervisor') then
    raise exception using errcode='42501', message='campaign_editor_required';
  end if;
  select * into orig from public.campaign_metrics_history_v2 where id = p_original_id;
  if orig.id is null then raise exception using errcode='P0002', message='original_metric_not_found'; end if;
  root_id := coalesce(orig.original_id,orig.id);
  select * into orig from public.campaign_metrics_history_v2 where id = root_id and not is_correction;
  if orig.id is null then raise exception using errcode='P0002', message='original_metric_not_found'; end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode='22023', message='correction_reason_required';
  end if;
  if p_start_date is null or p_end_date is null or not isfinite(p_start_date) or not isfinite(p_end_date) or p_start_date > p_end_date then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  if p_start_date < date '2026-11-01' then
    raise exception using errcode='22023', message='metrics_start_2026_11_01';
  end if;
  if p_spend is null or p_cost_per_result is null or p_spend::text in ('NaN','Infinity','-Infinity') or p_cost_per_result::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023', message='invalid_metric_value';
  end if;
  if coalesce(p_alcance,0) < 0 or p_spend < 0 or p_cost_per_result < 0 or coalesce(p_reported_meta_leads,0) < 0 then
    raise exception using errcode='22023', message='negative_value_not_allowed';
  end if;
  if p_cost_per_result = 0 and p_spend > 0 then
    raise exception using errcode='22023', message='cost_required_for_positive_spend';
  end if;

  perform pg_advisory_xact_lock(hashtext(orig.campaign_name));
  if exists (select 1 from public.current_campaign_metrics_v2(orig.campaign_name)
    where coalesce(original_id,id) <> root_id
      and start_date <= p_end_date and end_date >= p_start_date) then
    raise exception using errcode='23505', message='overlapping_date_range';
  end if;
  select revision + 1 into next_revision from public.current_campaign_metrics_v2(orig.campaign_name)
  where coalesce(original_id,id) = root_id;
  insert into public.campaign_metrics_history_v2
    (campaign_name,start_date,end_date,alcance,spend,cost_per_result,reported_meta_leads,
     currency,created_by,is_correction,original_id,revision,correction_reason,corrected_by,corrected_at)
  values (orig.campaign_name,p_start_date,p_end_date,coalesce(p_alcance,0),p_spend,p_cost_per_result,
    p_reported_meta_leads,orig.currency,access.user_id,true,root_id,next_revision,btrim(p_reason),access.user_id,now())
  returning * into rec;
  return rec;
end;
$$;

create or replace function public.aggregate_campaign_metrics_v2(p_campaign_name text,p_from date,p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  cname text;
  total_spend numeric := 0;
  total_results numeric := 0;
  total_alcance numeric := 0;
  total_reported numeric := 0;
  has_reported boolean := false;
  missing_reported boolean := false;
  estimated boolean := false;
  metric_count int := 0;
  rec public.campaign_metrics_history_v2;
  block_days int;
  overlap_days int;
  ratio numeric;
begin
  if not public.is_active_user() then raise exception using errcode='42501', message='active_user_required'; end if;
  cname := btrim(coalesce(p_campaign_name,''));
  if cname = '' then raise exception using errcode='22023', message='campaign_name_required'; end if;
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from > p_to then
    raise exception using errcode='22023', message='invalid_date_range';
  end if;
  -- Select current versions BEFORE filtering dates: old ranges never revive.
  for rec in select * from public.current_campaign_metrics_v2(cname)
    where start_date <= p_to and end_date >= p_from
  loop
    block_days := (rec.end_date - rec.start_date) + 1;
    overlap_days := (least(rec.end_date,p_to) - greatest(rec.start_date,p_from)) + 1;
    ratio := overlap_days::numeric / block_days;
    estimated := estimated or overlap_days < block_days;
    metric_count := metric_count + 1;
    total_spend := total_spend + rec.spend * ratio;
    total_results := total_results + rec.derived_results * ratio;
    total_alcance := total_alcance + round(rec.alcance * ratio);
    if rec.reported_meta_leads is null then
      missing_reported := true;
    else
      has_reported := true;
      total_reported := total_reported + round(rec.reported_meta_leads * ratio);
    end if;
  end loop;
  return jsonb_build_object(
    'campaign_name',cname,'from',p_from,'to',p_to,
    'spend',total_spend,'derived_results',total_results,'alcance',total_alcance,
    'cost_per_result',case when total_results > 0 then total_spend / total_results else 0 end,
    'reported_meta_leads',case when has_reported and not missing_reported then total_reported else null end,
    'estimated',estimated,'count',metric_count
  );
end;
$$;

create or replace function public.list_campaign_metrics_v2(p_campaign_name text)
returns setof public.campaign_metrics_history_v2
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_active_user() then raise exception using errcode='42501', message='active_user_required'; end if;
  return query select * from public.campaign_metrics_history_v2
    where campaign_name = btrim(coalesce(p_campaign_name,''))
    order by start_date desc,created_at desc,revision desc,id;
end;
$$;

revoke all on function public.insert_campaign_metric_v2(text,date,date,int,numeric,numeric,int,text) from public, anon;
revoke all on function public.correct_campaign_metric_v2(uuid,date,date,int,numeric,numeric,int,text) from public, anon;
revoke all on function public.aggregate_campaign_metrics_v2(text,date,date) from public, anon;
revoke all on function public.list_campaign_metrics_v2(text) from public, anon;
grant execute on function public.insert_campaign_metric_v2(text,date,date,int,numeric,numeric,int,text) to authenticated;
grant execute on function public.correct_campaign_metric_v2(uuid,date,date,int,numeric,numeric,int,text) to authenticated;
grant execute on function public.aggregate_campaign_metrics_v2(text,date,date) to authenticated;
grant execute on function public.list_campaign_metrics_v2(text) to authenticated;
commit;

-- Legacy v1 list_campaign_metrics is SECURITY DEFINER and bypassed the
-- active-user RLS of campaign_metrics_history. Add the same guard the rest of
-- the v1 module uses (aggregate_campaign_metrics). Signature, result and grants
-- are unchanged, so active users see exactly the same rows.
begin;

create or replace function public.list_campaign_metrics(p_campaign_name text)
returns setof public.campaign_metrics_history
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  return query
    select * from public.campaign_metrics_history
    where campaign_name = btrim(coalesce(p_campaign_name, ''))
    order by start_date desc, created_at desc;
end;
$$;

revoke all on function public.list_campaign_metrics(text) from public, anon;
grant execute on function public.list_campaign_metrics(text) to authenticated;

commit;

-- Rollback (manual): re-run section 6 of 202610300002_campaign_metrics_history.sql.

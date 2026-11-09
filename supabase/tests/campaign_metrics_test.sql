-- Legacy v1 regression coverage, isolated LOCAL PostgreSQL only.
-- Run scripts/test-campaign-postgres.sh, never the production SQL editor.
\set ON_ERROR_STOP on
\if :{?isolated_local}
\if :isolated_local
\else
DO $$ BEGIN RAISE EXCEPTION 'isolated_local=1 required'; END $$;
\endif
\else
DO $$ BEGIN RAISE EXCEPTION 'isolated_local=1 required'; END $$;
\endif
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000009','legacy@local.invalid');
insert into public.user_access(user_id,email,nombre,role,activo)
values('00000000-0000-4000-8000-000000000009','legacy@local.invalid','LOCAL_LEGACY','trafficker',true);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000009';
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated"}';
set local role authenticated;
do $$
declare j jsonb; a public.campaign_metrics_history; snapshot jsonb;
begin
  select * into a from public.insert_campaign_metric('LOCAL_LEGACY','2026-10-01','2026-10-07',700,70,1000);
  perform public.insert_campaign_metric('LOCAL_LEGACY','2026-10-08','2026-10-14',350,35,500);
  j:=public.aggregate_campaign_metrics('LOCAL_LEGACY','2026-10-01','2026-10-07');
  if (j->>'spend')::numeric<>700 or (j->>'meta_leads')::int<>70 or (j->>'estimated')::boolean then
    raise exception 'Legacy exact aggregate changed: %',j;
  end if;
  j:=public.aggregate_campaign_metrics('LOCAL_LEGACY','2026-10-02','2026-10-05');
  if (j->>'spend')::numeric<>400 or (j->>'meta_leads')::int<>40 or not (j->>'estimated')::boolean then
    raise exception 'Legacy proration changed: %',j;
  end if;
  select jsonb_agg(to_jsonb(m) order by m.id) into snapshot from public.list_campaign_metrics('LOCAL_LEGACY') m;
  begin
    perform public.insert_campaign_metric('LOCAL_LEGACY','2026-10-15','2026-10-21',-1,1,0);
    raise exception 'Legacy negative input accepted';
  exception when sqlstate '22023' then
    if sqlerrm<>'negative_value_not_allowed' then raise; end if;
  end;
  if snapshot is distinct from (select jsonb_agg(to_jsonb(m) order by m.id) from public.list_campaign_metrics('LOCAL_LEGACY') m) then
    raise exception 'Rejected legacy write mutated history';
  end if;
  perform public.correct_campaign_metric(a.id,'2026-10-01','2026-10-07',720,72,1000,'Local regression');
  j:=public.aggregate_campaign_metrics('LOCAL_LEGACY','2026-10-01','2026-10-31');
  if (j->>'spend')::numeric<>1070 or (j->>'meta_leads')::int<>107 then
    raise exception 'Legacy correction/aggregate changed: %',j;
  end if;
end $$;
rollback;
\echo 'PASS: legacy v1 RPC regression assertions; transaction rolled back.'

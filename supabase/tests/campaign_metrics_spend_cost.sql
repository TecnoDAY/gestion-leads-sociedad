\set ON_ERROR_STOP on
-- Only a disposable LOCAL database; run through scripts/test-campaign-postgres.sh.
\if :{?isolated_local}
\if :isolated_local
\else
DO $ BEGIN RAISE EXCEPTION 'isolated_local=1 required'; END $;
\endif
\else
DO $ BEGIN RAISE EXCEPTION 'isolated_local=1 required'; END $;
\endif
begin;
-- Fixture identities only; no production records or actual JWT service.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-000000000001','editor@local.invalid'),
('00000000-0000-4000-8000-000000000002','reader@local.invalid'),
('00000000-0000-4000-8000-000000000003','inactive@local.invalid');
insert into public.user_access(user_id,email,nombre,role,activo) values
('00000000-0000-4000-8000-000000000001','editor@local.invalid','LOCAL_EDITOR','trafficker',true),
('00000000-0000-4000-8000-000000000002','reader@local.invalid','LOCAL_READER','agente',true),
('00000000-0000-4000-8000-000000000003','inactive@local.invalid','LOCAL_INACTIVE','admin',false);
create temporary table validation_results(name text,passed boolean,evidence text);
grant select,insert on validation_results to authenticated;
create function pg_temp.record_check(label text,ok boolean,details text) returns void language sql as $$
 insert into validation_results values(label,coalesce(ok,false),details)
$$;
create function pg_temp.rejects(statement text,expected text) returns boolean language plpgsql as $$
declare before_rows jsonb; after_rows jsonb;
begin
 if public.is_active_user() then before_rows:=public.list_campaign_metrics_with_authors_v2(null); end if;
 begin execute statement;
 exception when others then
  if public.is_active_user() then after_rows:=public.list_campaign_metrics_with_authors_v2(null); end if;
  return (expected is null or sqlerrm=expected) and before_rows is not distinct from after_rows;
 end;
 return false;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare a public.campaign_metrics_history_v2; b public.campaign_metrics_history_v2; j jsonb; denied boolean; bad record;
begin
 select * into a from public.insert_campaign_metric_v2('LOCAL_SUM', '2026-11-01','2026-11-07',0,100,3,30);
 perform public.insert_campaign_metric_v2('LOCAL_SUM','2026-11-08','2026-11-14',0,200,12,null);
 j:=public.aggregate_campaign_metrics_v2('LOCAL_SUM','2026-11-01','2026-11-30');
 perform pg_temp.record_check('monthly spend and derived results', (j->>'spend')::numeric=300 and (j->>'derived_results')::numeric=50,j::text);
 perform pg_temp.record_check('missing optional Meta totals stay unavailable',j->>'reported_meta_leads' is null,j::text);
 perform pg_temp.record_check('fully contained weeks are not prorated', (j->>'estimated')::boolean=false,j::text);
 j:=public.aggregate_campaign_metrics_v2('LOCAL_SUM','2026-11-01','2026-11-02');
 perform pg_temp.record_check('partial range is marked estimated',(j->>'estimated')::boolean,j::text);
 perform pg_temp.record_check('derived result precision',a.derived_results=(100::numeric/3),'stored='||a.derived_results||'; expected='||(100::numeric/3));
 for bad in select * from (values
   ('NULL','3','invalid_metric_value'),('100','NULL','invalid_metric_value'),
   ('NaN','3','invalid_metric_value'),('100','NaN','invalid_metric_value'),
   ('Infinity','3','invalid_metric_value'),('100','Infinity','invalid_metric_value'),
   ('-Infinity','3','invalid_metric_value'),('100','-Infinity','invalid_metric_value'),
   ('-1','3','negative_value_not_allowed'),('100','-1','negative_value_not_allowed'),
   ('100','0','cost_required_for_positive_spend')
 ) v(spend,cost,message) loop
   perform pg_temp.record_check('insert numeric boundary '||bad.spend||'/'||bad.cost,
     pg_temp.rejects(format('select public.insert_campaign_metric_v2(''LOCAL_INVALID'',''2026-11-15'',''2026-11-21'',0,%s,%s)',
       case when bad.spend='NULL' then 'NULL' else quote_literal(bad.spend) end,
       case when bad.cost='NULL' then 'NULL' else quote_literal(bad.cost) end),bad.message),'exact error and unchanged public history');
   perform pg_temp.record_check('correction numeric boundary '||bad.spend||'/'||bad.cost,
     pg_temp.rejects(format('select public.correct_campaign_metric_v2(%L,''2026-11-01'',''2026-11-07'',0,%s,%s,null,''Invalid'')',a.id,
       case when bad.spend='NULL' then 'NULL' else quote_literal(bad.spend) end,
       case when bad.cost='NULL' then 'NULL' else quote_literal(bad.cost) end),bad.message),'exact error and unchanged public history');
 end loop;
 perform pg_temp.record_check('private current reader is not exposed',
   not has_function_privilege('authenticated','public.current_campaign_metrics_v2(text)','execute')
   and not has_function_privilege('anon','public.current_campaign_metrics_v2(text)','execute')
   and not has_function_privilege('service_role','public.current_campaign_metrics_v2(text)','execute'),'owner-only helper ACL');
 perform pg_temp.record_check('November start boundary',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_OCT','2026-10-01','2026-10-07',0,100,3)$q$,null),'RPC must reject pre-November production dates');
 perform pg_temp.record_check('reject NaN spend',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_NAN','2026-11-01','2026-11-07',0,'NaN',3)$q$,null),'invalid numeric must reject');
 perform pg_temp.record_check('reject null cost with positive spend',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_NULL_COST','2026-11-01','2026-11-07',0,100,null)$q$,null),'null cost must reject');
 perform pg_temp.record_check('reject negative spend',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_NEG','2026-11-01','2026-11-07',0,-1,3)$q$,'negative_value_not_allowed'),'negative_value_not_allowed');
 perform pg_temp.record_check('reject reverse dates',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_REVERSE','2026-11-07','2026-11-01',0,100,3)$q$,'invalid_date_range'),'invalid_date_range');
 perform pg_temp.record_check('reject zero cost with positive spend',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_ZERO','2026-11-01','2026-11-07',0,100,0)$q$,'cost_required_for_positive_spend'),'cost_required_for_positive_spend');
 select * into a from public.insert_campaign_metric_v2('LOCAL_CORRECTIONS','2026-11-01','2026-11-07',0,100,10);
 select * into b from public.correct_campaign_metric_v2(a.id,'2026-11-01','2026-11-07',0,60,6,null,'First correction');
 select * into b from public.correct_campaign_metric_v2(b.id,'2026-11-01','2026-11-07',0,90,6,null,'Second correction');
 j:=public.aggregate_campaign_metrics_v2('LOCAL_CORRECTIONS','2026-11-01','2026-11-30');
 perform pg_temp.record_check('repeated corrections count only latest',(j->>'spend')::numeric=90 and (j->>'derived_results')::numeric=15,j::text);
 perform pg_temp.record_check('correction root normalized',b.original_id=a.id,'root='||a.id||'; second original='||b.original_id);
 select * into b from public.correct_campaign_metric_v2(a.id,'2026-11-15','2026-11-21',0,120,6,null,'Correct old root');
 j:=public.aggregate_campaign_metrics_v2('LOCAL_CORRECTIONS','2026-11-01','2026-11-30');
 perform pg_temp.record_check('same-clock old-root correction advances latest revision',
   to_jsonb(b)->>'revision'='4' and (j->>'spend')::numeric=120 and (j->>'derived_results')::numeric=20,j::text);
 j:=public.aggregate_campaign_metrics_v2('LOCAL_CORRECTIONS','2026-11-01','2026-11-07');
 perform pg_temp.record_check('moved-out historical ranges do not revive',(j->>'spend')::numeric=0 and (j->>'count')::int=0,j::text);
 perform pg_temp.record_check('correction production date boundary',pg_temp.rejects(format('select public.correct_campaign_metric_v2(%L,''2026-10-01'',''2026-10-07'',0,100,3,null,''October'')',b.id),'metrics_start_2026_11_01'),'exact error and unchanged history');
 select * into a from public.insert_campaign_metric_v2('LOCAL_OVERLAP','2026-11-01','2026-11-07',0,100,10);
 perform public.insert_campaign_metric_v2('LOCAL_OVERLAP','2026-11-08','2026-11-14',0,100,10);
 denied:=pg_temp.rejects(format('select public.correct_campaign_metric_v2(%L,''2026-11-08'',''2026-11-14'',0,100,10,null,''Overlap'')',a.id),'overlapping_date_range');
 perform pg_temp.record_check('corrections reject overlapping active ranges',denied,'correction into an occupied range');
 select * into a from public.insert_campaign_metric_v2('LOCAL_MOVED','2026-11-01','2026-11-07',0,100,10);
 perform public.correct_campaign_metric_v2(a.id,'2026-11-15','2026-11-21',0,100,10,null,'Move');
 denied:=pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_MOVED','2026-11-15','2026-11-21',0,100,10)$q$,'overlapping_date_range');
 perform pg_temp.record_check('new inserts check corrected active dates',denied,'insert on moved correction range');
 j:=public.list_campaign_metrics_with_authors_v2('LOCAL_SUM');
 perform pg_temp.record_check('history resolves actual author',jsonb_array_length(j)=2 and j->0->>'author_name'='LOCAL_EDITOR',j::text);
 perform pg_temp.record_check('anon cannot execute v2 insert',not has_function_privilege('anon','public.insert_campaign_metric_v2(text,date,date,integer,numeric,numeric,integer,text)','execute'),'function ACL');
 perform pg_temp.record_check('direct authenticated writes revoked',not has_table_privilege('authenticated','public.campaign_metrics_history_v2','insert') and not has_table_privilege('authenticated','public.campaign_metrics_history_v2','update') and not has_table_privilege('authenticated','public.campaign_metrics_history_v2','delete'),'table ACL');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare j jsonb; begin
 j:=public.list_campaign_metrics_with_authors_v2('LOCAL_SUM');
 perform pg_temp.record_check('active readers can read history',jsonb_array_length(j)=2,'history rows='||jsonb_array_length(j));
 perform pg_temp.record_check('reader insert denied',pg_temp.rejects($q$select public.insert_campaign_metric_v2('LOCAL_READER_WRITE','2026-11-01','2026-11-07',0,100,10)$q$,'campaign_editor_required'),'campaign_editor_required');
 perform pg_temp.record_check('reader correction denied',pg_temp.rejects(format('select public.correct_campaign_metric_v2(%L,''2026-11-01'',''2026-11-07'',0,100,10,null,''Reader'')',j->0->>'id'),'campaign_editor_required'),'campaign_editor_required');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ begin
 perform pg_temp.record_check('inactive history denied',pg_temp.rejects($q$select public.list_campaign_metrics_with_authors_v2('LOCAL_SUM')$q$,'active_user_required'),'active_user_required');
 perform pg_temp.record_check('inactive aggregation denied',pg_temp.rejects($q$select public.aggregate_campaign_metrics_v2('LOCAL_SUM','2026-11-01','2026-11-30')$q$,'active_user_required'),'active_user_required');
 perform pg_temp.record_check('inactive direct RLS read hides rows',(select count(*) from public.campaign_metrics_history_v2)=0,'RLS under authenticated role');
end $$;
reset role;
update public.user_access set role='admin' where user_id='00000000-0000-4000-8000-000000000001';
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
set local request.jwt.claims='{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$ declare a public.campaign_metrics_history_v2; b public.campaign_metrics_history_v2; begin
 select * into a from public.insert_campaign_metric_v2('LOCAL_ADMIN','2026-11-01','2026-11-07',0,100,10);
 select * into b from public.correct_campaign_metric_v2(a.id,'2026-11-01','2026-11-07',0,120,10,null,'Admin');
 perform pg_temp.record_check('active admin can insert and correct',b.original_id=a.id and b.spend=120,'public RPC results');
end $$;
reset role;
update public.user_access set role='supervisor' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare a public.campaign_metrics_history_v2; b public.campaign_metrics_history_v2; begin
 select * into a from public.insert_campaign_metric_v2('LOCAL_SUPERVISOR','2026-11-01','2026-11-07',0,100,10);
 select * into b from public.correct_campaign_metric_v2(a.id,'2026-11-01','2026-11-07',0,120,10,null,'Supervisor');
 perform pg_temp.record_check('active supervisor can insert and correct',b.original_id=a.id and b.spend=120,'public RPC results');
end $$;
reset role;
do $$ begin
 if exists (
   (select source,snapshot from public.local_historical_snapshot
    except select 'monthly',to_jsonb(s) from public.campaign_stats s
    except select 'period',to_jsonb(s) from public.campaign_period_stats s)
   union all
   ((select 'monthly',to_jsonb(s) from public.campaign_stats s
    union all select 'period',to_jsonb(s) from public.campaign_period_stats s)
    except select source,snapshot from public.local_historical_snapshot)
 ) then raise exception 'Historical data changed'; end if;
end $$;
select case when passed then 'PASS' else 'FAIL' end as status,name,evidence from validation_results order by passed,name;
select count(*) as total,count(*) filter(where passed) as passed,count(*) filter(where not passed) as failed from validation_results;
select exists(select from validation_results where not passed) as validation_failed \gset
rollback;
\if :validation_failed
do $$ begin raise exception 'local_v2_validation_failed'; end $$;
\endif

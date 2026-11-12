-- Stop PostgREST infinite retry loops on task RPCs.
--
-- complete_crm_task / cancel_crm_task / claim_crm_task reported "task cannot change state" with
-- SQLSTATE 40001 (serialization_failure). PostgREST treats 40001 as transient
-- and retries the transaction automatically; since the business condition
-- never changes, a single request looped forever (~2,000 rollbacks/second,
-- saturating the database CPU). Business errors now use P0001
-- (raise_exception), which is not retried. Messages are unchanged, so the
-- frontend (src/tasks/index.js shows e.message) behaves the same.

create or replace function public.complete_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  access public.user_access;
  done public.crm_tasks;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  update public.crm_tasks
  set status = 'completada',
      completed_at = now(),
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type','completed','by',auth.uid(),'at',now()))
  where id = p_task_id
    and status in ('asignada','sin_asignar')
    and (assignee_id = auth.uid() or access.role in ('supervisor','admin'))
  returning * into done;

  if done.id is null then
    raise exception using errcode='P0001', message='task_not_completable';
  end if;
  return done;
end;
$function$;

create or replace function public.cancel_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  access public.user_access;
  canceled public.crm_tasks;
begin
  select * into access from public.user_access
  where user_id = auth.uid() and activo = true;
  if access.id is null or access.role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  update public.crm_tasks
  set status = 'cancelada',
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type', 'canceled', 'by', auth.uid(), 'at', now()))
  where id = p_task_id and status in ('asignada', 'sin_asignar', 'completada')
  returning * into canceled;

  if canceled.id is null then
    raise exception using errcode = 'P0001', message = 'task_not_cancelable';
  end if;
  return canceled;
end;
$function$;

create or replace function public.claim_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claimed public.crm_tasks;
  previous_assignee uuid;
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;

  select t.assignee_id into previous_assignee from public.crm_tasks t where t.id = p_task_id;
  if previous_assignee is not null then
    perform pg_advisory_xact_lock(hashtextextended('crm_task_presence:' || previous_assignee::text, 0));
  end if;
  -- El UPDATE se inicia despues del lock: si el heartbeat gano, lee su presencia nueva.
  update public.crm_tasks t
  set assignee_id = auth.uid(), status = 'asignada', claimed_at = now(), updated_at = now(),
      history = t.history || jsonb_build_array(jsonb_build_object(
        'type', 'claimed', 'by', auth.uid(), 'from', t.assignee_id, 'at', now()))
  where t.id = p_task_id
    and ((t.status = 'sin_asignar' and t.assignee_id is null)
      or (t.status = 'asignada' and t.assignee_id <> auth.uid()
        and public.crm_task_is_shared(t.assignee_id, t.scheduled_at, t.claimed_at)))
  returning * into claimed;
  if claimed.id is null then raise exception using errcode = 'P0001', message = 'task_not_claimable'; end if;
  return claimed;
end;
$function$;

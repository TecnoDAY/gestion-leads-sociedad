-- Modulo de tareas CRM (local). No modifica tablas existentes.
-- Disponibilidad de asesoras: agent_sessions.last_activity_at (umbral 5 min).
begin;

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id bigint null references public.leads(id) on delete set null,
  descripcion text not null check (char_length(descripcion) between 1 and 200),
  scheduled_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  assignee_id uuid null references auth.users(id) on delete set null,
  status text not null default 'sin_asignar' check (status in ('sin_asignar','asignada','completada','cancelada')),
  history jsonb not null default '[]'::jsonb,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_assignee_idx on public.crm_tasks (assignee_id, status, scheduled_at);
create index if not exists crm_tasks_status_idx on public.crm_tasks (status, scheduled_at);

alter table public.crm_tasks enable row level security;

-- Solo usuarios CRM activos (no trafficker) pueden leer.
drop policy if exists crm_tasks_select on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.user_access ua
      where ua.user_id = auth.uid() and ua.activo = true
        and ua.role in ('agente','supervisor','admin')
    )
  );

revoke all on public.crm_tasks from public, anon, authenticated;
grant select on public.crm_tasks to authenticated;

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.crm_tasks;
exception when duplicate_object then null; end $$;

-- Helper: lista asesoras CRM activas para asignar.
create or replace function public.list_crm_task_advisors()
returns table (user_id uuid, nombre text, role text, last_activity_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente','supervisor','admin')
  ) then
    raise exception using errcode = '42501', message = 'crm_access_required';
  end if;
  return query
    select ua.user_id, coalesce(ua.nombre,'')::text, ua.role::text, s.last_activity_at
    from public.user_access ua
    left join lateral (
      select max(as2.last_activity_at) as last_activity_at
      from public.agent_sessions as2
      where as2.user_id = ua.user_id
        and as2.ended_at is null
    ) s on true
    where ua.activo = true
      and ua.role in ('agente','supervisor','admin');
end;
$$;

revoke all on function public.list_crm_task_advisors() from public, anon, authenticated;
grant execute on function public.list_crm_task_advisors() to authenticated;

-- Crear tarea
create or replace function public.create_crm_task(
  p_lead_id bigint,
  p_descripcion text,
  p_scheduled_at timestamptz,
  p_assignee uuid
) returns public.crm_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  new_task public.crm_tasks;
  v_desc text;
  v_assignee uuid;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  v_desc := nullif(btrim(coalesce(p_descripcion,'')), '');
  if v_desc is null then raise exception using errcode='22023', message='descripcion_required'; end if;
  if char_length(v_desc) > 200 then raise exception using errcode='22023', message='descripcion_too_long'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023', message='scheduled_at_required'; end if;

  if p_lead_id is not null then
    if not exists (select 1 from public.leads l where l.id = p_lead_id and l.archived_at is null) then
      raise exception using errcode='P0002', message='lead_not_found';
    end if;
  end if;

  if p_assignee is not null then
    if not exists (select 1 from public.user_access ua where ua.user_id = p_assignee and ua.activo = true and ua.role in ('agente','supervisor','admin')) then
      raise exception using errcode='22023', message='assignee_invalid';
    end if;
    v_assignee := p_assignee;
  else
    v_assignee := null;
  end if;

  insert into public.crm_tasks (lead_id, descripcion, scheduled_at, created_by, assignee_id, status)
  values (p_lead_id, v_desc, p_scheduled_at, auth.uid(), v_assignee,
    case when v_assignee is null then 'sin_asignar' else 'asignada' end)
  returning * into new_task;

  return new_task;
end;
$$;

revoke all on function public.create_crm_task(bigint, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.create_crm_task(bigint, text, timestamptz, uuid) to authenticated;

-- Tomar tarea (atomico)
create or replace function public.claim_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  claimed public.crm_tasks;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  update public.crm_tasks
  set assignee_id = auth.uid(),
      status = 'asignada',
      claimed_at = now(),
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type','claimed','by',auth.uid(),'at',now()))
  where id = p_task_id
    and status = 'sin_asignar'
    and assignee_id is null
  returning * into claimed;

  if claimed.id is null then
    raise exception using errcode='40001', message='task_not_claimable';
  end if;
  return claimed;
end;
$$;

revoke all on function public.claim_crm_task(uuid) from public, anon, authenticated;
grant execute on function public.claim_crm_task(uuid) to authenticated;

-- Completar tarea
create or replace function public.complete_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path = public
as $$
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
    raise exception using errcode='40001', message='task_not_completable';
  end if;
  return done;
end;
$$;

revoke all on function public.complete_crm_task(uuid) from public, anon, authenticated;
grant execute on function public.complete_crm_task(uuid) to authenticated;

-- Cancelar tarea
create or replace function public.cancel_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  canceled public.crm_tasks;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  update public.crm_tasks
  set status = 'cancelada',
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type','canceled','by',auth.uid(),'at',now()))
  where id = p_task_id
    and status in ('asignada','sin_asignar')
    and (created_by = auth.uid() or access.role in ('supervisor','admin'))
  returning * into canceled;

  if canceled.id is null then
    raise exception using errcode='40001', message='task_not_cancelable';
  end if;
  return canceled;
end;
$$;

revoke all on function public.cancel_crm_task(uuid) from public, anon, authenticated;
grant execute on function public.cancel_crm_task(uuid) to authenticated;

-- Refrescar vencidas: si la destinataria no tiene actividad reciente, liberar.
create or replace function public.refresh_crm_task_assignments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  affected integer := 0;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  with upd as (
    update public.crm_tasks t
    set assignee_id = null,
        status = 'sin_asignar',
        updated_at = now(),
        history = t.history || jsonb_build_array(jsonb_build_object('type','released','from',t.assignee_id,'reason','inactive','at',now()))
    where t.status = 'asignada'
      and t.scheduled_at <= now()
      and not exists (
        select 1 from public.agent_sessions s
        where s.user_id = t.assignee_id
          and s.ended_at is null
          and s.last_activity_at >= now() - interval '5 minutes'
      )
    returning 1
  )
  select count(*) into affected from upd;

  return affected;
end;
$$;

revoke all on function public.refresh_crm_task_assignments() from public, anon, authenticated;
grant execute on function public.refresh_crm_task_assignments() to authenticated;

comment on table public.crm_tasks is 'Tareas CRM con asignacion y bandeja general.';
commit;

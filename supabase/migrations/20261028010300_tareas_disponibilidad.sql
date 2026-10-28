-- Requiere 20261028010200_tareas_permisos_admin.sql.
-- Presencia de pestaña autenticada, distinta de la actividad del reporte de sesiones.
begin;

create table public.crm_task_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null
);
alter table public.crm_task_presence enable row level security;
revoke all on public.crm_task_presence from public, anon, authenticated;

create function public.crm_task_heartbeat()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;

  -- Ordena reconexion y toma con la misma llave, incluso antes de la primera fila de presencia.
  perform pg_advisory_xact_lock(hashtextextended('crm_task_presence:' || auth.uid()::text, 0));
  insert into public.crm_task_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke all on function public.crm_task_heartbeat() from public, anon, authenticated;
grant execute on function public.crm_task_heartbeat() to authenticated;

-- No hay transicion de estado ni liberacion fisica: el tiempo y el heartbeat
-- determinan la visibilidad. claimed_at bloquea re-tomas de una tarea ya tomada.
create function public.crm_task_is_shared(p_assignee uuid, p_scheduled_at timestamptz, p_claimed_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_assignee is not null and p_claimed_at is null
    and (p_scheduled_at <= now() or (
      p_scheduled_at <= now() + interval '20 minutes'
      and not exists (
        select 1 from public.crm_task_presence p
        where p.user_id = p_assignee and p.last_seen_at >= now() - interval '3 minutes'
      )
    ));
$$;
revoke all on function public.crm_task_is_shared(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_task_is_shared(uuid, timestamptz, timestamptz) to authenticated;

drop policy crm_tasks_select on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks for select to authenticated using (
  exists (
    select 1 from public.user_access ua
    where ua.user_id = (select auth.uid()) and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
      and (ua.role = 'admin' or assignee_id = (select auth.uid())
        or (status = 'sin_asignar' and assignee_id is null)
        or (status = 'asignada' and public.crm_task_is_shared(assignee_id, scheduled_at, claimed_at)))
  )
);

-- La vista usa permisos del invocador: nunca evita RLS de crm_tasks.
create view public.crm_tasks_visible with (security_invoker = true) as
  select t.*, (t.status = 'asignada' and public.crm_task_is_shared(t.assignee_id, t.scheduled_at, t.claimed_at)) as is_shared
  from public.crm_tasks t;
revoke all on public.crm_tasks_visible from public, anon, authenticated;
grant select on public.crm_tasks_visible to authenticated;

create or replace function public.claim_crm_task(p_task_id uuid)
returns public.crm_tasks language plpgsql security definer set search_path = public as $$
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
  if claimed.id is null then raise exception using errcode = '40001', message = 'task_not_claimable'; end if;
  return claimed;
end;
$$;
revoke all on function public.claim_crm_task(uuid) from public, anon, authenticated;
grant execute on function public.claim_crm_task(uuid) to authenticated;

-- Versiones anteriores del cliente invocan esta RPC: no desasignar ni reescribir historia.
create or replace function public.refresh_crm_task_assignments()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.user_access ua where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;
  return 0;
end;
$$;
revoke all on function public.refresh_crm_task_assignments() from public, anon, authenticated;
grant execute on function public.refresh_crm_task_assignments() to authenticated;

-- Misma firma que el selector actual; muestra presencia real en vez de clics.
create or replace function public.list_crm_task_advisors()
returns table (user_id uuid, nombre text, role text, last_activity_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.user_access ua where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;
  return query
    select ua.user_id, coalesce(ua.nombre, '')::text, ua.role::text,
      case when p.last_seen_at >= now() - interval '3 minutes' then p.last_seen_at else null end
    from public.user_access ua
    left join public.crm_task_presence p on p.user_id = ua.user_id
    where ua.activo = true and ua.role in ('agente', 'supervisor', 'admin');
end;
$$;
revoke all on function public.list_crm_task_advisors() from public, anon, authenticated;
grant execute on function public.list_crm_task_advisors() to authenticated;

commit;

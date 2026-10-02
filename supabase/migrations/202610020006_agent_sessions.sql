-- Sesion operativa por asesora: inactividad de 5 min y monitoreo.
-- Solo el rol agente crea filas; los timestamps siempre salen del servidor.
-- La tabla no es legible directamente: todo el acceso pasa por RPC.
begin;

create table if not exists public.agent_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent_name text not null default '',
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('manual_logout', 'idle_timeout', 'session_invalid')),
  created_at timestamptz not null default now()
);
comment on table public.agent_sessions is 'Sesiones operativas de asesoras: inicio, ultima actividad, cierre y motivo. Resumen, sin clics ni PII. Retencion 90 dias.';
create index if not exists agent_sessions_user_idx on public.agent_sessions (user_id, id desc);
create index if not exists agent_sessions_open_idx on public.agent_sessions (id) where ended_at is null;

alter table public.agent_sessions enable row level security;
revoke all on public.agent_sessions from public, anon, authenticated;

-- Arranque: solo asesoras activas; otros roles no tienen cierre por inactividad.
-- Retencion: al iniciar una sesion nueva se purgan filas cerradas con 90+ dias.
create or replace function public.start_agent_session()
returns public.agent_sessions language plpgsql security definer set search_path = public as $$
declare
  access public.user_access;
  created public.agent_sessions;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if access.role <> 'agente' then return null; end if;
  delete from public.agent_sessions where ended_at is not null and ended_at < now() - interval '90 days';
  insert into public.agent_sessions (user_id, agent_name)
  values (auth.uid(), left(coalesce(access.nombre, ''), 120))
  returning * into created;
  return created;
end;
$$;

-- Solo la dueña puede actualizar una sesion abierta suya; la marca sale del servidor.
create or replace function public.touch_agent_session(p_session_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.agent_sessions
  set last_activity_at = now()
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.end_agent_session(p_session_id bigint, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_reason not in ('manual_logout', 'idle_timeout', 'session_invalid') then raise exception using errcode = '22023', message = 'session_end_reason_invalid'; end if;
  update public.agent_sessions
  set ended_at = now(), end_reason = p_reason
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- Lectura solo admin: sesiones del periodo solicitado (por defecto 7 dias, tope 60).
create or replace function public.admin_agent_sessions_report(p_from date default (now() at time zone 'America/New_York')::date - 7, p_to date default (now() at time zone 'America/New_York')::date, p_user_id uuid default null)
returns table(id bigint, user_id uuid, agent_name text, started_at timestamptz, last_activity_at timestamptz, ended_at timestamptz, end_reason text, active boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'America/New_York')::date - 7);
  v_to date := coalesce(p_to, (now() at time zone 'America/New_York')::date);
begin
  if not public.is_admin_user() then raise exception using errcode = '42501', message = 'admin_required'; end if;
  if v_to < v_from then raise exception using errcode = '22023', message = 'report_range_invalid'; end if;
  if v_from < (now() at time zone 'America/New_York')::date - 60 then raise exception using errcode = '22023', message = 'report_range_too_wide'; end if;
  return query
  select s.id, s.user_id, s.agent_name, s.started_at, s.last_activity_at, s.ended_at, s.end_reason, s.ended_at is null
  from public.agent_sessions s
  where (p_user_id is null or s.user_id = p_user_id)
    and (s.started_at at time zone 'America/New_York')::date between v_from and v_to
  order by s.id desc
  limit 500;
end;
$$;

revoke all on function public.start_agent_session() from public, anon;
grant execute on function public.start_agent_session() to authenticated;
revoke all on function public.touch_agent_session(bigint) from public, anon;
grant execute on function public.touch_agent_session(bigint) to authenticated;
revoke all on function public.end_agent_session(bigint, text) from public, anon;
grant execute on function public.end_agent_session(bigint, text) to authenticated;
revoke all on function public.admin_agent_sessions_report(date, date, uuid) from public, anon;
grant execute on function public.admin_agent_sessions_report(date, date, uuid) to authenticated;

commit;

-- Rollback manual: revoke/eliminar las cuatro RPC y la tabla public.agent_sessions.

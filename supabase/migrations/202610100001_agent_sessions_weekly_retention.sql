-- Mantener solo una semana de sesiones cerradas.
-- La purga se ejecuta al iniciar una sesion de agente y al consultar el panel admin.
begin;

comment on table public.agent_sessions is 'Sesiones operativas de asesoras: inicio, ultima actividad, cierre y motivo. Resumen, sin clics ni PII. Sesiones cerradas retenidas 7 dias.';

create or replace function public.start_agent_session()
returns public.agent_sessions language plpgsql security definer set search_path = public as $$
declare
  access public.user_access;
  created public.agent_sessions;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if access.role <> 'agente' then return null; end if;
  delete from public.agent_sessions where ended_at is not null and ended_at < now() - interval '7 days';
  insert into public.agent_sessions (user_id, agent_name)
  values (auth.uid(), left(coalesce(access.nombre, ''), 120))
  returning * into created;
  return created;
end;
$$;

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
  delete from public.agent_sessions where ended_at is not null and ended_at < now() - interval '7 days';
  return query
  select s.id, s.user_id, s.agent_name, s.started_at, s.last_activity_at, s.ended_at, s.end_reason, s.ended_at is null
  from public.agent_sessions s
  where (p_user_id is null or s.user_id = p_user_id)
    and (s.started_at at time zone 'America/New_York')::date between v_from and v_to
    and (s.ended_at is null or s.ended_at >= now() - interval '7 days')
  order by s.id desc
  limit 500;
end;
$$;

commit;

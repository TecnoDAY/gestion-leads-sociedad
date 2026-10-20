-- Sesiones de agente: exigir usuario activo (auditoria 2026-10-19, P1c).
-- Antes, un usuario desactivado (activo = false) podia seguir tocando o
-- cerrando su sesion abierta porque las funciones solo comprobaban que la
-- sesion fuera suya. Se replica el cuerpo vigente adding la guarda
-- is_active_user(), coherente con el resto de RPC del panel.
begin;

create or replace function public.touch_agent_session(p_session_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.is_active_user() then return false; end if;
  update public.agent_sessions
  set last_activity_at = now()
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

create or replace function public.end_agent_session(p_session_id bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not public.is_active_user() then return false; end if;
  if p_reason not in ('manual_logout', 'idle_timeout', 'session_invalid') then raise exception using errcode = '22023', message = 'session_end_reason_invalid'; end if;
  update public.agent_sessions
  set ended_at = now(), end_reason = p_reason
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

comment on function public.touch_agent_session(bigint) is 'Registra actividad de la sesion abierta. Exige usuario activo (is_active_user) y que la sesion sea del propio usuario.';
comment on function public.end_agent_session(bigint, text) is 'Cierra la sesion abierta con un motivo allowed. Exige usuario activo (is_active_user) y que la sesion sea del propio usuario.';

grant execute on function public.touch_agent_session(bigint) to authenticated, service_role;
grant execute on function public.end_agent_session(bigint, text) to authenticated, service_role;
revoke execute on function public.touch_agent_session(bigint) from public, anon;
revoke execute on function public.end_agent_session(bigint, text) from public, anon;

commit;

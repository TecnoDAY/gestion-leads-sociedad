-- Correcciones tras la revision independiente del endurecimiento (2026-10-19).
--
-- 1) end_agent_session: el cierre por 'session_invalid' es justo el flujo de
--    desactivacion de cuenta. Con la guarda de usuario activo, un usuario
--    desactivado ya no podia cerrar su sesion y la fila se quedaba abierta
--    para siempre (sesion fantasma en agent_sessions). Se permite cerrar con
--    'session_invalid' sin exigir usuario activo; el resto de motivos sigue
--    exigiendolo.
--
-- 2) Limitador global del webhook: el contador en memoria de la edge function
--    no sirve (cada instancia tiene el suyo y Supabase reparte las peticiones
--    entre instancias: 400 peticiones seguidas no bloqueaban ninguna). El
--    contador pasa a la base de datos, donde es global. La tabla nace
--    fail-closed (RLS sin politicas y sin privilegios para anon/authenticated;
--    solo service_role y postgres la tocan).
begin;

create or replace function public.end_agent_session(p_session_id bigint, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  -- 'session_invalid' es el cierre por desactivacion: debe poder ejecutarse
  -- con la cuenta ya desactivada.
  if p_reason <> 'session_invalid' and not public.is_active_user() then return false; end if;
  if p_reason not in ('manual_logout', 'idle_timeout', 'session_invalid') then raise exception using errcode = '22023', message = 'session_end_reason_invalid'; end if;
  update public.agent_sessions
  set ended_at = now(), end_reason = p_reason
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

comment on function public.end_agent_session(bigint, text) is 'Cierra la sesion abierta con un motivo allowed. Exige usuario activo salvo con el motivo session_invalid (flujo de desactivacion de cuenta, que debe poder cerrar la sesion aunque la cuenta ya este inactiva).';

grant execute on function public.end_agent_session(bigint, text) to authenticated, service_role;
revoke execute on function public.end_agent_session(bigint, text) from public, anon;

-- Contador global de peticiones por IP para la ruta de verificacion del webhook.
create table if not exists public.webhook_rate_limit (
  ip text primary key,
  hits integer not null default 0,
  ventana timestamptz not null default now()
);

alter table public.webhook_rate_limit enable row level security;
revoke all on table public.webhook_rate_limit from public, anon, authenticated;
grant all on table public.webhook_rate_limit to service_role;

create or replace function public.webhook_rate_limit_hit(p_ip text, p_maximo integer, p_ventana_segundos integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_hits integer;
begin
  if p_ip is null or btrim(p_ip) = '' then return 0; end if;
  if p_maximo is null or p_maximo < 1 then p_maximo := 30; end if;
  if p_ventana_segundos is null or p_ventana_segundos < 1 then p_ventana_segundos := 60; end if;

  insert into public.webhook_rate_limit as t (ip, hits, ventana)
  values (p_ip, 1, now())
  on conflict (ip) do update
    set hits = case when t.ventana < now() - make_interval(secs => p_ventana_segundos) then 1 else t.hits + 1 end,
        ventana = case when t.ventana < now() - make_interval(secs => p_ventana_segundos) then now() else t.ventana end
  returning hits into v_hits;

  -- Limpieza de filas que ya no sirven (la ventana es corta).
  delete from public.webhook_rate_limit where ventana < now() - interval '1 day';

  return v_hits;
end;
$$;

comment on function public.webhook_rate_limit_hit(text, integer, integer) is 'Contador global de peticiones por IP (ventana fija). Devuelve el numero de peticiones de la ventana actual; la tabla vive en la base de datos porque el contador en memoria de la edge function se reparte entre instancias. Uso interno: service_role.';

grant execute on function public.webhook_rate_limit_hit(text, integer, integer) to service_role;
revoke execute on function public.webhook_rate_limit_hit(text, integer, integer) from public, anon, authenticated;

commit;

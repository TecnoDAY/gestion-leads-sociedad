-- Periodos estimados a partir del heartbeat existente; no reconstruye el pasado.
begin;

create table if not exists public.crm_presence_periods (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  constraint crm_presence_periods_order check (last_seen_at >= started_at)
);
create index if not exists crm_presence_periods_user_last_idx
  on public.crm_presence_periods (user_id, last_seen_at desc);
create index if not exists crm_presence_periods_last_idx
  on public.crm_presence_periods (last_seen_at);
alter table public.crm_presence_periods enable row level security;
revoke all on public.crm_presence_periods from public, anon, authenticated;
revoke all on sequence public.crm_presence_periods_id_seq from public, anon, authenticated;

create or replace function public.crm_task_heartbeat()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;

  -- Misma llave que claim_crm_task: serializa tambien las pestanas del usuario.
  perform pg_advisory_xact_lock(hashtextextended('crm_task_presence:' || auth.uid()::text, 0));
  insert into public.crm_task_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;

  update public.crm_presence_periods p
  set last_seen_at = greatest(p.last_seen_at, now())
  where p.id = (
    select latest.id from public.crm_presence_periods latest
    where latest.user_id = auth.uid()
    order by latest.last_seen_at desc, latest.id desc limit 1
  ) and p.last_seen_at >= now() - interval '5 minutes';
  if not found then
    insert into public.crm_presence_periods (user_id, started_at, last_seen_at)
    values (auth.uid(), now(), now());
  end if;

  -- Retencion por usuario al volver a enviar senal, sin job ni llamada extra.
  delete from public.crm_presence_periods
  where user_id = auth.uid() and last_seen_at < now() - interval '35 days';
end;
$$;
revoke all on function public.crm_task_heartbeat() from public, anon, authenticated;
grant execute on function public.crm_task_heartbeat() to authenticated;

-- Cambia el tipo de retorno: no se puede usar CREATE OR REPLACE solamente.
drop function if exists public.list_team_presence();
create or replace function public.list_team_presence()
returns table(user_id uuid, nombre text, role text, last_seen_at timestamptz, current_period_started_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  return query
    select ua.user_id, coalesce(ua.nombre, '')::text, ua.role::text, p.last_seen_at, period.started_at
    from public.user_access ua
    left join public.crm_task_presence p on p.user_id = ua.user_id
    left join lateral (
      select pp.started_at from public.crm_presence_periods pp
      where pp.user_id = ua.user_id
        and p.last_seen_at between pp.started_at and pp.last_seen_at
      order by pp.last_seen_at desc, pp.id desc limit 1
    ) period on true
    where ua.activo = true
    order by lower(coalesce(ua.nombre, '')), ua.user_id;
end;
$$;
revoke all on function public.list_team_presence() from public, anon;
grant execute on function public.list_team_presence() to authenticated;

create or replace function public.get_presence_history(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('admin', 'supervisor')
  ) then raise exception using errcode = '42501', message = 'presence_history_forbidden'; end if;

  with clock as (
    select (now() at time zone 'America/New_York')::date as today,
      date_trunc('week', now() at time zone 'America/New_York')::date as monday
  ), weeks as (
    select n, (monday - n * 7) as start_date, (monday - n * 7 + 6) as end_date
    from clock cross join generate_series(0, 3) n
  ), days as (
    -- Construir cada medianoche local por separado respeta dias de 23/25 horas.
    select (monday - 21 + n) as day,
      (monday - 21 + n)::timestamp at time zone 'America/New_York' as day_start,
      (monday - 20 + n)::timestamp at time zone 'America/New_York' as day_end
    from clock cross join lateral generate_series(0, today - (monday - 21)) n
  ), periods as (
    select p.id, p.started_at,
      case when p.last_seen_at >= now() - interval '3 minutes'
        then now() else p.last_seen_at end as ended_at,
      p.last_seen_at >= now() - interval '3 minutes' as ongoing
    from public.crm_presence_periods p cross join clock
    where p.user_id = p_user_id
      and p.last_seen_at >= (clock.monday - 21)::timestamp at time zone 'America/New_York'
  ), clipped as (
    select d.day, p.id, greatest(p.started_at, d.day_start) as started_at,
      least(p.ended_at, d.day_end) as ended_at,
      p.ongoing and p.ended_at < d.day_end as ongoing
    from days d join periods p on p.started_at < d.day_end and p.ended_at >= d.day_start
  ), ordered as (
    select *, lag(ended_at) over (partition by day order by started_at, id) as previous_end
    from clipped
  ), segments as (
    select day, 'online'::text as state, started_at, ended_at, ongoing from ordered
    union all
    select day, 'away', previous_end, started_at, false from ordered
    where previous_end < started_at
  ), daily_totals as (
    select day, sum(extract(epoch from ended_at - started_at)) as online_seconds,
      greatest(0, extract(epoch from max(ended_at) - min(started_at))
        - sum(extract(epoch from ended_at - started_at))) as away_seconds
    from clipped group by day
  )
  select jsonb_build_object(
    'days', (
      select jsonb_agg(jsonb_build_object(
        'date', d.day,
        'periods', coalesce((
          select jsonb_agg(jsonb_build_object(
            'state', s.state, 'started_at', s.started_at, 'ended_at', s.ended_at,
            'seconds', extract(epoch from s.ended_at - s.started_at), 'ongoing', s.ongoing
          ) order by s.started_at, s.ended_at, s.state)
          from segments s where s.day = d.day
        ), '[]'::jsonb)
      ) order by d.day desc)
      from days d cross join clock where d.day >= clock.today - 1
    ),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'start_date', w.start_date, 'end_date', w.end_date,
        'online_seconds', coalesce((select sum(t.online_seconds) from daily_totals t
          where t.day between w.start_date and w.end_date), 0),
        'away_seconds', coalesce((select sum(t.away_seconds) from daily_totals t
          where t.day between w.start_date and w.end_date), 0)
      ) order by w.n) from weeks w
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_presence_history(uuid) from public, anon;
grant execute on function public.get_presence_history(uuid) to authenticated;

commit;

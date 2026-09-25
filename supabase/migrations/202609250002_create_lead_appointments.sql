-- Citas y su historial append-only.
-- NO se aplica remotamente por el agente; revisar y ejecutar manualmente en Supabase.

begin;

create table if not exists public.lead_appointments (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'PROGRAMADA' check (status in ('PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA')),
  advisor_user_id uuid references auth.users(id) on delete set null,
  advisor_name text not null,
  notes text not null default '' check (length(notes) <= 2000),
  rescheduled_from_id bigint references public.lead_appointments(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists lead_appointments_advisor_scheduled_idx on public.lead_appointments (advisor_user_id, scheduled_at);
create index if not exists lead_appointments_lead_scheduled_idx on public.lead_appointments (lead_id, scheduled_at);
create index if not exists lead_appointments_status_idx on public.lead_appointments (status);

create table if not exists public.lead_appointment_events (
  id bigint generated always as identity primary key,
  appointment_id bigint not null references public.lead_appointments(id) on delete cascade,
  status_anterior text check (status_anterior is null or status_anterior in ('PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA')),
  status_nuevo text not null check (status_nuevo in ('PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists lead_appointment_events_appointment_created_idx on public.lead_appointment_events (appointment_id, created_at);

alter table public.lead_appointments enable row level security;
alter table public.lead_appointment_events enable row level security;

drop policy if exists "lead_appointments_read_active_authorized" on public.lead_appointments;
create policy "lead_appointments_read_active_authorized" on public.lead_appointments
  for select to authenticated
  using (public.is_active_user() and (public.is_admin_user() or advisor_user_id = auth.uid()));
drop policy if exists "lead_appointment_events_read_active_authorized" on public.lead_appointment_events;
create policy "lead_appointment_events_read_active_authorized" on public.lead_appointment_events
  for select to authenticated
  using (public.is_active_user() and (public.is_admin_user() or exists (
    select 1 from public.lead_appointments a where a.id = appointment_id and a.advisor_user_id = auth.uid()
  )));

revoke select on public.lead_appointments, public.lead_appointment_events from anon;
revoke insert, update, delete on public.lead_appointments, public.lead_appointment_events from anon, authenticated;
grant select on public.lead_appointments, public.lead_appointment_events to authenticated;

create or replace function public.record_lead_appointment_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  select coalesce(nombre, '') into actor from public.user_access where user_id = auth.uid() limit 1;
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.lead_appointment_events (appointment_id, status_anterior, status_nuevo, actor_user_id, actor_name, notes)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, auth.uid(), coalesce(actor, ''), new.notes);
  end if;
  return new;
end;
$$;

drop trigger if exists lead_appointments_record_event on public.lead_appointments;
create trigger lead_appointments_record_event after insert or update of status on public.lead_appointments
for each row execute function public.record_lead_appointment_event();

create or replace function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare created public.lead_appointments; access public.user_access; advisor public.user_access;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  if not exists (select 1 from public.leads where id = p_lead_id) then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  if access.role = 'admin' and p_advisor_user_id is not null then
    select * into advisor from public.user_access where user_id = p_advisor_user_id and activo = true;
    if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  else advisor := access;
  end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid()) returning * into created;
  return created;
end;
$$;

create or replace function public.set_lead_appointment_status(p_id bigint, p_status text, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare updated public.lead_appointments;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if p_status is null or p_status not in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA') then raise exception using errcode = '22023', message = 'invalid_status'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid())
  for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  if updated.status = p_status then return updated; end if;
  if updated.status <> 'PROGRAMADA' then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments set status = p_status, resolved_at = now(), updated_at = now(), notes = case when coalesce(p_notes, '') = '' then notes else p_notes end
  where id = p_id returning * into updated;
  return updated;
end;
$$;

create or replace function public.reschedule_lead_appointment(p_id bigint, p_scheduled_at timestamptz, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare old_appointment public.lead_appointments; created public.lead_appointments; new_notes text;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into old_appointment from public.lead_appointments where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid()) and status = 'PROGRAMADA' for update;
  if old_appointment.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  new_notes := case when coalesce(p_notes, '') = '' then old_appointment.notes else p_notes end;
  update public.lead_appointments set status = 'REPROGRAMADA', resolved_at = now(), updated_at = now() where id = p_id;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id, created_by_user_id)
  values (old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name, new_notes, p_id, auth.uid()) returning * into created;
  return created;
end;
$$;

revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid) from public;
revoke all on function public.set_lead_appointment_status(bigint, text, text) from public;
revoke all on function public.reschedule_lead_appointment(bigint, timestamptz, text) from public;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid) to authenticated;
grant execute on function public.set_lead_appointment_status(bigint, text, text) to authenticated;
grant execute on function public.reschedule_lead_appointment(bigint, timestamptz, text) to authenticated;

comment on table public.lead_appointments is 'Citas independientes de lead_gestiones; revisar y aplicar manualmente en Supabase.';
comment on table public.lead_appointment_events is 'Historial append-only de estados de citas.';

commit;

-- Rollback manual (tras revisión): eliminar RPCs, trigger, políticas, índices y tablas si no se necesita conservar el historial.
-- No ejecutar automáticamente contra el remoto.

-- Daily report notes per advisor and date, with server-side role protection.
-- Shared read for active users; all writes go through security-definer RPCs
-- (there is no direct write policy). Agents may only save/delete their own
-- note for today in Miami time; admins have no restrictions.
-- Also re-applies record_lead_gestion() so unparseable or missing gestion
-- dates fall back to today in Miami (America/New_York) time.
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

create table if not exists public.daily_report_notes (
  id bigint generated always as identity primary key,
  report_date date not null,
  autor_name text not null,
  autor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  problemas text not null default '' check (length(problemas) <= 5000),
  observaciones text not null default '' check (length(observaciones) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_report_notes_fecha_autor_key unique (report_date, autor_name)
);

create index if not exists daily_report_notes_fecha_idx on public.daily_report_notes (report_date);

alter table public.daily_report_notes enable row level security;

-- Read for active users; there is intentionally no INSERT/UPDATE/DELETE policy.
-- All mutations happen through the RPCs below.
drop policy if exists "daily_report_notes_read_active_authorized" on public.daily_report_notes;
create policy "daily_report_notes_read_active_authorized"
on public.daily_report_notes for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.daily_report_notes from anon, authenticated;
revoke select on public.daily_report_notes from anon;
grant select on public.daily_report_notes to authenticated;

-- Save (insert or update) the daily report note for one (date, advisor) pair.
-- Agents may only target their own name and today's date in Miami time;
-- admins may target any active advisor and any date.
create or replace function public.upsert_daily_report_note(p_report_date date, p_autor_name text, p_problemas text, p_observaciones text)
returns public.daily_report_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  miami_today date;
  target_name text;
  target_user_id uuid;
  row public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if p_report_date is null then
    raise exception using errcode = '22023', message = 'report_date_required';
  end if;

  miami_today := (now() at time zone 'America/New_York')::date;
  target_name := coalesce(nullif(btrim(p_autor_name), ''), access.nombre);

  if access.role <> 'admin' then
    if target_name <> access.nombre or p_report_date <> miami_today then
      raise exception using errcode = '42501', message = 'own_note_today_required';
    end if;
    target_user_id := access.user_id;
  else
    select user_id into target_user_id
    from public.user_access
    where btrim(nombre) = target_name and activo = true
    limit 1;
    if target_user_id is null then
      raise exception using errcode = 'P0002', message = 'advisor_not_found';
    end if;
  end if;

  insert into public.daily_report_notes (report_date, autor_name, autor_user_id, problemas, observaciones, updated_at)
  values (p_report_date, target_name, target_user_id, left(coalesce(p_problemas, ''), 5000), left(coalesce(p_observaciones, ''), 5000), now())
  on conflict (report_date, autor_name) do update
  set problemas = excluded.problemas,
      observaciones = excluded.observaciones,
      autor_user_id = excluded.autor_user_id,
      updated_at = now()
  returning * into row;
  return row;
end;
$$;

-- Delete a daily report note by id. Agents may only delete their own note
-- for today in Miami time; admins may delete any. Missing notes are ignored
-- (idempotent).
create or replace function public.delete_daily_report_note(p_note_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  miami_today date;
  row public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;

  miami_today := (now() at time zone 'America/New_York')::date;

  select * into row from public.daily_report_notes where id = p_note_id;
  if not found then
    return;
  end if;

  if access.role <> 'admin'
     and (row.autor_user_id <> access.user_id or row.report_date <> miami_today) then
    raise exception using errcode = '42501', message = 'own_note_today_required';
  end if;

  delete from public.daily_report_notes where id = p_note_id;
end;
$$;

revoke all on function public.upsert_daily_report_note(date, text, text, text) from public;
revoke all on function public.delete_daily_report_note(bigint) from public;
grant execute on function public.upsert_daily_report_note(date, text, text, text) to authenticated;
grant execute on function public.delete_daily_report_note(bigint) to authenticated;

comment on table public.daily_report_notes is 'Manual daily report notes per advisor and date; shared read, RPC-enforced writes (agents: own note today only; admin: any).';
comment on function public.upsert_daily_report_note(date, text, text, text) is 'Saves the daily report note for a date and advisor; agents only their own note for today in Miami time, admin any.';
comment on function public.delete_daily_report_note(bigint) is 'Deletes a daily report note; agents only their own note for today in Miami time, admin any; already-deleted notes are ignored.';

-- ---------------------------------------------------------------------------
-- Fallback de fecha del trigger record_lead_gestion: misma definicion vigente
-- (202609260002) pero los dos fallbacks (exception handler y else) usan la
-- fecha de Miami en lugar de current_date. Solo afecta a gestiones nuevas;
-- las fechas de gestiones ya registradas no se reinterpretan.
-- ---------------------------------------------------------------------------
create or replace function public.record_lead_gestion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $mia$
declare
  gestion_fecha text;
  fecha date;
  fecha_partes text[];
  autor text;
begin
  -- Sin actor autenticado (migraciones, service role, SQL editor) no hay
  -- gestion que registrar: el historial solo recoge acciones de personas.
  if auth.uid() is null then
    return NEW;
  end if;

  gestion_fecha := nullif(btrim(NEW."Fecha Última Gestión "), '');
  fecha_partes := regexp_match(gestion_fecha, '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$');
  if fecha_partes is not null
     and fecha_partes[1]::int between 1 and 31
     and fecha_partes[2]::int between 1 and 12 then
    begin
      fecha := make_date(fecha_partes[3]::int, fecha_partes[2]::int, fecha_partes[1]::int);
    exception when others then
      fecha := (now() at time zone 'America/New_York')::date;
    end;
  else
    fecha := (now() at time zone 'America/New_York')::date;
  end if;

  select coalesce(ua.nombre, '') into autor
  from public.user_access ua
  where ua.user_id = auth.uid()
  limit 1;

  insert into public.lead_gestiones (
    lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal,
    autor_name, autor_user_id
  ) values (
    NEW.id, fecha, OLD."GESTION", NEW."GESTION", NEW."ULTIMA GESTION",
    coalesce(autor, ''), auth.uid()
  );
  return NEW;
end;
$mia$;

drop trigger if exists leads_record_gestion on public.leads;
create trigger leads_record_gestion
after update of "GESTION" on public.leads
for each row
when (OLD."GESTION" is distinct from NEW."GESTION")
execute function public.record_lead_gestion();

comment on function public.record_lead_gestion() is 'Records lead gestion changes with date, channel and current user attribution; unparseable or missing dates fall back to today in Miami (America/New_York) time.';

commit;

-- Rollback (manual, after review): drop the two RPC functions, the policy,
-- the grants and the daily_report_notes table only if no notes must be kept.
-- To restore the previous record_lead_gestion() (current_date fallback),
-- re-apply its definition from migration 202609260002.
-- Do not run this automatically against the remote project.

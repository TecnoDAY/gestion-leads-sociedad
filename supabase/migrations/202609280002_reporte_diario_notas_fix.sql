-- Corrective migration for daily_report_notes: key by user_id (stable identity).
-- Applies incremental changes without modifying existing data; the table is empty.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop existing unique constraint on name (PostgreSQL auto-drops the index).
-- ---------------------------------------------------------------------------
alter table public.daily_report_notes drop constraint if exists daily_report_notes_fecha_autor_key;

-- ---------------------------------------------------------------------------
-- 2. Recreate unique constraint and index by user_id.
-- ---------------------------------------------------------------------------
alter table public.daily_report_notes
  add constraint daily_report_notes_fecha_autor_key
    unique (report_date, autor_user_id);

drop index if exists public.daily_report_notes_fecha_idx;
create index daily_report_notes_fecha_idx on public.daily_report_notes (report_date);

-- ---------------------------------------------------------------------------
-- 3. Harden upsert: compare by id; agents may only insert their own note.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_daily_report_note(p_report_date date, p_autor_name text, p_problemas text, p_observaciones text)
returns public.daily_report_notes
language plpgsql
security definer
set search_path = public
as $func$
declare
  access public.user_access;
  miami_today date;
  target_name text;
  target_user_id uuid;
  existing public.daily_report_notes;
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
  on conflict (report_date, autor_user_id) do update
  set problemas = excluded.problemas,
      observaciones = excluded.observaciones,
      autor_name = excluded.autor_name,
      updated_at = now()
  returning * into existing;
  return existing;
end;
$func$;

-- ---------------------------------------------------------------------------
-- 4. Harden delete: safe idempotent comparison with null-safe equality.
-- ---------------------------------------------------------------------------
create or replace function public.delete_daily_report_note(p_note_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $func$
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

  -- If not admin: deny when row is missing or does not belong to this agent for today.
  if access.role <> 'admin' and (row.autor_user_id is null or row.autor_user_id <> access.user_id or row.report_date <> miami_today) then
    raise exception using errcode = '42501', message = 'own_note_today_required';
  end if;

  delete from public.daily_report_notes where id = p_note_id;
end;
$func$;

commit;

-- Rollback (manual, after review): drop the two RPC functions, recreate the original
-- unique constraint on (report_date, autor_name) if needed.
-- Do not run this automatically against the remote project.

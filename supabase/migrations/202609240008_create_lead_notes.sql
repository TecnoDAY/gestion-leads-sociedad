-- Append-only per-lead team notes with server-side role protection.
-- Agents may insert and read notes; only admins may update or delete them.
-- All writes go through security-definer RPCs (there is no direct write policy).
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

create table if not exists public.lead_notes (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  author_name text not null default '',
  author_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  note text not null check (length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id, created_at desc);

alter table public.lead_notes enable row level security;

-- Read for active users; there is intentionally no INSERT/UPDATE/DELETE policy.
-- All mutations happen through the RPCs below.
drop policy if exists "lead_notes_read_active_authorized" on public.lead_notes;
create policy "lead_notes_read_active_authorized"
on public.lead_notes for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.lead_notes from anon, authenticated;
revoke select on public.lead_notes from anon;
grant select on public.lead_notes to authenticated;

-- Append a note. Any active user (agent or admin); author comes from user_access.
create or replace function public.create_lead_note(p_lead_id bigint, p_note text)
returns public.lead_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.lead_notes;
  access public.user_access;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception using errcode = '22023', message = 'note_required';
  end if;

  insert into public.lead_notes (lead_id, author_name, author_user_id, note)
  values (p_lead_id, left(access.nombre, 120), auth.uid(), left(btrim(p_note), 2000))
  returning * into created;
  return created;
end;
$$;

-- Edit a note. Admin only; agents get 42501 even for their own notes.
create or replace function public.update_lead_note(p_id bigint, p_note text)
returns public.lead_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.lead_notes;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception using errcode = '22023', message = 'note_required';
  end if;

  update public.lead_notes
  set note = left(btrim(p_note), 2000), updated_at = now()
  where id = p_id
  returning * into updated;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'note_not_found';
  end if;
  return updated;
end;
$$;

-- Delete a note. Admin only.
create or replace function public.delete_lead_note(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  delete from public.lead_notes where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'note_not_found';
  end if;
end;
$$;

revoke all on function public.create_lead_note(bigint, text) from public;
revoke all on function public.update_lead_note(bigint, text) from public;
revoke all on function public.delete_lead_note(bigint) from public;
grant execute on function public.create_lead_note(bigint, text) to authenticated;
grant execute on function public.update_lead_note(bigint, text) to authenticated;
grant execute on function public.delete_lead_note(bigint) to authenticated;

comment on table public.lead_notes is 'Append-only team notes per lead; agents insert, only admins edit/delete (RPC-enforced).';
comment on function public.create_lead_note(bigint, text) is 'Any active user appends a note; author_name is taken server-side from user_access.';
comment on function public.update_lead_note(bigint, text) is 'Admin-only note edit; agents always get admin_required.';
comment on function public.delete_lead_note(bigint) is 'Admin-only note deletion; there is no direct DELETE policy.';

commit;

-- Rollback (manual, after review): drop the three functions, the policy,
-- the grants and the lead_notes table only if no notes must be kept.
-- Do not run this automatically against the remote project.

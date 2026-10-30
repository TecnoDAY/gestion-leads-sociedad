-- Add 'agente' as a fifth catalog kind: option lists for advisor names in
-- forms and filters. Accounts in user_access are untouched; a disabled agent
-- name only disappears from suggestions, never from anyone's login.
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

-- Recreate the CHECK constraint including the new kind.
alter table public.lead_catalogs drop constraint if exists lead_catalogs_kind_check;
alter table public.lead_catalogs add constraint lead_catalogs_kind_check
  check (kind in ('mes', 'campana', 'medio', 'gestion', 'agente'));

-- Widen the kind validation of the three admin RPCs.
create or replace function public.create_lead_catalog(p_kind text, p_value text)
returns public.lead_catalogs
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.lead_catalogs;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_kind not in ('mes', 'campana', 'medio', 'gestion', 'agente') then
    raise exception using errcode = '22023', message = 'catalog_kind_invalid';
  end if;
  if length(btrim(coalesce(p_value, ''))) = 0 then
    raise exception using errcode = '22023', message = 'value_required';
  end if;

  insert into public.lead_catalogs (kind, value)
  values (p_kind, left(btrim(p_value), 120))
  on conflict (kind, value) do update set active = true
  returning * into created;
  return created;
end;
$$;

create or replace function public.rename_lead_catalog(p_id bigint, p_value text)
returns public.lead_catalogs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.lead_catalogs;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if length(btrim(coalesce(p_value, ''))) = 0 then
    raise exception using errcode = '22023', message = 'value_required';
  end if;

  update public.lead_catalogs
  set value = left(btrim(p_value), 120)
  where id = p_id
  returning * into updated;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'catalog_not_found';
  end if;
  return updated;
end;
$$;

create or replace function public.set_lead_catalog_active(p_id bigint, p_active boolean)
returns public.lead_catalogs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.lead_catalogs;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  update public.lead_catalogs
  set active = coalesce(p_active, false)
  where id = p_id
  returning * into updated;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'catalog_not_found';
  end if;
  return updated;
end;
$$;

-- Seed: advisor names from user_access (active users first) and from leads.
-- The deployed agent column is "AGENTE" (uppercase, no trailing space, migration 0003).
insert into public.lead_catalogs (kind, value)
select 'agente', v from (
  select distinct btrim(nombre) as v from public.user_access where btrim(nombre) <> ''
  union
  select distinct btrim("AGENTE") from public.leads where btrim("AGENTE") <> '' and btrim("AGENTE") <> 'SN'
) t
on conflict do nothing;

comment on constraint lead_catalogs_kind_check on public.lead_catalogs is 'Catalog kinds: mes, campana, medio, gestion and agente (advisor option lists only, not accounts).';

commit;

-- Rollback (manual, after review): restore the original 4-value CHECK and
-- re-run the 0009 versions of the three functions; delete kind='agente' rows
-- only if no advisor options must be kept. Lead data is unaffected either way.
-- Do not run this automatically against the remote project.

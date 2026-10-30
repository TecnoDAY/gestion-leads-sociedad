-- Admin-managed catalog lists for Mes, Campana, Medio and Gestion.
-- Values only drive filters and forms; leads are never modified by this table.
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

create table if not exists public.lead_catalogs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('mes', 'campana', 'medio', 'gestion')),
  value text not null check (length(btrim(value)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

alter table public.lead_catalogs enable row level security;

-- Read for active users; there is intentionally no INSERT/UPDATE/DELETE policy.
-- All mutations go through the admin-only RPCs below.
drop policy if exists "lead_catalogs_read_active_authorized" on public.lead_catalogs;
create policy "lead_catalogs_read_active_authorized"
on public.lead_catalogs for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.lead_catalogs from anon, authenticated;
revoke select on public.lead_catalogs from anon;
grant select on public.lead_catalogs to authenticated;

-- Seed: the 12 months in canonical order, so filters offer them with 0 leads.
insert into public.lead_catalogs (kind, value)
select 'mes', m
from (values ('ENERO'), ('FEBRERO'), ('MARZO'), ('ABRIL'), ('MAYO'), ('JUNIO'),
             ('JULIO'), ('AGOSTO'), ('SEPTIEMBRE'), ('OCTUBRE'), ('NOVIEMBRE'), ('DICIEMBRE')) as t(m)
on conflict do nothing;

-- Seed: current distinct values from leads (trimmed, matching filter comparisons).
insert into public.lead_catalogs (kind, value)
select 'campana', v from (
  select distinct btrim("Campaña") as v from public.leads where btrim("Campaña") <> ''
) t
on conflict do nothing;

insert into public.lead_catalogs (kind, value)
select 'medio', v from (
  select distinct btrim("Medio") as v from public.leads where btrim("Medio") <> ''
) t
on conflict do nothing;

insert into public.lead_catalogs (kind, value)
select 'gestion', v from (
  select distinct btrim("GESTION") as v from public.leads where btrim("GESTION") <> ''
) t
on conflict do nothing;

-- Add a value (or reactivate it if it already exists and was disabled). Admin only.
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
  if p_kind not in ('mes', 'campana', 'medio', 'gestion') then
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

-- Rename a value. Admin only. Leads keep their own text: renaming only changes
-- the label offered by filters and forms (no lead is reclassified).
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

-- Enable/disable a value. Admin only. Deactivation hides the value from filters
-- and forms; no lead row is touched.
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

revoke all on function public.create_lead_catalog(text, text) from public;
revoke all on function public.rename_lead_catalog(bigint, text) from public;
revoke all on function public.set_lead_catalog_active(bigint, boolean) from public;
grant execute on function public.create_lead_catalog(text, text) to authenticated;
grant execute on function public.rename_lead_catalog(bigint, text) to authenticated;
grant execute on function public.set_lead_catalog_active(bigint, boolean) to authenticated;

comment on table public.lead_catalogs is 'Admin-managed option lists for filters/forms; leads are never modified by this table.';
comment on function public.create_lead_catalog(text, text) is 'Admin-only: add a value or reactivate an existing one.';
comment on function public.rename_lead_catalog(bigint, text) is 'Admin-only label change; leads keep their own text (no reclassification).';
comment on function public.set_lead_catalog_active(bigint, boolean) is 'Admin-only enable/disable; deactivation only hides the value from filters and forms.';

commit;

-- Rollback (manual, after review): drop the three functions, the policy,
-- the grants and the lead_catalogs table. Lead data is unaffected either way.
-- Do not run this automatically against the remote project.

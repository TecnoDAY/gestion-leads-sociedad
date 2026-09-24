-- Secure OTP access, role checks and soft archiving for the leads dashboard.
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

create table if not exists public.user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  nombre text not null default '',
  role text not null default 'agente' check (role in ('admin', 'agente')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_access_email_normalized check (email = lower(btrim(email))),
  constraint user_access_email_length check (length(email) between 3 and 320)
);

create unique index if not exists user_access_email_idx on public.user_access (lower(email));
create index if not exists user_access_user_id_idx on public.user_access (user_id);

alter table public.user_access enable row level security;

create or replace function public.current_user_access()
returns public.user_access
language sql
stable
security definer
set search_path = public
as $$
  select * from public.user_access
  where user_id = auth.uid() and activo = true
  limit 1;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role = 'admin'
  );
$$;

revoke all on function public.current_user_access() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin_user() from public;
grant execute on function public.current_user_access() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin_user() to authenticated;

-- The application only needs the authenticated user's own access record.
drop policy if exists "user_access_read_self_or_admin" on public.user_access;
create policy "user_access_read_self_or_admin"
on public.user_access for select to authenticated
using (user_id = auth.uid() or public.is_admin_user());

-- Direct table writes are intentionally denied. User administration is a narrow admin RPC.
revoke insert, update, delete on public.user_access from anon, authenticated;
grant select on public.user_access to authenticated;

alter table public.leads add column if not exists updated_at timestamptz;
alter table public.leads add column if not exists archived_at timestamptz;
alter table public.leads add column if not exists archived_by uuid references auth.users(id) on delete set null;
create index if not exists leads_active_id_idx on public.leads (id) where archived_at is null;
create index if not exists leads_archived_at_idx on public.leads (archived_at) where archived_at is not null;

alter table public.leads enable row level security;

-- Remove the legacy public policies shipped in the old UI before installing the
-- authenticated read policy. There is intentionally no DELETE policy.
drop policy if exists "Permitir lectura para usuarios de plataforma" on public.leads;
drop policy if exists "Permitir insercion con validacion de nombre" on public.leads;
drop policy if exists "Permitir actualizacion para asesores autorizados" on public.leads;
drop policy if exists "Permitir borrado seguro solo para autenticados" on public.leads;
drop policy if exists "Acceso público API Dashboard" on public.leads;

drop policy if exists "leads_read_active_authorized" on public.leads;
create policy "leads_read_active_authorized"
on public.leads for select to authenticated
using (public.is_active_user() and archived_at is null);

revoke insert, update, delete on public.leads from anon, authenticated;
grant select on public.leads to authenticated;

create or replace function public.create_lead(p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.leads;
  access public.user_access;
begin
  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'lead_object_required';
  end if;
  if p_lead ?| array['id', 'archived_at', 'archived_by', 'created_at', 'updated_at'] then
    raise exception using errcode = '22023', message = 'protected_fields';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;

  insert into public.leads (
    "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION",
    "Ciudad", "Agente ", "OBSERVACIONES "
  ) values (
    left(coalesce(p_lead->>'Mes', ''), 40),
    left(coalesce(p_lead->>'Fecha', ''), 40),
    left(coalesce(p_lead->>'Nombre', ''), 200),
    left(coalesce(p_lead->>'Telefono', ''), 80),
    left(coalesce(p_lead->>'Campaña', ''), 120),
    left(coalesce(p_lead->>'Medio', ''), 80),
    left(coalesce(p_lead->>'GESTION', 'Información '), 80),
    left(coalesce(p_lead->>'Ciudad', ''), 120),
    case when access.role = 'admin' then left(coalesce(p_lead->>'Agente ', access.nombre), 120) else left(access.nombre, 120) end,
    left(coalesce(p_lead->>'OBSERVACIONES ', ''), 5000)
  ) returning * into created;

  return created;
end;
$$;

create or replace function public.update_lead_followup(p_id bigint, p_fields jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  access public.user_access;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_fields - array['GESTION', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES '] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;

  update public.leads
  set "GESTION" = left(coalesce(p_fields->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "ULTIMO AGENTE " = left(access.nombre, 120),
      "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return updated;
end;
$$;

create or replace function public.update_lead_full(p_id bigint, p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'lead_object_required';
  end if;
  if p_lead ?| array['id', 'archived_at', 'archived_by', 'created_at', 'updated_at'] then
    raise exception using errcode = '22023', message = 'protected_fields';
  end if;
  if p_lead - array[
    'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'Agente ',
    'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión ',
    'ULTIMA GESTION', 'OBSERVACIONES '
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'full_edit_fields_only';
  end if;

  update public.leads
  set "Mes" = left(coalesce(p_lead->>'Mes', "Mes"), 40),
      "Fecha" = left(coalesce(p_lead->>'Fecha', "Fecha"), 40),
      "Nombre" = left(coalesce(p_lead->>'Nombre', "Nombre"), 200),
      "Telefono" = left(coalesce(p_lead->>'Telefono', "Telefono"), 80),
      "Campaña" = left(coalesce(p_lead->>'Campaña', "Campaña"), 120),
      "Medio" = left(coalesce(p_lead->>'Medio', "Medio"), 80),
      "Ciudad" = left(coalesce(p_lead->>'Ciudad', "Ciudad"), 120),
      "Agente " = left(coalesce(p_lead->>'Agente ', "Agente "), 120),
      "Odoo" = left(coalesce(p_lead->>'Odoo', "Odoo"), 80),
      "Fecha de Atencion" = left(coalesce(p_lead->>'Fecha de Atencion', "Fecha de Atencion"), 40),
      "LANDING" = left(coalesce(p_lead->>'LANDING', "LANDING"), 500),
      "GESTION" = left(coalesce(p_lead->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_lead->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_lead->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "OBSERVACIONES " = left(coalesce(p_lead->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return updated;
end;
$$;

create or replace function public.archive_lead(p_id bigint)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  archived public.leads;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  update public.leads
  set archived_at = now(), archived_by = auth.uid(), updated_at = now()
  where id = p_id and archived_at is null
  returning * into archived;
  if archived.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return archived;
end;
$$;

create or replace function public.restore_lead(p_id bigint)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  restored public.leads;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  update public.leads
  set archived_at = null, archived_by = null, updated_at = now()
  where id = p_id and archived_at is not null
  returning * into restored;
  if restored.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return restored;
end;
$$;

create or replace function public.admin_manage_user_access(
  p_action text,
  p_user_id uuid default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'email', email, 'nombre', nombre, 'role', role, 'activo', activo
    ) order by lower(email)), '[]'::jsonb)
    into result
    from public.user_access;
    return result;
  elsif p_action = 'set_active' and p_user_id is not null then
    update public.user_access set activo = coalesce(p_activo, false), updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception using errcode = 'P0002', message = 'user_not_found'; end if;
    return jsonb_build_object('user_id', p_user_id, 'activo', coalesce(p_activo, false));
  end if;

  raise exception using errcode = '22023', message = 'unsupported_user_action';
end;
$$;

revoke all on function public.create_lead(jsonb) from public;
revoke all on function public.update_lead_followup(bigint, jsonb) from public;
revoke all on function public.update_lead_full(bigint, jsonb) from public;
revoke all on function public.archive_lead(bigint) from public;
revoke all on function public.restore_lead(bigint) from public;
revoke all on function public.admin_manage_user_access(text, uuid, boolean) from public;
grant execute on function public.create_lead(jsonb) to authenticated;
grant execute on function public.update_lead_followup(bigint, jsonb) to authenticated;
grant execute on function public.update_lead_full(bigint, jsonb) to authenticated;
grant execute on function public.archive_lead(bigint) to authenticated;
grant execute on function public.restore_lead(bigint) to authenticated;
grant execute on function public.admin_manage_user_access(text, uuid, boolean) to authenticated;

comment on table public.user_access is 'Allowlist and role authority; app_user_metadata is not trusted.';
comment on function public.update_lead_followup(bigint, jsonb) is 'Agents may update only GESTION, Fecha Última Gestión, ULTIMA GESTION and OBSERVACIONES; ULTIMO AGENTE is assigned server-side.';
comment on function public.archive_lead(bigint) is 'Soft archive; there is no public DELETE policy.';
comment on function public.admin_manage_user_access(text, uuid, boolean) is 'Admin-only listing and activation changes; provisioning belongs in authorize-user.';

commit;

-- Rollback (manual, after review): revoke the new RPCs, drop the new policies,
-- remove archived_at/archived_by and user_access only if no data must be kept.
-- Do not run this automatically against the remote project.

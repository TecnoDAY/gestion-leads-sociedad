-- ============================================================================
-- Contactos unicos por telefono (dedup) - Fase 1: estructura aditiva
--
-- Objetivo (odd/tasks/contactos-telefonos-unicos.md): el telefono normalizado
-- existe una unica vez como contacto y cada lead se liga a el. leads se sigue
-- gestionando igual: misma persona desde otra campana = lead nuevo ligado al
-- MISMO contacto. Nadie borra ni fusiona nada.
--
-- Decision clave: un trigger BEFORE INSERT OR UPDATE OF "Telefono" en lugar de
-- reescribir create_lead. Asi no se toca ninguna funcion desplegada (evita
-- pisar cambios que el humano pueda tener aplicados por fuera del repo) y la
-- regla cubre TODOS los caminos de escritura (RPC, dashboard, importaciones).
-- Reversible por completo: drop trigger + drop column contact_id + drop table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla de contactos: un telefono normalizado unico (solo digitos, 7-15)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_contacts (
  id bigint generated always as identity primary key,
  phone_normalized text not null,
  phone_display text not null default '',
  nombre text not null default '',
  ciudad text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_contacts_phone_key unique (phone_normalized),
  constraint lead_contacts_phone_digits check (phone_normalized ~ '^[0-9]{7,15}$')
);

comment on table public.lead_contacts is 'Contacto unico por telefono normalizado. Fase 1 de dedup: leads conserva su columna "Telefono"; la retirada es una fase posterior tras verificacion.';

alter table public.lead_contacts enable row level security;

drop policy if exists lead_contacts_read_active_authorized on public.lead_contacts;
create policy lead_contacts_read_active_authorized
  on public.lead_contacts
  for select to authenticated
  using (public.is_active_user());

-- Lectura solo para usuarios activos; escritura exclusiva por funciones del sistema
revoke all on public.lead_contacts from anon, authenticated;
grant select on public.lead_contacts to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enlace desde leads
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists contact_id bigint
  references public.lead_contacts(id) on delete set null;

create index if not exists leads_contact_id_idx on public.leads(contact_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: el contacto canonico por telefono es el lead mas antiguo
--    (4.953 telefonos validos detectados en la auditoria previa)
-- ---------------------------------------------------------------------------
insert into public.lead_contacts (phone_normalized, phone_display, nombre, ciudad)
select distinct on (s.phone_norm)
       s.phone_norm,
       left(coalesce(s."Telefono", ''), 80),
       left(coalesce(s."Nombre", ''), 200),
       left(coalesce(s."Ciudad", ''), 120)
from (
  select nullif(regexp_replace(coalesce(l."Telefono", ''), '[^0-9]', '', 'g'), '') as phone_norm,
         l."Telefono", l."Nombre", l."Ciudad", l.created_at, l.id
  from public.leads l
) s
where s.phone_norm ~ '^[0-9]{7,15}$'
order by s.phone_norm, s.created_at asc nulls last, s.id asc
on conflict (phone_normalized) do nothing;

update public.leads l
set contact_id = c.id
from public.lead_contacts c
where l.contact_id is null
  and nullif(regexp_replace(coalesce(l."Telefono", ''), '[^0-9]', '', 'g'), '') = c.phone_normalized;

-- ---------------------------------------------------------------------------
-- 4. Helper: encuentra o crea el contacto por telefono (atomico).
--    Nunca sobrescribe nombre/ciudad conocidos: solo rellena campos vacios.
-- ---------------------------------------------------------------------------
create or replace function public.lead_contact_id_for(p_phone text, p_nombre text default '', p_ciudad text default '')
returns bigint
language plpgsql
security definer
set search_path to public
as $fn$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_id bigint;
begin
  if v_phone is null or v_phone !~ '^[0-9]{7,15}$' then
    return null;
  end if;

  insert into public.lead_contacts (phone_normalized, phone_display, nombre, ciudad, created_by)
  values (v_phone, left(coalesce(p_phone, ''), 80), left(coalesce(p_nombre, ''), 200), left(coalesce(p_ciudad, ''), 120), auth.uid())
  on conflict (phone_normalized) do nothing;

  update public.lead_contacts
  set nombre        = case when nombre = '' and coalesce(p_nombre, '') <> '' then left(p_nombre, 200) else nombre end,
      ciudad        = case when ciudad = '' and coalesce(p_ciudad, '') <> '' then left(p_ciudad, 120) else ciudad end,
      phone_display = case when phone_display = '' and coalesce(p_phone, '') <> '' then left(p_phone, 80) else phone_display end,
      updated_at    = now()
  where phone_normalized = v_phone;

  select id into v_id from public.lead_contacts where phone_normalized = v_phone;
  return v_id;
end;
$fn$;

comment on function public.lead_contact_id_for(text, text, text) is 'Encuentra o crea el contacto por telefono normalizado (7-15 digitos). Solo rellena campos vacios; uso interno desde triggers.';

revoke all on function public.lead_contact_id_for(text, text, text) from public;
revoke all on function public.lead_contact_id_for(text, text, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Trigger: liga contact_id en cada alta y cuando cambie el Telefono
-- ---------------------------------------------------------------------------
create or replace function public.leads_set_contact_id()
returns trigger
language plpgsql
security definer
set search_path to public
as $fn$
begin
  NEW.contact_id := public.lead_contact_id_for(NEW."Telefono", NEW."Nombre", NEW."Ciudad");
  return NEW;
end;
$fn$;

revoke all on function public.leads_set_contact_id() from public;
revoke all on function public.leads_set_contact_id() from anon, authenticated;

drop trigger if exists leads_set_contact_id on public.leads;
create trigger leads_set_contact_id
before insert or update of "Telefono" on public.leads
for each row execute function public.leads_set_contact_id();

-- ---------------------------------------------------------------------------
-- 6. Asertos: los conteos deben cuadrar o se aborta con rollback total
-- ---------------------------------------------------------------------------
do $blk$
declare
  v_validos_distintos bigint;
  v_leads_validos bigint;
  v_contactos bigint;
  v_ligados bigint;
  v_total_leads bigint;
begin
  select count(distinct s.phone), count(s.phone)
    into v_validos_distintos, v_leads_validos
  from (
    select nullif(regexp_replace(coalesce("Telefono", ''), '[^0-9]', '', 'g'), '') as phone
    from public.leads
  ) s
  where s.phone ~ '^[0-9]{7,15}$';

  select count(*) into v_contactos from public.lead_contacts;
  select count(*) into v_ligados from public.leads where contact_id is not null;
  select count(*) into v_total_leads from public.leads;

  if v_contactos <> v_validos_distintos or v_ligados <> v_leads_validos then
    raise exception using errcode = 'P0001',
      message = 'conteo_inconsistente_contactos: contactos=' || v_contactos ||
                ' esperados=' || v_validos_distintos ||
                ' ligados=' || v_ligados || ' esperados=' || v_leads_validos;
  end if;

  raise notice 'contactos=% ligados=% total_leads=%', v_contactos, v_ligados, v_total_leads;
end
$blk$;

-- Gestion por canal: cada guardado de seguimiento crea una gestion reportable
-- (un cambio de ULTIMA GESTION cuenta aunque GESTION no cambie) y el dashboard
-- deduplica leads con Set(lead_id). Un trigger BEFORE fija fecha y asesor en
-- servidor. Data Dura se persiste en la cita como booleano para excluirla del
-- KPI de agendados. La version vigente de record_lead_gestion es la reaplicada
-- por 202609300005 (ultima migracion por orden y confirmada por git log).
begin;

create or replace function public.record_lead_gestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare autor text;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(nombre, '') into autor from public.user_access where user_id = auth.uid();
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id)
  values (new.id, (now() at time zone 'America/New_York')::date, old."GESTION", new."GESTION", new."ULTIMA GESTION", coalesce(autor, ''), auth.uid());
  return new;
end;
$$;

drop trigger if exists leads_record_gestion on public.leads;
create trigger leads_record_gestion
after update of "GESTION", "ULTIMA GESTION", "OBSERVACIONES " on public.leads
for each row
execute function public.record_lead_gestion();

-- Solo actores humanos autenticados; service role/migraciones no alteran metadatos.
create or replace function public.set_lead_gestion_meta()
returns trigger language plpgsql security definer set search_path = public as $$
declare meta_nombre text;
begin
  if auth.uid() is null then return new; end if;
  new."Fecha Última Gestión " := to_char(now() at time zone 'America/New_York', 'DD/MM/YYYY');
  select coalesce(nullif(btrim(ua.nombre), ''), old."ULTIMO AGENTE ") into meta_nombre
  from public.user_access ua where ua.user_id = auth.uid() limit 1;
  new."ULTIMO AGENTE " := coalesce(meta_nombre, old."ULTIMO AGENTE ");
  return new;
end;
$$;

drop trigger if exists leads_set_gestion_meta on public.leads;
create trigger leads_set_gestion_meta
before update of "GESTION", "ULTIMA GESTION", "OBSERVACIONES "
on public.leads
for each row
execute function public.set_lead_gestion_meta();

alter table if exists public.lead_appointments
  add column if not exists is_data_dura boolean not null default false;
comment on column public.lead_appointments.is_data_dura is
  'Indicates that the appointment was created from an AGENDADO DATA DURA lead.';

create or replace function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  created public.lead_appointments;
  access public.user_access;
  advisor public.user_access;
  lead_record public.leads;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into lead_record from public.leads where id = p_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  if upper(btrim(coalesce(lead_record."GESTION", ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  select * into advisor from public.user_access
  where user_id = case when access.role = 'admin' and p_advisor_user_id is not null then p_advisor_user_id else access.user_id end
    and activo = true and role in ('admin', 'agente', 'supervisor')
  for share;
  if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id, is_data_dura)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid(),
    upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATA DURA%'
    or upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATADURA%') returning * into created;
  return created;
end;
$$;

revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid) from public, anon;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid) to authenticated;

commit;

-- Rollback manual: restaurar record_lead_gestion, leads_record_gestion y
-- create_lead_appointment desde la migracion vigente anterior; eliminar
-- leads_set_gestion_meta y is_data_dura solo tras revisar dependencias.

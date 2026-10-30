-- T6: integridad local; revisar antes de aplicar remotamente.
begin;

-- Reutilizar el INSERT canonico sin un bypass configurable por el cliente.
-- Solo los wrappers SECURITY DEFINER pueden ejecutar el helper de creacion.
do $create_lead_guard$
declare
  -- MD5 del prosrc canonico de 202609290001 y del wrapper de esta migracion,
  -- normalizando solo whitespace. Nunca aceptar un helper por nombre solamente.
  canonical_body_md5 constant text := '63066106f043b70de23da53e4ae2d050';
  wrapper_body_md5 constant text := 'f3e5d5bfbf208fa5713d64377e31068a';
  helper_oid oid := to_regprocedure('public.create_lead_record(jsonb)');
  wrapper_oid oid := to_regprocedure('public.create_lead(jsonb)');
  target pg_catalog.pg_proc%rowtype;
  expected_body_md5 text;
begin
  if current_user <> 'postgres' then
    raise exception using message = 'backend_integrity_owner_required';
  end if;
  if wrapper_oid is null then
    raise exception using message = 'create_lead_missing';
  end if;
  for target in select p.* from pg_catalog.pg_proc p
    where p.oid = any(array[coalesce(helper_oid, wrapper_oid), wrapper_oid])
  loop
    expected_body_md5 := case when target.oid = helper_oid or helper_oid is null then canonical_body_md5 else wrapper_body_md5 end;
    if target.proowner <> 'postgres'::regrole
       or target.prolang <> (select oid from pg_catalog.pg_language where lanname = 'plpgsql')
       or target.prokind <> 'f' or target.prorettype <> 'public.leads'::regtype
       or target.proretset or not target.prosecdef
       or target.proargnames is distinct from array['p_lead']::text[]
       or target.pronargdefaults <> 0 or target.provariadic <> 0 or target.proisstrict
       or target.provolatile <> 'v' or target.proparallel <> 'u'
       or target.proconfig is distinct from array['search_path=public']::text[]
       or md5(btrim(regexp_replace(target.prosrc, '[[:space:]]+', ' ', 'g'))) <> expected_body_md5 then
      raise exception using message = 'create_lead_definition_drift';
    end if;
  end loop;
  if helper_oid is null then
    alter function public.create_lead(jsonb) rename to create_lead_record;
  else
    -- Reejecucion: el helper sigue siendo INSERT y el wrapper ya es el esperado.
    -- Renombrar aqui el wrapper produciria recursion: abortar ante cualquier drift.
    if exists (select 1 from pg_catalog.pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = helper_oid and a.grantee <> p.proowner) then
      raise exception using message = 'create_lead_helper_acl_drift';
    end if;
    if exists (select 1 from pg_catalog.pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = wrapper_oid and a.grantee <> p.proowner
        and (a.grantee <> 'authenticated'::regrole or a.privilege_type <> 'EXECUTE' or a.is_grantable))
      or not exists (select 1 from pg_catalog.pg_proc p,
        lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = wrapper_oid and a.grantee = 'authenticated'::regrole and a.privilege_type = 'EXECUTE') then
      raise exception using message = 'create_lead_wrapper_acl_drift';
    end if;
  end if;
end;
$create_lead_guard$;
revoke all on function public.create_lead_record(jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_lead(p_lead jsonb)
returns public.leads language plpgsql security definer set search_path = public as $$
begin
  if not public.is_crm_user() then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;
  return public.create_lead_record(p_lead);
end;
$$;

create or replace function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.leads language plpgsql security definer set search_path = public as $$
declare created public.leads;
begin
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if jsonb_typeof(p_lead) is distinct from 'object' then raise exception using errcode = '22023', message = 'lead_object_required'; end if;
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  created := public.create_lead_record(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return created;
end;
$$;

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
  -- La lista es la del helper is_crm_user (incluye supervisor, nunca trafficker).
  select * into advisor from public.user_access
  where user_id = case when access.role = 'admin' and p_advisor_user_id is not null then p_advisor_user_id else access.user_id end
    and activo = true and role in ('admin', 'agente', 'supervisor')
  for share;
  if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid()) returning * into created;
  return created;
end;
$$;

-- Orden de locks compartido con update_lead_with_appointment: lead, luego cita.
create or replace function public.set_lead_appointment_status(p_id bigint, p_status text, p_notes text default '')
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare updated public.lead_appointments; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_status is null or p_status not in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA') then raise exception using errcode = '22023', message = 'invalid_status'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid());
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and lead_id = target_lead_id and (public.is_admin_user() or advisor_user_id = auth.uid()) for update;
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
declare old_appointment public.lead_appointments; created public.lead_appointments; new_notes text; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid());
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into old_appointment from public.lead_appointments
  where id = p_id and lead_id = target_lead_id and (public.is_admin_user() or advisor_user_id = auth.uid()) and status = 'PROGRAMADA' for update;
  if old_appointment.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  perform 1 from public.user_access where user_id = old_appointment.advisor_user_id
    and activo = true and role in ('admin', 'agente', 'supervisor') for share;
  if not found then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  new_notes := case when coalesce(p_notes, '') = '' then old_appointment.notes else p_notes end;
  update public.lead_appointments set status = 'REPROGRAMADA', resolved_at = now(), updated_at = now() where id = p_id;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id, created_by_user_id)
  values (old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name, new_notes, p_id, auth.uid()) returning * into created;
  return created;
end;
$$;

create or replace function public.upsert_daily_report_note(p_report_date date, p_autor_name text, p_problemas text, p_observaciones text)
returns public.daily_report_notes language plpgsql security definer set search_path = public as $$
declare
  access public.user_access;
  miami_today date;
  target_name text;
  target_user_id uuid;
  existing public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_report_date is null then raise exception using errcode = '22023', message = 'report_date_required'; end if;
  miami_today := (now() at time zone 'America/New_York')::date;
  target_name := coalesce(nullif(btrim(p_autor_name), ''), access.nombre);
  if access.role <> 'admin' then
    if target_name <> access.nombre or p_report_date <> miami_today then
      raise exception using errcode = '42501', message = 'own_note_today_required';
    end if;
    target_user_id := access.user_id;
  else
    -- El contrato sigue recibiendo nombre; nunca escoger un homonimo arbitrario.
    begin
      select user_id into strict target_user_id from public.user_access
      where btrim(nombre) = target_name and activo = true for share;
    exception
      when no_data_found then raise exception using errcode = 'P0002', message = 'advisor_not_found';
      when too_many_rows then raise exception using errcode = '22023', message = 'advisor_name_ambiguous';
    end;
    if target_user_id is null then raise exception using errcode = 'P0002', message = 'advisor_not_found'; end if;
  end if;
  insert into public.daily_report_notes (report_date, autor_name, autor_user_id, problemas, observaciones, updated_at)
  values (p_report_date, target_name, target_user_id, left(coalesce(p_problemas, ''), 5000), left(coalesce(p_observaciones, ''), 5000), now())
  on conflict (report_date, autor_user_id) do update
  set problemas = excluded.problemas, observaciones = excluded.observaciones, autor_name = excluded.autor_name, updated_at = now()
  returning * into existing;
  return existing;
end;
$$;

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

create or replace function public.sync_user_access_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target text := lower(btrim(new.email));
begin
  if target is not distinct from lower(btrim(old.email)) then return new; end if;
  -- Un conflicto UNIQUE/NOT NULL aborta tambien Auth: ambos correos cambian o ninguno.
  update public.user_access set email = target, updated_at = now()
  where user_id = new.id and email is distinct from target;
  return new;
end;
$$;

-- Marca privada durable: desactivar/demover/borrar al admin no reabre bootstrap.
do $bootstrap_guard$
declare bootstrap_oid oid;
begin
  if to_regclass('public.authorize_bootstrap') is null then
    create table if not exists public.authorize_bootstrap (
      singleton boolean primary key default true check (singleton),
      created_at timestamptz not null default now()
    );
    alter table public.authorize_bootstrap enable row level security;
    revoke all on public.authorize_bootstrap from public, anon, authenticated, service_role;
  end if;
  bootstrap_oid := to_regclass('public.authorize_bootstrap');
  -- Validar tambien en reejecucion; no reparar silenciosamente una tabla ajena,
  -- no desactivar RLS y no borrar/recrear la marca durable ni su created_at.
  if not exists (select 1 from pg_catalog.pg_class c where c.oid = bootstrap_oid
       and c.relkind = 'r' and c.relowner = 'postgres'::regrole
       and c.relrowsecurity and not c.relforcerowsecurity
       and c.relpersistence = 'p' and not c.relispartition and not c.relhasrules)
     or (select count(*) from pg_catalog.pg_attribute where attrelid = bootstrap_oid and attnum > 0) <> 2
     or (select count(*) from pg_catalog.pg_attribute a
         join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
         join (values (1, 'singleton', 'boolean'::regtype, 'true'),
                      (2, 'created_at', 'timestamptz'::regtype, 'now()'))
              expected(num, name, type_oid, default_expr)
           on a.attnum = expected.num and a.attname = expected.name and a.atttypid = expected.type_oid
         where a.attrelid = bootstrap_oid and a.attnotnull and not a.attisdropped
           and a.attidentity = '' and a.attgenerated = '' and a.atttypmod = -1
           and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = expected.default_expr) <> 2
     or (select count(*) from pg_catalog.pg_constraint where conrelid = bootstrap_oid) <> 2
     or not exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = bootstrap_oid
           and c.convalidated and not c.condeferrable and not c.condeferred
           and c.conkey = array[1]::smallint[]
           and c.contype = 'p' and pg_catalog.pg_get_constraintdef(c.oid, true) = 'PRIMARY KEY (singleton)')
     or not exists (select 1 from pg_catalog.pg_constraint c where c.conrelid = bootstrap_oid
           and c.convalidated and not c.condeferrable and not c.condeferred
           and c.conkey = array[1]::smallint[]
           and c.contype = 'c' and pg_catalog.pg_get_constraintdef(c.oid, true) = 'CHECK (singleton)')
     or exists (select 1 from pg_catalog.pg_policy where polrelid = bootstrap_oid)
     or exists (select 1 from pg_catalog.pg_trigger where tgrelid = bootstrap_oid and not tgisinternal)
     or exists (select 1 from pg_catalog.pg_inherits where inhrelid = bootstrap_oid or inhparent = bootstrap_oid)
     or exists (select 1 from pg_catalog.pg_class c,
         lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         where c.oid = bootstrap_oid and a.grantee <> c.relowner)
     or exists (select 1 from pg_catalog.pg_attribute a,
         lateral aclexplode(a.attacl) acl
         where a.attrelid = bootstrap_oid and acl.grantee <> 'postgres'::regrole) then
    raise exception using message = 'authorize_bootstrap_schema_drift';
  end if;
end;
$bootstrap_guard$;
insert into public.authorize_bootstrap (singleton)
select true where exists (select 1 from public.user_access where role = 'admin')
on conflict (singleton) do nothing;

create or replace function public.bootstrap_admin_user(p_user_id uuid, p_email text, p_nombre text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_email text := lower(btrim(p_email)); provisioned uuid;
begin
  -- Verificar el rol real de la conexion Y el claim; no basta con los grants.
  -- El token de bootstrap se valida exclusivamente en la Edge Function.
  if current_setting('role', true) is distinct from 'service_role'
     or auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  -- Serializa tambien frente a las altas normales; no hay count-then-upsert externo.
  lock table public.user_access in share row exclusive mode;
  if exists (select 1 from public.authorize_bootstrap)
     or exists (select 1 from public.user_access where role = 'admin') then return false; end if;
  -- Preflight de servicio: evita invitaciones tras cerrar bootstrap. No reserva
  -- el alta; la llamada con identidad vuelve a comprobar todo bajo el lock.
  if p_user_id is null then return true; end if;
  if not exists (select 1 from auth.users where id = p_user_id and lower(btrim(email)) = target_email) then
    raise exception using errcode = '22023', message = 'auth_user_email_mismatch';
  end if;
  insert into public.user_access (user_id, email, nombre, role, activo, updated_at)
  values (p_user_id, target_email, left(coalesce(p_nombre, ''), 120), 'admin', true, now())
  on conflict (email) do update set user_id = excluded.user_id, nombre = excluded.nombre, role = 'admin', activo = true, updated_at = now()
  where public.user_access.user_id is null or public.user_access.user_id = excluded.user_id
  returning user_id into provisioned;
  if provisioned is null then raise exception using errcode = '22023', message = 'access_identity_conflict'; end if;
  insert into public.authorize_bootstrap (singleton) values (true);
  return true;
end;
$$;

revoke all on function public.bootstrap_admin_user(uuid, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_admin_user(uuid, text, text) to service_role;
revoke all on function public.create_lead(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_lead(jsonb) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid) from public, anon;
revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid) from public, anon;
revoke all on function public.set_lead_appointment_status(bigint, text, text) from public, anon;
revoke all on function public.reschedule_lead_appointment(bigint, timestamptz, text) from public, anon;
revoke all on function public.upsert_daily_report_note(date, text, text, text) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid) to authenticated;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid) to authenticated;
grant execute on function public.set_lead_appointment_status(bigint, text, text) to authenticated;
grant execute on function public.reschedule_lead_appointment(bigint, timestamptz, text) to authenticated;
grant execute on function public.upsert_daily_report_note(date, text, text, text) to authenticated;

commit;

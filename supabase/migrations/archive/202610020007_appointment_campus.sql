-- Sede de la cita (Doral/Weston) separada del estado de gestion y de Data Dura.
-- Decision (odd/tasks/cita-sede-doral-weston.md): un lead puede llegar por una
-- campaña de Weston y ser agendado en Doral; la sede pertenece a la cita, no al
-- estado ni a la campaña de origen. Las citas existentes quedan con campus NULL
-- y se muestran como "Sin sede" (no se inventa informacion). Las firmas RPC
-- anteriores se conservan como wrappers durante la transicion para no romper
-- clientes desactualizados; la interfaz nueva siempre exige Doral o Weston.
begin;

alter table if exists public.lead_appointments
  add column if not exists campus text;
alter table public.lead_appointments drop constraint if exists lead_appointments_campus_check;
alter table public.lead_appointments
  add constraint lead_appointments_campus_check check (campus in ('DORAL', 'WESTON'));
comment on column public.lead_appointments.campus is 'Sede acordada de la cita (Doral o Weston); NULL solo en citas creadas antes de esta funcionalidad.';

-- RPC central con sede (sin default: la firma vieja queda como wrapper beta cerrado
-- tras la transicion; POSTGREST elige la de 6 argumentos cuando la UI la envia).
drop function if exists public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb);
create function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.lead_appointments language sql security definer set search_path = public as $$
  select public.create_lead_appointment(p_lead_id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;
create or replace function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text, p_advisor_user_id uuid, p_details jsonb, p_campus text)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  created public.lead_appointments;
  access public.user_access;
  advisor public.user_access;
  lead_record public.leads;
  d jsonb := public._appointment_details(p_details);
  v_campus text := nullif(upper(btrim(coalesce(p_campus, ''))), '');
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  if v_campus is not null and v_campus not in ('DORAL', 'WESTON') then raise exception using errcode = '22023', message = 'campus_invalid'; end if;
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
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id, is_data_dura, student_name, contact_email, student_age, campus)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid(),
    upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATA DURA%'
    or upper(btrim(coalesce(lead_record."GESTION", ''))) like 'AGENDAD%DATADURA%',
    d->>'student_name', d->>'contact_email', (d->>'student_age')::smallint, v_campus) returning * into created;
  return created;
end;
$$;

-- Wrapper compatible: la alta atomica sin sede sigue funcionando durante la transicion.
drop function if exists public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb);
create function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.leads language sql security definer set search_path = public as $$
  select public.create_lead_with_appointment(p_lead, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;
create or replace function public.create_lead_with_appointment(p_lead jsonb, p_scheduled_at timestamptz, p_notes text, p_advisor_user_id uuid, p_details jsonb, p_campus text)
returns public.leads language plpgsql security definer set search_path = public as $$
declare created public.leads;
begin
  created := public.create_lead(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return created;
end;
$$;

-- Actualizar a Agendado con cita: igual que la version vigente pero con sede,
-- manteniendo el wrapper anterior mientras queda alguna sesion antigua.
drop function if exists public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid, jsonb);
create function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb default '{}'::jsonb)
returns public.leads language sql security definer set search_path = public as $$
  select public.update_lead_with_appointment(p_id, p_fields, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;
create or replace function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text, p_advisor_user_id uuid, p_details jsonb, p_campus text)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_scheduled_at is null then
    raise exception using errcode = '22023', message = 'scheduled_at_required';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'notes_too_long';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then raise exception using errcode = '22023', message = 'telefono_invalido'; end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', '')));
  if previous_gestion like 'AGENDAD%' or next_gestion not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'agendado_transition_required';
  end if;

  if access.role = 'admin' then
    if p_fields - array[
      'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
      'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '
    ] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'full_edit_fields_only';
    end if;
    update public.leads
    set "Mes" = left(coalesce(p_fields->>'Mes', "Mes"), 40),
        "Fecha" = left(coalesce(p_fields->>'Fecha', "Fecha"), 40),
        "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
        "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
        "Campaña" = left(coalesce(p_fields->>'Campaña', "Campaña"), 120),
        "Medio" = left(coalesce(p_fields->>'Medio', "Medio"), 80),
        "Ciudad" = left(coalesce(p_fields->>'Ciudad', "Ciudad"), 120),
        "AGENTE" = left(coalesce(p_fields->>'AGENTE', p_fields->>'Agente', p_fields->>'Agente ', "AGENTE"), 120),
        "Odoo" = left(coalesce(p_fields->>'Odoo', "Odoo"), 80),
        "Fecha de Atencion" = left(coalesce(p_fields->>'Fecha de Atencion', "Fecha de Atencion"), 40),
        "LANDING" = left(coalesce(p_fields->>'LANDING', "LANDING"), 500),
        "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
    if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'followup_fields_only';
    end if;
    update public.leads
    set "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
        "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
       "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "ULTIMO AGENTE " = left(access.nombre, 120),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return updated;
end;
$$;

-- Reschedule: conserva tambien la sede acordada (antes se perdia sin campo).
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
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id, created_by_user_id, is_data_dura, student_name, contact_email, student_age, campus)
  values (old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name, new_notes, p_id, auth.uid(), old_appointment.is_data_dura, old_appointment.student_name, old_appointment.contact_email, old_appointment.student_age, old_appointment.campus) returning * into created;
  return created;
end;
$$;

-- Correccion de sede (asesora asignada o admin), sin tocar fecha ni estado.
create or replace function public.update_lead_appointment_campus(p_id bigint, p_campus text)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  updated public.lead_appointments;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if upper(btrim(coalesce(p_campus, ''))) not in ('DORAL', 'WESTON') then raise exception using errcode = '22023', message = 'campus_invalid'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid())
  for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments
  set campus = upper(btrim(p_campus)), updated_at = now()
  where id = p_id
  returning * into updated;
  return updated;
end;
$$;

revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb, text) from public, anon;
grant execute on function public.create_lead_appointment(bigint, timestamptz, text, uuid, jsonb, text) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb) to authenticated;
revoke all on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb, text) from public, anon;
grant execute on function public.create_lead_with_appointment(jsonb, timestamptz, text, uuid, jsonb, text) to authenticated;
revoke all on function public.update_lead_appointment_campus(bigint, text) from public, anon;
grant execute on function public.update_lead_appointment_campus(bigint, text) to authenticated;
revoke all on function public.reschedule_lead_appointment(bigint, timestamptz, text) from public, anon;
grant execute on function public.reschedule_lead_appointment(bigint, timestamptz, text) to authenticated;

-- Reporte Diario: los agendados se desglosan por sede. Definition completa de la
-- funcion tomada de la vigente (202610020001) mas 4 contadores nuevos; total
-- agendados conserva la misma semantica (cita PROGRAMADA una sola vez).
create or replace function public.daily_management_report(p_fecha date, p_autor_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result jsonb;
begin
  if p_fecha is null then raise exception using errcode='22023', message='report_date_required'; end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name), '') as name from lead_gestiones g where g.fecha_gestion=p_fecha
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name), '') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha
      union all select ua.user_id, ua.nombre from user_access ua where ua.activo and ua.role in ('admin','agente','supervisor')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name), '') as name from lead_gestiones g where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name), '') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha and a.advisor_user_id is null
    ) n where name is not null group by name
  ), filtered as (select * from people where p_autor_user_id is null or user_id=p_autor_user_id),
  gest as (
    select g.id, g.autor_user_id, nullif(btrim(g.autor_name, ''), '') as autor_name,
      lower(btrim(coalesce(l."Medio", ''))) medio,
      lower(btrim(coalesce(g.canal, ''))) canal,
      g.is_data_dura,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g left join leads l on l.id = g.lead_id
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, '')))) as gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%') as inscritos_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_fecha)) as inscritos_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('whatsapp','whatsapp nuevo')) as p_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('instagram','comentarios de red')) as p_fb_ig,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio = 'cognitalkign') as p_cognitalking,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('lead directo','referido','referidos andres')) as p_directo,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(medio, '') not in ('whatsapp','whatsapp nuevo','instagram','comentarios de red','cognitalkign','lead directo','referido','referidos andres')) as p_otros,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and not a.is_data_dura) as ag_dia,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.is_data_dura) as ag_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'DORAL' and not a.is_data_dura) as ag_doral,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'DORAL' and a.is_data_dura) as ag_doral_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'WESTON' and not a.is_data_dura) as ag_weston,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.campus = 'WESTON' and a.is_data_dura) as ag_weston_dd,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'ASISTIO') as visits,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'NO_ASISTIO') as absent,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'CANCELADA') as cancelled,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'REPROGRAMADA') as rescheduled
    from filtered f left join user_access ua on ua.user_id = f.user_id
  ),
  shaped as (
    select jsonb_build_object(
      'autor_user_id', blocks.user_id,
      'autor_name', blocks.author,
      'procedencia', jsonb_build_object(
        'WhatsApp', blocks.p_whatsapp,
        'Facebook/Instagram', blocks.p_fb_ig,
        'CogniTalking', blocks.p_cognitalking,
        'Directo o Referido', blocks.p_directo,
        'Otros', blocks.p_otros),
      'llamadas', jsonb_build_object(
        'del_dia', blocks.llam_dia,
        'data_dura', blocks.llam_dd,
        'llamada_whatsapp', blocks.llam_wa,
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa),
      'citas', jsonb_build_object(
        'agendados_dia', blocks.ag_dia,
        'agendados_data_dura', blocks.ag_dd,
        'agendados_doral', blocks.ag_doral,
        'agendados_doral_data_dura', blocks.ag_doral_dd,
        'agendados_weston', blocks.ag_weston,
        'agendados_weston_data_dura', blocks.ag_weston_dd,
        'total_agendados', blocks.ag_dia + blocks.ag_dd,
        'visitas', blocks.visits,
        'no_asistieron', blocks.absent,
        'canceladas', blocks.cancelled,
        'reprogramadas', blocks.rescheduled),
      'inscritos', jsonb_build_object(
        'del_dia', blocks.inscritos_dia - blocks.inscritos_dd,
        'data_dura', blocks.inscritos_dd,
        'total', blocks.inscritos_dia),
      'gestionados', blocks.gestionados
    ) as block
    from blocks
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'asesoras', coalesce((select jsonb_agg(blk order by blk->>'autor_name') from (select block as blk from shaped) q), '[]'::jsonb),
    'total', jsonb_build_object('gestionados', coalesce((select sum((blk->>'gestionados')::int) from (select block as blk from shaped) q), 0))
  ) into result;
  return result;
end;
$$;

revoke all on function public.daily_management_report(date, uuid) from public, anon;
grant execute on function public.daily_management_report(date, uuid) to authenticated;

commit;

-- Rollback manual: restaurar create_lead_appointment de 202610020002,
-- create_lead_with_appointment de 202609300005, reschedule y reporte de
-- 202610020001, eliminar update_lead_appointment_campus y la columna campus.

-- Canal manual "Llamada Data Dura" + Telefono editable por asesoras.
-- Decision (odd/tasks/canal-datadura-telefono.md): la asesora selecciona manualmente
-- el tipo de gestion; "Llamada Data Dura" se persiste en leads."ULTIMA GESTION" y el
-- trigger la normaliza a lead_gestiones.canal='Llamada' + is_data_dura=true. Los
-- historicos (is_data_dura NULL) conservan la regla por Mes/Fecha en el reporte.
begin;

alter table if exists public.lead_gestiones
  add column if not exists is_data_dura boolean;
comment on column public.lead_gestiones.is_data_dura is
  'Marca manual: true = Llamada Data Dura, false = Llamada normal en gestiones nuevas, null = historico (el reporte aplica la regla por Mes/Fecha).';

-- Trigger: normaliza "Llamada Data Dura" a canal Llamada con marca explicita.
create or replace function public.record_lead_gestion()
returns trigger language plpgsql security definer set search_path = public as $$
declare autor text; v_canal text; v_dd boolean;
begin
  if auth.uid() is null then return new; end if;
  select coalesce(nombre, '') into autor from public.user_access where user_id = auth.uid();
  v_canal := new."ULTIMA GESTION";
  v_dd := null;
  if lower(btrim(coalesce(v_canal,''))) = 'llamada data dura' then
    v_canal := 'Llamada'; v_dd := true;
  elsif lower(btrim(coalesce(v_canal,''))) = 'llamada' then
    v_dd := false;
  end if;
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura)
  values (new.id, (now() at time zone 'America/New_York')::date, old."GESTION", new."GESTION", v_canal, coalesce(autor, ''), auth.uid(), v_dd);
  return new;
end;
$$;

-- update_lead_followup: las asesoras pueden actualizar Telefono.
-- Se valida solo cuando cambia (7-15 digitos); los historicos vacios no bloquean.
create or replace function public.update_lead_followup(p_id bigint, p_fields jsonb)
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
  if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre','')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono','')) is distinct from btrim(coalesce(current_lead."Telefono",''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono',''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then raise exception using errcode = '22023', message = 'telefono_invalido'; end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
      "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
       "GESTION" = left(coalesce(p_fields->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "ULTIMO AGENTE " = left(access.nombre, 120),
      "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre,'')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  return updated;
end;
$$;

-- update_lead_with_appointment: rama no-admin acepta Telefono con la misma regla.
create or replace function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
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
     and btrim(coalesce(p_fields->>'Telefono','')) is distinct from btrim(coalesce(current_lead."Telefono",''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono',''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
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
    if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre','')) = '' then raise exception using errcode = '22023', message = 'nombre_required'; end if;
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
    where id = updated.contact_id and (btrim(coalesce(nombre,'')) = '' or upper(btrim(nombre)) in ('SN','S/N','SIN NOMBRE'));
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return updated;
end;
$$;

revoke all on function public.update_lead_followup(bigint,jsonb) from public; grant execute on function public.update_lead_followup(bigint,jsonb) to authenticated;
revoke all on function public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid) from public; grant execute on function public.update_lead_with_appointment(bigint,jsonb,timestamptz,text,uuid) to authenticated;

-- Reporte diario: la marca manual (is_data_dura) manda; solo los historicos
-- (NULL) usan la regla por Mes/Fecha con _daily_report_data_dura.
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
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name),'') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha
      union all select ua.user_id, ua.nombre from user_access ua where ua.activo and ua.role in ('admin','agente','supervisor')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name),'') from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date=p_fecha and a.advisor_user_id is null
    ) n where name is not null group by name
  ), filtered as (select * from people where p_autor_user_id is null or user_id=p_autor_user_id),
  gest as (
    select g.id, g.autor_user_id, nullif(btrim(g.autor_name),'') autor_name,
      lower(btrim(coalesce(l."Medio",''))) medio,
      lower(btrim(coalesce(g.canal,''))) canal,
      g.is_data_dura,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g left join leads l on l.id = g.lead_id
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,'')))) as gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and estado like 'INSCRIT%') as inscritos_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_fecha)) as inscritos_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('whatsapp','whatsapp nuevo')) as p_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('instagram','comentarios de red')) as p_fb_ig,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio = 'cognitalkign') as p_cognitalking,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and medio in ('lead directo','referido','referidos andres')) as p_directo,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and coalesce(medio,'') not in ('whatsapp','whatsapp nuevo','instagram','comentarios de red','cognitalkign','lead directo','referido','referidos andres')) as p_otros,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name,''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and not a.is_data_dura) as ag_dia,
      (select count(*) from lead_appointments a where (a.scheduled_at at time zone 'America/New_York')::date = p_fecha and a.advisor_user_id is not distinct from f.user_id and a.status = 'PROGRAMADA' and a.is_data_dura) as ag_dd,
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

comment on function public.daily_management_report(date, uuid) is 'Reporte diario CRM: la marca manual is_data_dura de cada gestion manda; los historicos NULL usan la regla por Mes/Fecha.';
revoke all on function public.daily_management_report(date, uuid) from public, anon;
grant execute on function public.daily_management_report(date, uuid) to authenticated;

commit;

-- Rollback manual: restaurar record_lead_gestion, update_lead_followup,
-- update_lead_with_appointment y daily_management_report desde 202610010002 y
-- 202610010004; drop column public.lead_gestiones.is_data_dura solo tras revisar
-- dependencias del reporte.

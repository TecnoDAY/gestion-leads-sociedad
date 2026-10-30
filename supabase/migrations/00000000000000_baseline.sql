


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."_appointment_details"("p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
declare
  v_name text := left(btrim(coalesce(p->>'student_name', '')), 200);
  v_email text := lower(left(btrim(coalesce(p->>'contact_email', '')), 254));
  v_age_raw text := btrim(coalesce(p->>'student_age', ''));
  v_age integer;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'appointment_details_object_required';
  end if;
  if p - array['student_name', 'contact_email', 'student_age'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'appointment_details_fields_only';
  end if;
  if v_email <> '' and v_email !~ ('^[^@' || chr(92) || 's]+@[^@' || chr(92) || 's]+' || chr(92) || '.[^@' || chr(92) || 's]+$') then
    raise exception using errcode = '22023', message = 'appointment_email_invalid';
  end if;
  if v_age_raw <> '' then
    if v_age_raw !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'appointment_age_invalid';
    end if;
    v_age := v_age_raw::int;
    if v_age < 0 or v_age > 120 then
      raise exception using errcode = '22023', message = 'appointment_age_invalid';
    end if;
  end if;
  return jsonb_build_object(
    'student_name', nullif(v_name, ''),
    'contact_email', nullif(v_email, ''),
    'student_age', v_age);
end;
$_$;


ALTER FUNCTION "public"."_appointment_details"("p" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" bigint NOT NULL,
    "Mes" "text",
    "Fecha" "text",
    "Nombre" "text",
    "Telefono" "text",
    "Campaña" "text",
    "Medio" "text",
    "GESTION" "text",
    "Interesado en " "text",
    "Ciudad" "text",
    "AGENTE" "text",
    "Odoo" "text",
    "Fecha de Atencion" "text",
    "OBSERVACIONES " "text",
    "Fecha Última Gestión " "text",
    "ULTIMA GESTION" "text",
    "ULTIMO AGENTE " "text",
    "LANDING" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "contact_id" bigint,
    "whatsapp_message_id" "text",
    "PROGRAMA INSCRIPCION" "text",
    "INTERESADO EN" "text",
    "proxima_accion" "text",
    "fecha_seguimiento" "date"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


COMMENT ON COLUMN "public"."leads"."AGENTE" IS 'PRUEBA DE AGENTE';



COMMENT ON COLUMN "public"."leads"."whatsapp_message_id" IS 'Id de mensaje de Meta (value.messages[].id). UNIQUE parcial: idempotencia atomica del webhook; NULL para leads no-WhatsApp.';



COMMENT ON COLUMN "public"."leads"."PROGRAMA INSCRIPCION" IS 'Programa del catálogo (campaña) donde la persona se inscribe. Opcional: NULL cuando no se ha elegido. No sustituye a la campaña de origen ("Campaña").';



COMMENT ON COLUMN "public"."leads"."INTERESADO EN" IS 'Programa del catálogo (campaña) en el que el lead está interesado. Solo informativo: no sustituye a la campaña de origen ("Campaña") ni al programa de inscripción.';



COMMENT ON COLUMN "public"."leads"."proxima_accion" IS 'Accion confirmada para el siguiente contacto (llamar, enviar info, etc.).';



COMMENT ON COLUMN "public"."leads"."fecha_seguimiento" IS 'Fecha comprometida para la proxima accion. Null si no hay seguimiento confirmado.';



CREATE OR REPLACE FUNCTION "public"."_create_lead_with_gestion"("p_lead" "jsonb") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v jsonb;
  created public.leads;
  fecha_raw text := btrim(coalesce(p_lead->>'Fecha', ''));
  llegada date;
  hoy date := (now() at time zone 'America/New_York')::date;
  meses text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  autor text := '';
  v_canal text;
  v_dd boolean;
begin
  if not public.is_crm_user() then raise exception using errcode='42501', message='crm_access_forbidden'; end if;
  if not exists(select 1 from public.lead_catalogs c where c.kind='campana' and c.active and lower(btrim(c.value))=lower(btrim(coalesce(p_lead->>'Campaña', '')))) then raise exception using errcode='22023', message='campaign_not_in_catalog'; end if;

  if fecha_raw = '' then
    llegada := hoy;
  else
    if fecha_raw !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then raise exception using errcode='22023', message='fecha_llegada_invalida'; end if;
    begin
      llegada := to_date(fecha_raw, 'DD/MM/YYYY');
    exception when others then
      raise exception using errcode='22023', message='fecha_llegada_invalida';
    end;
    if llegada > hoy or llegada < date '2000-01-01' then raise exception using errcode='22023', message='fecha_llegada_invalida'; end if;
  end if;

  v := jsonb_set(jsonb_set(p_lead, '{Fecha}', to_jsonb(to_char(llegada, 'DD/MM/YYYY'))), '{Mes}', to_jsonb(meses[extract(month from llegada)::int]));
  created := public.create_lead_record(v);

  select coalesce(ua.nombre, '') into autor from public.user_access ua where ua.user_id = auth.uid();
  v_canal := created."ULTIMA GESTION";
  v_dd := null;
  if lower(btrim(coalesce(v_canal, ''))) = 'llamada data dura' then
    v_canal := 'Llamada'; v_dd := true;
  elsif lower(btrim(coalesce(v_canal, ''))) = 'llamada' then
    v_dd := false;
  end if;
  if btrim(coalesce(v_canal, '')) = '' and lower(btrim(coalesce(created."Medio", ''))) in ('whatsapp', 'whatsapp nuevo') then
    v_canal := 'WhatsApp';
  end if;
  insert into public.lead_gestiones (lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura)
  values (created.id, hoy, null, created."GESTION", v_canal, coalesce(autor, ''), auth.uid(), v_dd);
  return created;
end;
$_$;


ALTER FUNCTION "public"."_create_lead_with_gestion"("p_lead" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_crm_fecha_ingreso"("p_fecha" "text") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare
  partes text[];
begin
  if p_fecha is null then return null; end if;
  partes := regexp_match(btrim(p_fecha), '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$');
  if partes is not null then
    begin
      return make_date(partes[3]::int, partes[2]::int, partes[1]::int);
    exception when others then return null;
    end;
  end if;
  partes := regexp_match(btrim(p_fecha), '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$');
  if partes is not null then
    begin
      return make_date(partes[1]::int, partes[2]::int, partes[3]::int);
    exception when others then return null;
    end;
  end if;
  return null;
end;
$_$;


ALTER FUNCTION "public"."_crm_fecha_ingreso"("p_fecha" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_crm_inscripcion_clase"("p_ingreso" "date", "p_inscripcion" "date") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when p_inscripcion is null or p_ingreso is null then 'PENDIENTE'
    when p_ingreso > p_inscripcion then 'INCONSISTENTE'
    when date_trunc('month', p_ingreso) = date_trunc('month', p_inscripcion) then 'NORMAL'
    else 'DATA_DURA'
  end
$$;


ALTER FUNCTION "public"."_crm_inscripcion_clase"("p_ingreso" "date", "p_inscripcion" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_crm_inscripcion_eventos"() RETURNS TABLE("id" bigint, "gestion_id" bigint, "fecha_inscripcion" "date", "estado_inscripcion" "text", "registrado_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select g.lead_id, g.id, g.fecha_gestion, btrim(g.gestion_nueva), g.created_at
  from public.lead_gestiones g
  where upper(btrim(coalesce(g.gestion_nueva, ''))) like 'INSCRIT%'
    and upper(btrim(coalesce(g.gestion_anterior, ''))) not like 'INSCRIT%';
$$;


ALTER FUNCTION "public"."_crm_inscripcion_eventos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select (upper(coalesce(p_mes,'')) ~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
      and upper(coalesce(p_mes,'')) not like '%'||case extract(month from p_report)::int when 1 then 'ENERO' when 2 then 'FEBRERO' when 3 then 'MARZO' when 4 then 'ABRIL' when 5 then 'MAYO' when 6 then 'JUNIO' when 7 then 'JULIO' when 8 then 'AGOSTO' when 9 then 'SEPTIEMBRE' when 10 then 'OCTUBRE' when 11 then 'NOVIEMBRE' else 'DICIEMBRE' end||'%')
    or (upper(coalesce(p_mes,'')) !~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
      and nullif(substring(p_fecha from '(19|20)[0-9]{2}'), '') is not null
      and substring(p_fecha from '(19|20)[0-9]{2}')::int <> extract(year from p_report)::int)
$$;


ALTER FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") IS 'Helper interno del reporte diario (detecta Data Dura por Mes/Fecha). Uso interno: no se expone a anon ni public.';



CREATE OR REPLACE FUNCTION "public"."admin_agent_sessions_report"("p_from" "date" DEFAULT ((("now"() AT TIME ZONE 'America/New_York'::"text"))::"date" - 7), "p_to" "date" DEFAULT (("now"() AT TIME ZONE 'America/New_York'::"text"))::"date", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" bigint, "user_id" "uuid", "agent_name" "text", "started_at" timestamp with time zone, "last_activity_at" timestamp with time zone, "ended_at" timestamp with time zone, "end_reason" "text", "active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_from date := coalesce(p_from, (now() at time zone 'America/New_York')::date - 7);
  v_to date := coalesce(p_to, (now() at time zone 'America/New_York')::date);
begin
  if not public.is_admin_user() then raise exception using errcode = '42501', message = 'admin_required'; end if;
  if v_to < v_from then raise exception using errcode = '22023', message = 'report_range_invalid'; end if;
  if v_from < (now() at time zone 'America/New_York')::date - 60 then raise exception using errcode = '22023', message = 'report_range_too_wide'; end if;
  return query
  select s.id, s.user_id, s.agent_name, s.started_at, s.last_activity_at, s.ended_at, s.end_reason, s.ended_at is null
  from public.agent_sessions s
  where (p_user_id is null or s.user_id = p_user_id)
    and (s.started_at at time zone 'America/New_York')::date between v_from and v_to
  order by s.id desc
  limit 500;
end;
$$;


ALTER FUNCTION "public"."admin_agent_sessions_report"("p_from" "date", "p_to" "date", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_activo" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result jsonb;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'email', email, 'nombre', nombre, 'role', role, 'activo', activo,
      'idle_timeout_enabled', idle_timeout_enabled
    ) order by lower(email)), '[]'::jsonb)
    into result
    from public.user_access;
    return result;
  elsif p_action = 'set_active' and p_user_id is not null then
    update public.user_access set activo = coalesce(p_activo, false), updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception using errcode = 'P0002', message = 'user_not_found'; end if;
    return jsonb_build_object('user_id', p_user_id, 'activo', coalesce(p_activo, false));
  elsif p_action = 'set_idle_timeout' and p_user_id is not null then
    update public.user_access set idle_timeout_enabled = coalesce(p_activo, true), updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception using errcode = 'P0002', message = 'user_not_found'; end if;
    return jsonb_build_object('user_id', p_user_id, 'idle_timeout_enabled', coalesce(p_activo, true));
  end if;

  raise exception using errcode = '22023', message = 'unsupported_user_action';
end;
$$;


ALTER FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid", "p_activo" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid", "p_activo" boolean) IS 'Admin-only listing and activation changes; provisioning belongs in authorize-user.';



CREATE OR REPLACE FUNCTION "public"."archive_lead"("p_id" bigint) RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."archive_lead"("p_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."archive_lead"("p_id" bigint) IS 'Soft archive; there is no public DELETE policy.';



CREATE OR REPLACE FUNCTION "public"."bootstrap_admin_user"("p_user_id" "uuid", "p_email" "text", "p_nombre" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."bootstrap_admin_user"("p_user_id" "uuid", "p_email" "text", "p_nombre" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  mes_idx int;
  month_name text;
  from_date date;
  result jsonb;
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  mes_idx := array_position(month_names, upper(btrim(coalesce(p_mes, ''))));
  if mes_idx is null then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  month_name := month_names[mes_idx];
  from_date := make_date(p_anio, mes_idx, 1);

  with lead_date_parts as (
    select l.id, l.archived_at, l."Mes", l."Campaña", l."GESTION",
           coalesce(
             regexp_match(btrim(coalesce(l."Fecha", '')), '^([0-9]{4})-([0-9]{2})-([0-9]{2})$'),
             regexp_match(btrim(coalesce(l."Fecha", '')), '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2}|[0-9]{4})$')
           ) as date_parts,
           btrim(coalesce(l."Fecha", '')) ~ '^[0-9]{4}-' as iso_date
    from public.leads l
  ),
  lead_date_numbers as (
    select l.*,
           case when iso_date then l.date_parts[1]::int
                when length(l.date_parts[3]) = 2 then 2000 + l.date_parts[3]::int
                else l.date_parts[3]::int end as capture_year,
           l.date_parts[2]::int as capture_month,
           case when iso_date then l.date_parts[3]::int else l.date_parts[1]::int end as capture_day
    from lead_date_parts l
  ),
  dated_leads as (
    select l.*,
           case when capture_year between 2000 and 2100
                     and capture_month between 1 and 12 and capture_day between 1 and 31
                then case when capture_day <= extract(day from (make_date(capture_year, capture_month, 1) + interval '1 month - 1 day'))
                          then make_date(capture_year, capture_month, capture_day) end
           end as capture_date
    from lead_date_numbers l
  ),
  base_campaigns as (
    -- Campanas con leads del periodo, citas del periodo o stats del periodo.
    select distinct campaign_name from (
      select btrim(l."Campaña") as campaign_name
      from dated_leads l
      where l.archived_at is null
        and btrim(coalesce(l."Campaña", '')) <> ''
        and upper(l."Mes") like '%' || month_name || '%'
        and extract(year from l.capture_date) = p_anio
      union
      select btrim(l."Campaña")
      from public.lead_appointments la
      join public.leads l on l.id = la.lead_id
      where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
        and btrim(coalesce(l."Campaña", '')) <> ''
      union
      select cs.campaign_name
      from public.campaign_stats cs
      where cs.anio = p_anio and cs.mes = month_name
    ) t
  ),
  lead_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as leads_nuevos,
           count(*) filter (where l."GESTION" ilike '%INSCRIT%') as inscritos
    from dated_leads l
    where l.archived_at is null
      and btrim(coalesce(l."Campaña", '')) <> ''
      and upper(l."Mes") like '%' || month_name || '%'
      and extract(year from l.capture_date) = p_anio
    group by btrim(l."Campaña")
  ),
  appt_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as agendados,
           count(*) filter (where la.status = 'ASISTIO') as asistieron,
           count(*) filter (where la.status = 'PROGRAMADA') as pendientes,
           count(*) filter (where upper(coalesce(l."Mes", '')) not like '%' || month_name || '%'
                            or extract(year from l.capture_date) <> p_anio) as agendados_previos
    from public.lead_appointments la
    join dated_leads l on l.id = la.lead_id
    where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
      and btrim(coalesce(l."Campaña", '')) <> ''
    group by btrim(l."Campaña")
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign_name', bc.campaign_name,
    'leads_nuevos', coalesce(lc.leads_nuevos, 0),
    'agendados', coalesce(ac.agendados, 0),
    'asistieron', coalesce(ac.asistieron, 0),
    'inscritos', coalesce(lc.inscritos, 0),
    'agendados_previos', coalesce(ac.agendados_previos, 0),
    'pendientes', coalesce(ac.pendientes, 0)
  ) order by lower(bc.campaign_name)), '[]'::jsonb)
  into result
  from base_campaigns bc
  left join lead_counts lc on lc.campaign_name = bc.campaign_name
  left join appt_counts ac on ac.campaign_name = bc.campaign_name;

  return result;
end;
$_$;


ALTER FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") IS 'Conteos agregados del CRM por campana y periodo: Mes y anio de Fecha valida para leads; scheduled_at para citas, todos sus estados; cualquier usuario activo, sin lectura directa de leads.';



CREATE TABLE IF NOT EXISTS "public"."crm_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" bigint,
    "descripcion" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "created_by" "uuid" NOT NULL,
    "assignee_id" "uuid",
    "status" "text" DEFAULT 'sin_asignar'::"text" NOT NULL,
    "history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "claimed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crm_tasks_descripcion_check" CHECK ((("char_length"("descripcion") >= 1) AND ("char_length"("descripcion") <= 200))),
    CONSTRAINT "crm_tasks_status_check" CHECK (("status" = ANY (ARRAY['sin_asignar'::"text", 'asignada'::"text", 'completada'::"text", 'cancelada'::"text"])))
);


ALTER TABLE "public"."crm_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."crm_tasks" IS 'Tareas CRM con asignacion y bandeja general.';



CREATE OR REPLACE FUNCTION "public"."cancel_crm_task"("p_task_id" "uuid") RETURNS "public"."crm_tasks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  canceled public.crm_tasks;
begin
  select * into access from public.user_access
  where user_id = auth.uid() and activo = true;
  if access.id is null or access.role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  update public.crm_tasks
  set status = 'cancelada',
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type', 'canceled', 'by', auth.uid(), 'at', now()))
  where id = p_task_id and status in ('asignada', 'sin_asignar', 'completada')
  returning * into canceled;

  if canceled.id is null then
    raise exception using errcode = '40001', message = 'task_not_cancelable';
  end if;
  return canceled;
end;
$$;


ALTER FUNCTION "public"."cancel_crm_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_lead_phone_occurrences"("p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_actual int := 0;
  v_archivado int := 0;
  v_historico int := 0;
begin
  if not public.is_active_user() or not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if length(v_digits) < 7 then
    return jsonb_build_object('total', 0, 'actuales', 0, 'archivados', 0, 'historico', 0);
  end if;
  if length(v_digits) > 15 then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
  into v_actual, v_archivado
  from public.leads
  where regexp_replace(coalesce("Telefono", ''), '[^0-9]', '', 'g') = v_digits;
  select count(*) into v_historico
  from public.leads_historico
  where regexp_replace(coalesce("Telefono", ''), '[^0-9]', '', 'g') = v_digits;
  return jsonb_build_object('total', v_actual + v_archivado + v_historico, 'actuales', v_actual, 'archivados', v_archivado, 'historico', v_historico);
end;
$$;


ALTER FUNCTION "public"."check_lead_phone_occurrences"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_crm_task"("p_task_id" "uuid") RETURNS "public"."crm_tasks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  claimed public.crm_tasks;
  previous_assignee uuid;
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;

  select t.assignee_id into previous_assignee from public.crm_tasks t where t.id = p_task_id;
  if previous_assignee is not null then
    perform pg_advisory_xact_lock(hashtextextended('crm_task_presence:' || previous_assignee::text, 0));
  end if;
  -- El UPDATE se inicia despues del lock: si el heartbeat gano, lee su presencia nueva.
  update public.crm_tasks t
  set assignee_id = auth.uid(), status = 'asignada', claimed_at = now(), updated_at = now(),
      history = t.history || jsonb_build_array(jsonb_build_object(
        'type', 'claimed', 'by', auth.uid(), 'from', t.assignee_id, 'at', now()))
  where t.id = p_task_id
    and ((t.status = 'sin_asignar' and t.assignee_id is null)
      or (t.status = 'asignada' and t.assignee_id <> auth.uid()
        and public.crm_task_is_shared(t.assignee_id, t.scheduled_at, t.claimed_at)))
  returning * into claimed;
  if claimed.id is null then raise exception using errcode = '40001', message = 'task_not_claimable'; end if;
  return claimed;
end;
$$;


ALTER FUNCTION "public"."claim_crm_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_crm_task"("p_task_id" "uuid") RETURNS "public"."crm_tasks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  done public.crm_tasks;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  update public.crm_tasks
  set status = 'completada',
      completed_at = now(),
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type','completed','by',auth.uid(),'at',now()))
  where id = p_task_id
    and status in ('asignada','sin_asignar')
    and (assignee_id = auth.uid() or access.role in ('supervisor','admin'))
  returning * into done;

  if done.id is null then
    raise exception using errcode='40001', message='task_not_completable';
  end if;
  return done;
end;
$$;


ALTER FUNCTION "public"."complete_crm_task"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_crm_task"("p_lead_id" bigint, "p_descripcion" "text", "p_scheduled_at" timestamp with time zone, "p_assignee" "uuid") RETURNS "public"."crm_tasks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  new_task public.crm_tasks;
  v_desc text;
  v_assignee uuid;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode='42501', message='active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode='42501', message='crm_access_forbidden'; end if;

  v_desc := nullif(btrim(coalesce(p_descripcion,'')), '');
  if v_desc is null then raise exception using errcode='22023', message='descripcion_required'; end if;
  if char_length(v_desc) > 200 then raise exception using errcode='22023', message='descripcion_too_long'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023', message='scheduled_at_required'; end if;

  if p_lead_id is not null then
    if not exists (select 1 from public.leads l where l.id = p_lead_id and l.archived_at is null) then
      raise exception using errcode='P0002', message='lead_not_found';
    end if;
  end if;

  if p_assignee is not null then
    if not exists (select 1 from public.user_access ua where ua.user_id = p_assignee and ua.activo = true and ua.role in ('agente','supervisor','admin')) then
      raise exception using errcode='22023', message='assignee_invalid';
    end if;
    v_assignee := p_assignee;
  else
    v_assignee := null;
  end if;

  insert into public.crm_tasks (lead_id, descripcion, scheduled_at, created_by, assignee_id, status)
  values (p_lead_id, v_desc, p_scheduled_at, auth.uid(), v_assignee,
    case when v_assignee is null then 'sin_asignar' else 'asignada' end)
  returning * into new_task;

  return new_task;
end;
$$;


ALTER FUNCTION "public"."create_crm_task"("p_lead_id" bigint, "p_descripcion" "text", "p_scheduled_at" timestamp with time zone, "p_assignee" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_lead"("p_lead" "jsonb") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;
  return public._create_lead_with_gestion(p_lead);
end;
$$;


ALTER FUNCTION "public"."create_lead"("p_lead" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_appointments" (
    "id" bigint NOT NULL,
    "lead_id" bigint NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'PROGRAMADA'::"text" NOT NULL,
    "advisor_user_id" "uuid",
    "advisor_name" "text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "rescheduled_from_id" bigint,
    "created_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "is_data_dura" boolean DEFAULT false NOT NULL,
    "student_name" "text",
    "contact_email" "text",
    "student_age" smallint,
    "campus" "text",
    CONSTRAINT "lead_appointments_campus_check" CHECK (("campus" = ANY (ARRAY['DORAL'::"text", 'WESTON'::"text"]))),
    CONSTRAINT "lead_appointments_notes_check" CHECK (("length"("notes") <= 2000)),
    CONSTRAINT "lead_appointments_status_check" CHECK (("status" = ANY (ARRAY['PROGRAMADA'::"text", 'ASISTIO'::"text", 'NO_ASISTIO'::"text", 'CANCELADA'::"text", 'REPROGRAMADA'::"text"])))
);


ALTER TABLE "public"."lead_appointments" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_appointments" IS 'Citas independientes de lead_gestiones; revisar y aplicar manualmente en Supabase.';



COMMENT ON COLUMN "public"."lead_appointments"."is_data_dura" IS 'Indicates that the appointment was created from an AGENDADO DATA DURA lead.';



COMMENT ON COLUMN "public"."lead_appointments"."student_name" IS 'Nombre del estudiante citado; puede diferir del lead (representante).';



COMMENT ON COLUMN "public"."lead_appointments"."contact_email" IS 'Correo de contacto para la cita (padre/madre o estudiante).';



COMMENT ON COLUMN "public"."lead_appointments"."student_age" IS 'Edad del estudiante en años (0-120); opcional.';



COMMENT ON COLUMN "public"."lead_appointments"."campus" IS 'Sede acordada de la cita (Doral o Weston); NULL solo en citas creadas antes de esta funcionalidad.';



CREATE OR REPLACE FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text" DEFAULT ''::"text", "p_advisor_user_id" "uuid" DEFAULT NULL::"uuid", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."lead_appointments"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.create_lead_appointment(p_lead_id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;


ALTER FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") RETURNS "public"."lead_appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_catalogs" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "value" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_catalogs_kind_check" CHECK (("kind" = ANY (ARRAY['mes'::"text", 'campana'::"text", 'medio'::"text", 'gestion'::"text", 'agente'::"text"]))),
    CONSTRAINT "lead_catalogs_value_check" CHECK ((("length"("btrim"("value")) >= 1) AND ("length"("btrim"("value")) <= 120)))
);


ALTER TABLE "public"."lead_catalogs" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_catalogs" IS 'Admin-managed option lists for filters/forms; leads are never modified by this table.';



COMMENT ON CONSTRAINT "lead_catalogs_kind_check" ON "public"."lead_catalogs" IS 'Catalog kinds: mes, campana, medio, gestion and agente (advisor option lists only, not accounts).';



CREATE OR REPLACE FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") RETURNS "public"."lead_catalogs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") IS 'Admin-only: add a value or reactivate an existing one.';



CREATE TABLE IF NOT EXISTS "public"."lead_notes" (
    "id" bigint NOT NULL,
    "lead_id" bigint NOT NULL,
    "author_name" "text" DEFAULT ''::"text" NOT NULL,
    "author_user_id" "uuid" DEFAULT "auth"."uid"(),
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "lead_notes_note_check" CHECK ((("length"("btrim"("note")) >= 1) AND ("length"("btrim"("note")) <= 2000)))
);


ALTER TABLE "public"."lead_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_notes" IS 'Append-only team notes per lead; agents insert, only admins edit/delete (RPC-enforced).';



CREATE OR REPLACE FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") RETURNS "public"."lead_notes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  created public.lead_notes;
  access public.user_access;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
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


ALTER FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") IS 'Any active user appends a note; author_name is taken server-side from user_access.';



CREATE OR REPLACE FUNCTION "public"."create_lead_record"("p_lead" "jsonb") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  insert into public.leads (
    "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION",
    "Ciudad", "AGENTE", "OBSERVACIONES ", "INTERESADO EN"
  ) values (
    left(coalesce(p_lead->>'Mes', ''), 40),
    left(coalesce(p_lead->>'Fecha', ''), 40),
    left(coalesce(p_lead->>'Nombre', ''), 200),
    left(coalesce(p_lead->>'Telefono', ''), 80),
    left(coalesce(p_lead->>'Campaña', ''), 120),
    left(coalesce(p_lead->>'Medio', ''), 80),
    left(coalesce(p_lead->>'GESTION', 'Información '), 80),
    left(coalesce(p_lead->>'Ciudad', ''), 120),
    case when access.role = 'admin' then left(coalesce(p_lead->>'AGENTE', p_lead->>'Agente', p_lead->>'Agente ', access.nombre), 120) else left(access.nombre, 120) end,
    left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', ''), 5000),
    nullif(left(coalesce(p_lead->>'INTERESADO EN', ''), 120), '')
  ) returning * into created;

  return created;
end;
$$;


ALTER FUNCTION "public"."create_lead_record"("p_lead" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_lead_record"("p_lead" "jsonb") IS 'Creates a lead using the deployed normalized lead columns.';



CREATE OR REPLACE FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text" DEFAULT ''::"text", "p_advisor_user_id" "uuid" DEFAULT NULL::"uuid", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."leads"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.create_lead_with_appointment(p_lead, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;


ALTER FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare created public.leads;
begin
  if not public.is_crm_user() then raise exception using errcode='42501', message='crm_access_forbidden'; end if;
  if jsonb_typeof(p_lead) is distinct from 'object' then raise exception using errcode='22023', message='lead_object_required'; end if;
  if upper(btrim(coalesce(p_lead->>'GESTION', ''))) not like 'AGENDAD%' then raise exception using errcode='22023', message='lead_not_agendado'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023', message='scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode='22023', message='notes_too_long'; end if;
  created := public._create_lead_with_gestion(p_lead);
  perform public.create_lead_appointment(created.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return created;
end;
$$;


ALTER FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_inscripciones_detalle"("p_desde" "date", "p_hasta" "date") RETURNS TABLE("id" bigint, "gestion_id" bigint, "fecha_inscripcion" "date", "estado_inscripcion" "text", "clase" "text", "nombre" "text", "telefono" "text", "campana" "text", "programa" "text", "estado_actual" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  return query
    select h.id, h.gestion_id, h.fecha_inscripcion, h.estado_inscripcion, h.clase,
      l."Nombre"::text, l."Telefono"::text,
      coalesce(nullif(btrim(l."Campaña"), ''), 'Sin campaña')::text,
      l."PROGRAMA INSCRIPCION"::text, l."GESTION"::text
    from public.crm_inscripciones_historial(p_desde, p_hasta, false) h
    join public.leads l on l.id = h.id;
end;
$$;


ALTER FUNCTION "public"."crm_inscripciones_detalle"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_inscripciones_historial"("p_desde" "date" DEFAULT NULL::"date", "p_hasta" "date" DEFAULT NULL::"date", "p_actuales" boolean DEFAULT false) RETURNS TABLE("id" bigint, "gestion_id" bigint, "fecha_inscripcion" "date", "estado_inscripcion" "text", "clase" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if (p_desde is null) <> (p_hasta is null) or p_desde > p_hasta or p_actuales is null
     or (not p_actuales and p_desde is null) then
    raise exception using errcode = '22023', message = 'period_range_invalid';
  end if;
  if p_actuales then
    return query
      select l.id, e.gestion_id, e.fecha_inscripcion, e.estado_inscripcion,
        public._crm_inscripcion_clase(public._crm_fecha_ingreso(l."Fecha"), e.fecha_inscripcion)
      from public.leads l
      left join (
        select distinct on (x.id) x.id, x.gestion_id, x.fecha_inscripcion, x.estado_inscripcion
        from public._crm_inscripcion_eventos() x
        order by x.id, x.registrado_at desc, x.gestion_id desc
      ) e on e.id = l.id
      where l.archived_at is null and upper(btrim(coalesce(l."GESTION", ''))) like 'INSCRIT%'
        and (p_desde is null or e.fecha_inscripcion between p_desde and p_hasta);
  else
    return query
      select distinct on (e.id) e.id, e.gestion_id, e.fecha_inscripcion, e.estado_inscripcion,
        public._crm_inscripcion_clase(public._crm_fecha_ingreso(l."Fecha"), e.fecha_inscripcion)
      from public._crm_inscripcion_eventos() e
      join public.leads l on l.id = e.id and l.archived_at is null
      where e.fecha_inscripcion between p_desde and p_hasta
      order by e.id, e.registrado_at desc, e.gestion_id desc;
  end if;
end;
$$;


ALTER FUNCTION "public"."crm_inscripciones_historial"("p_desde" "date", "p_hasta" "date", "p_actuales" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_inscripciones_resumen"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb;
begin
  with personas as (
    select h.id, h.clase,
           coalesce(nullif(btrim(l."Campaña"), ''), 'Sin campaña') as campana
    from public.crm_inscripciones_historial(p_desde, p_hasta, false) h
    join public.leads l on l.id = h.id
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'personas_inscritas', count(*),
    'normales', count(*) filter (where clase = 'NORMAL'),
    'data_dura', count(*) filter (where clase = 'DATA_DURA'),
    'revision', count(*) filter (where clase in ('PENDIENTE', 'INCONSISTENTE')),
    'por_campana', (
      select coalesce(jsonb_agg(jsonb_build_object('campana', x.campana, 'personas', x.personas,
        'normales', x.normales, 'data_dura', x.data_dura, 'revision', x.revision) order by x.personas desc, x.campana), '[]'::jsonb)
      from (select campana, count(*) as personas,
                   count(*) filter (where clase = 'NORMAL') as normales,
                   count(*) filter (where clase = 'DATA_DURA') as data_dura,
                   count(*) filter (where clase in ('PENDIENTE', 'INCONSISTENTE')) as revision
            from personas group by campana) x
    ),
    'pendientes_fecha', (
      select count(*) from public.crm_inscripciones_historial(null, null, true) a
      where a.fecha_inscripcion is null
    )
  ) into result from personas;
  return result;
end;
$$;


ALTER FUNCTION "public"."crm_inscripciones_resumen"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_task_heartbeat"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;

  -- Ordena reconexion y toma con la misma llave, incluso antes de la primera fila de presencia.
  perform pg_advisory_xact_lock(hashtextextended('crm_task_presence:' || auth.uid()::text, 0));
  insert into public.crm_task_presence (user_id, last_seen_at)
  values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;


ALTER FUNCTION "public"."crm_task_heartbeat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crm_task_is_shared"("p_assignee" "uuid", "p_scheduled_at" timestamp with time zone, "p_claimed_at" timestamp with time zone) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_assignee is not null and p_claimed_at is null
    and (p_scheduled_at <= now() or (
      p_scheduled_at <= now() + interval '20 minutes'
      and not exists (
        select 1 from public.crm_task_presence p
        where p.user_id = p_assignee and p.last_seen_at >= now() - interval '3 minutes'
      )
    ));
$$;


ALTER FUNCTION "public"."crm_task_is_shared"("p_assignee" "uuid", "p_scheduled_at" timestamp with time zone, "p_claimed_at" timestamp with time zone) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "nombre" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'agente'::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "idle_timeout_enabled" boolean DEFAULT true NOT NULL,
    CONSTRAINT "user_access_email_length" CHECK ((("length"("email") >= 3) AND ("length"("email") <= 320))),
    CONSTRAINT "user_access_email_normalized" CHECK (("email" = "lower"("btrim"("email")))),
    CONSTRAINT "user_access_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'agente'::"text", 'trafficker'::"text", 'supervisor'::"text"])))
);


ALTER TABLE "public"."user_access" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_access" IS 'Allowlist and role authority; app_user_metadata is not trusted.';



COMMENT ON COLUMN "public"."user_access"."idle_timeout_enabled" IS 'Preferencia por usuario del cierre automatico por inactividad (aviso 4 min, cierre 5 min); true por defecto. activo=false sigue invalidando el acceso con o sin preferencia.';



CREATE OR REPLACE FUNCTION "public"."current_user_access"() RETURNS "public"."user_access"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select * from public.user_access
  where user_id = auth.uid() and activo = true
  limit 1;
$$;


ALTER FUNCTION "public"."current_user_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result jsonb;
  v_solo_asesoras boolean;
begin
  if p_fecha is null then raise exception using errcode='22023', message='report_date_required'; end if;
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  v_solo_asesoras := coalesce(public.is_asesora_user(), false);
  with
  booked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is null
  ),
  rebooked as (
    select a.*, coalesce(a.created_by_user_id, a.advisor_user_id) as worker_id
    from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.created_at at time zone 'America/New_York')::date = p_fecha
      and a.rescheduled_from_id is not null
  ),
  result_events as (
    select e.*,
      e.actor_user_id as action_user_id,
      e.actor_name as action_name
    from public.lead_appointment_events e
    join public.lead_appointments a on a.id = e.appointment_id
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (e.created_at at time zone 'America/New_York')::date = p_fecha
      and (
        e.status_nuevo = 'REPROGRAMADA' or e.status_nuevo in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA')
      )
  ),
  resolved as (
    select a.* from lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.resolved_at at time zone 'America/New_York')::date = p_fecha
  ),
  people as (
    select user_id, max(name) as name from (
      select g.autor_user_id as user_id, nullif(btrim(g.autor_name), '') as name from lead_gestiones g
        join public.leads l on l.id = g.lead_id and l.archived_at is null
        where g.fecha_gestion=p_fecha
          and (not v_solo_asesoras or not exists (
            select 1 from user_access oculta where oculta.user_id = g.autor_user_id and oculta.role in ('admin','supervisor')))
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from booked a left join user_access creator on creator.user_id = a.worker_id
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.worker_id and oculta.role in ('admin','supervisor')))
      union all select a.worker_id, nullif(btrim(coalesce(creator.nombre, a.advisor_name)), '')
        from rebooked a left join user_access creator on creator.user_id = a.worker_id
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.worker_id and oculta.role in ('admin','supervisor')))
      union all select a.advisor_user_id, nullif(btrim(a.advisor_name), '') from resolved a
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = a.advisor_user_id and oculta.role in ('admin','supervisor')))
      union all select e.action_user_id, nullif(btrim(e.action_name), '') from result_events e
        where (not v_solo_asesoras or not exists (
          select 1 from user_access oculta where oculta.user_id = e.action_user_id and oculta.role in ('admin','supervisor')))
      union all select ua.user_id, ua.nombre from user_access ua
        where ua.activo and ua.role in ('admin','agente','supervisor') and (not v_solo_asesoras or ua.role = 'agente')
    ) x where user_id is not null group by user_id
    union
    select null, max(name) from (
      select nullif(btrim(g.autor_name),'') as name from lead_gestiones g
        join public.leads l on l.id = g.lead_id and l.archived_at is null
        where g.fecha_gestion=p_fecha and g.autor_user_id is null
      union all select nullif(btrim(a.advisor_name), '') from booked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from rebooked a where a.worker_id is null
      union all select nullif(btrim(a.advisor_name), '') from resolved a where a.advisor_user_id is null
      union all select nullif(btrim(e.action_name), '') from result_events e where e.action_user_id is null
    ) n where name is not null group by name
  ),
  gest as (
    select g.id, g.lead_id, g.autor_user_id, nullif(btrim(g.autor_name, ''), '') as autor_name,
      lower(btrim(coalesce(l."Medio", ''))) medio,
      lower(btrim(coalesce(g.canal, ''))) canal,
      g.is_data_dura,
      g.gestion_anterior,
      (g.gestion_anterior is null) as es_nuevo,
      l."Mes" as mes, l."Fecha" as fecha,
      upper(btrim(g.gestion_nueva)) as estado
    from lead_gestiones g join leads l on l.id = g.lead_id and l.archived_at is null
    where g.fecha_gestion = p_fecha
  ),
  blocks as (
    select f.user_id,
      coalesce(ua.nombre, f.name, 'Sin nombre') as author,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, '')))) as gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%') as inscritos_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'INSCRIT%' and public._daily_report_data_dura(mes, fecha, p_fecha)) as inscritos_dd,
      (select count(distinct lead_id) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'AGENDAD%' and estado not like '%DATA%DURA%') as aggest_dia,
      (select count(distinct lead_id) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and estado like 'AGENDAD%DATA%DURA%') as aggest_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('whatsapp','whatsapp nuevo')) as p_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('instagram','comentarios de red')) as p_fb_ig,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio = 'cognitalkign') as p_cognitalking,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and medio in ('lead directo','referido','referidos andres')) as p_directo,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(medio, '') not in ('whatsapp','whatsapp nuevo','instagram','comentarios de red','cognitalkign','lead directo','referido','referidos andres')) as p_otros,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, p_fecha)))) as llam_dia,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and (canal = 'llamada data dura' or (canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, p_fecha)))))) as llam_dd,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'llamada y whatsapp') as llam_wa,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal in ('llamada', 'llamada data dura', 'llamada y whatsapp') and es_nuevo) as llam_nuevos,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'whatsapp') as c_whatsapp,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal not in ('llamada', 'llamada data dura', 'llamada y whatsapp') and es_nuevo) as wa_nuevos,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal not in ('llamada', 'llamada data dura', 'llamada y whatsapp') and not es_nuevo) as wa_gestionados,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'instagram') as c_instagram,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and canal = 'visita conservatorio') as c_visita,
      (select count(*) from gest where autor_user_id is not distinct from f.user_id and (f.user_id is not null or autor_name = btrim(coalesce(f.name, ''))) and coalesce(canal, '') not in ('llamada', 'llamada data dura', 'llamada y whatsapp', 'whatsapp', 'instagram', 'visita conservatorio')) as c_sin_clasificar,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and not a.is_data_dura) as ag_dia,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.is_data_dura) as ag_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and not a.is_data_dura) as ag_doral,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'DORAL' and a.is_data_dura) as ag_doral_dd,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and not a.is_data_dura) as ag_weston,
      (select count(*) from booked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, ''))) and a.campus = 'WESTON' and a.is_data_dura) as ag_weston_dd,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'ASISTIO') as visits,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'NO_ASISTIO') as absent,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'CANCELADA') as cancelled,
      (select count(*) from result_events e where e.action_user_id is not distinct from f.user_id and (f.user_id is not null or e.action_name = btrim(coalesce(f.name, ''))) and e.status_nuevo = 'REPROGRAMADA') as rescheduled,
      (select count(*) from rebooked a where a.worker_id is not distinct from f.user_id and (f.user_id is not null or a.advisor_name = btrim(coalesce(f.name, '')))) as rebooked_today
    from people f left join user_access ua on ua.user_id = f.user_id
  ),
  equipo_blocks as (
    select
      null::uuid as user_id,
      'Total asesoras'::text as author,
      coalesce(sum(b.gestionados),0)::bigint as gestionados,
      coalesce(sum(b.inscritos_dia),0)::bigint as inscritos_dia,
      coalesce(sum(b.inscritos_dd),0)::bigint as inscritos_dd,
      coalesce(sum(b.aggest_dia),0)::bigint as aggest_dia,
      coalesce(sum(b.aggest_dd),0)::bigint as aggest_dd,
      coalesce(sum(b.p_whatsapp),0)::bigint as p_whatsapp,
      coalesce(sum(b.p_fb_ig),0)::bigint as p_fb_ig,
      coalesce(sum(b.p_cognitalking),0)::bigint as p_cognitalking,
      coalesce(sum(b.p_directo),0)::bigint as p_directo,
      coalesce(sum(b.p_otros),0)::bigint as p_otros,
      coalesce(sum(b.llam_dia),0)::bigint as llam_dia,
      coalesce(sum(b.llam_dd),0)::bigint as llam_dd,
      coalesce(sum(b.llam_wa),0)::bigint as llam_wa,
      coalesce(sum(b.llam_nuevos),0)::bigint as llam_nuevos,
      coalesce(sum(b.c_whatsapp),0)::bigint as c_whatsapp,
      coalesce(sum(b.wa_nuevos),0)::bigint as wa_nuevos,
      coalesce(sum(b.wa_gestionados),0)::bigint as wa_gestionados,
      coalesce(sum(b.c_instagram),0)::bigint as c_instagram,
      coalesce(sum(b.c_visita),0)::bigint as c_visita,
      coalesce(sum(b.c_sin_clasificar),0)::bigint as c_sin_clasificar,
      coalesce(sum(b.ag_dia),0)::bigint as ag_dia,
      coalesce(sum(b.ag_dd),0)::bigint as ag_dd,
      coalesce(sum(b.ag_doral),0)::bigint as ag_doral,
      coalesce(sum(b.ag_doral_dd),0)::bigint as ag_doral_dd,
      coalesce(sum(b.ag_weston),0)::bigint as ag_weston,
      coalesce(sum(b.ag_weston_dd),0)::bigint as ag_weston_dd,
      coalesce(sum(b.visits),0)::bigint as visits,
      coalesce(sum(b.absent),0)::bigint as absent,
      coalesce(sum(b.cancelled),0)::bigint as cancelled,
      coalesce(sum(b.rescheduled),0)::bigint as rescheduled,
      coalesce(sum(b.rebooked_today),0)::bigint as rebooked_today,
      1 as es_equipo
    from blocks b
    join user_access rol on rol.user_id = b.user_id and rol.role = 'agente'
  ),
  salida_blocks as (
    select b.user_id, b.author, b.gestionados, b.inscritos_dia, b.inscritos_dd, b.aggest_dia, b.aggest_dd,
      b.p_whatsapp, b.p_fb_ig, b.p_cognitalking, b.p_directo, b.p_otros,
      b.llam_dia, b.llam_dd, b.llam_wa, b.llam_nuevos,
      b.c_whatsapp, b.wa_nuevos, b.wa_gestionados, b.c_instagram, b.c_visita, b.c_sin_clasificar,
      b.ag_dia, b.ag_dd, b.ag_doral, b.ag_doral_dd, b.ag_weston, b.ag_weston_dd,
      b.visits, b.absent, b.cancelled, b.rescheduled, b.rebooked_today,
      0 as es_equipo
    from blocks b
    where p_autor_user_id is null or b.user_id = p_autor_user_id
    union all
    select e.user_id, e.author, e.gestionados, e.inscritos_dia, e.inscritos_dd, e.aggest_dia, e.aggest_dd,
      e.p_whatsapp, e.p_fb_ig, e.p_cognitalking, e.p_directo, e.p_otros,
      e.llam_dia, e.llam_dd, e.llam_wa, e.llam_nuevos,
      e.c_whatsapp, e.wa_nuevos, e.wa_gestionados, e.c_instagram, e.c_visita, e.c_sin_clasificar,
      e.ag_dia, e.ag_dd, e.ag_doral, e.ag_doral_dd, e.ag_weston, e.ag_weston_dd,
      e.visits, e.absent, e.cancelled, e.rescheduled, e.rebooked_today,
      e.es_equipo
    from equipo_blocks e
  ),
  shaped as (
    select blocks.es_equipo, jsonb_build_object(
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
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa,
        'nuevos', blocks.llam_nuevos,
        'gestionados', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa - blocks.llam_nuevos,
        'total_gestion', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa),
      'whatsapp', jsonb_build_object(
        'nuevos', blocks.wa_nuevos,
        'gestionados', blocks.wa_gestionados,
        'total', blocks.wa_nuevos + blocks.wa_gestionados),
      'canales', jsonb_build_object(
        'llamada', blocks.llam_dia,
        'data_dura', blocks.llam_dd,
        'llamada_whatsapp', blocks.llam_wa,
        'whatsapp', blocks.c_whatsapp,
        'instagram', blocks.c_instagram,
        'visita', blocks.c_visita,
        'sin_clasificar', blocks.c_sin_clasificar,
        'total', blocks.llam_dia + blocks.llam_dd + blocks.llam_wa + blocks.c_whatsapp + blocks.c_instagram + blocks.c_visita + blocks.c_sin_clasificar),
      'citas', jsonb_build_object(
        'agendados_dia', blocks.ag_dia,
        'agendados_data_dura', blocks.ag_dd,
        'agendados_gestionados_dia', blocks.aggest_dia,
        'agendados_gestionados_data_dura', blocks.aggest_dd,
        'agendados_doral', blocks.ag_doral,
        'agendados_doral_data_dura', blocks.ag_doral_dd,
        'agendados_weston', blocks.ag_weston,
        'agendados_weston_data_dura', blocks.ag_weston_dd,
        'total_agendados', blocks.ag_dia + blocks.ag_dd,
        'citas_reprogramadas_hoy', blocks.rebooked_today,
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
    from salida_blocks blocks
  )
  select jsonb_build_object(
    'fecha', p_fecha,
    'asesoras', coalesce((select jsonb_agg(blk order by blk->>'autor_name') from (select block as blk from shaped where es_equipo = 0) q), '[]'::jsonb),
    'equipo', (select block from shaped where es_equipo = 1),
    'total', jsonb_build_object('gestionados', coalesce((select sum((blk->>'gestionados')::int) from (select block as blk from shaped where es_equipo = 0) q), 0))
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid") IS 'Reporte diario Miami por fecha_gestion: nuevo solo gestion_anterior IS NULL; llegada y created_at no determinan nuevos. Grupos disjuntos: WhatsApp (puro, Instagram y otros) y llamadas (normal, Data Dura y llamada y WhatsApp). Canales y procedencia excluyentes. La asesora solo ve asesoras; equipo = total del dia de las asesoras, independiente del filtro.';



CREATE OR REPLACE FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  delete from public.campaign_period_stats where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_period_stat_not_found';
  end if;
end;
$$;


ALTER FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) IS 'Solo admin: elimina un período guardado de una campaña (Desde/Hasta).';



CREATE OR REPLACE FUNCTION "public"."delete_campaign_stat"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  delete from public.campaign_stats where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_stat_not_found';
  end if;
end;
$$;


ALTER FUNCTION "public"."delete_campaign_stat"("p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  miami_today date;
  row public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
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
$$;


ALTER FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) IS 'Deletes a daily report note; agents only their own note for today in Miami time, admin any; already-deleted notes are ignored.';



CREATE OR REPLACE FUNCTION "public"."delete_lead_appointment"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare target_lead_id bigint; removed public.lead_appointments;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if p_id is null or p_id <= 0 then
    raise exception using errcode = '22023', message = 'invalid_appointment_id';
  end if;
  select lead_id into target_lead_id
  from public.lead_appointments
  where id = p_id;
  if target_lead_id is null then
    raise exception using errcode = 'P0002', message = 'appointment_not_found';
  end if;
  perform 1 from public.leads where id = target_lead_id for update;
  delete from public.lead_appointments
  where id = p_id
  returning * into removed;
  if removed.id is null then
    raise exception using errcode = 'P0002', message = 'appointment_not_found';
  end if;
end;
$$;


ALTER FUNCTION "public"."delete_lead_appointment"("p_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_lead_appointment"("p_id" bigint) IS 'Borrado definitivo de una cita; solo administrador activo. Elimina su historial de eventos y desvincula reprogramaciones.';



CREATE OR REPLACE FUNCTION "public"."delete_lead_note"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."delete_lead_note"("p_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_lead_note"("p_id" bigint) IS 'Admin-only note deletion; there is no direct DELETE policy.';



CREATE OR REPLACE FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n int;
begin
  -- 'session_invalid' es el cierre por desactivacion: debe poder ejecutarse
  -- con la cuenta ya desactivada.
  if p_reason <> 'session_invalid' and not public.is_active_user() then return false; end if;
  if p_reason not in ('manual_logout', 'idle_timeout', 'session_invalid') then raise exception using errcode = '22023', message = 'session_end_reason_invalid'; end if;
  update public.agent_sessions
  set ended_at = now(), end_reason = p_reason
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;


ALTER FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") IS 'Cierra la sesion abierta con un motivo allowed. Exige usuario activo salvo con el motivo session_invalid (flujo de desactivacion de cuenta, que debe poder cerrar la sesion aunque la cuenta ya este inactiva).';



CREATE OR REPLACE FUNCTION "public"."is_active_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true
  );
$$;


ALTER FUNCTION "public"."is_active_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_asesora_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role = 'agente'
  );
$$;


ALTER FUNCTION "public"."is_asesora_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_campaign_editor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'trafficker', 'supervisor')
  );
$$;


ALTER FUNCTION "public"."is_campaign_editor"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_campaign_editor"() IS 'Admin/trafficker/supervisor activo: editores de campaign_stats.';



CREATE OR REPLACE FUNCTION "public"."is_crm_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'agente', 'supervisor')
  );
$$;


ALTER FUNCTION "public"."is_crm_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_crm_user"() IS 'Admin/agente/supervisor activo; excluye a trafficker del CRM de leads.';



CREATE OR REPLACE FUNCTION "public"."is_supervisor"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role = 'supervisor'
  );
$$;


ALTER FUNCTION "public"."is_supervisor"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_supervisor"() IS 'Supervisor activo: lectura ampliada de citas; sin acciones admin.';



CREATE OR REPLACE FUNCTION "public"."lead_contact_id_for"("p_phone" "text", "p_nombre" "text" DEFAULT ''::"text", "p_ciudad" "text" DEFAULT ''::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."lead_contact_id_for"("p_phone" "text", "p_nombre" "text", "p_ciudad" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lead_contact_id_for"("p_phone" "text", "p_nombre" "text", "p_ciudad" "text") IS 'Encuentra o crea el contacto por telefono normalizado (7-15 digitos). Solo rellena campos vacios; uso interno desde triggers.';



CREATE OR REPLACE FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result jsonb;
begin
  if p_desde is null or p_hasta is null then
    raise exception using errcode='22023', message='period_range_required';
  end if;
  if p_desde > p_hasta then
    raise exception using errcode='22023', message='period_range_invalid';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
             'lead_id', d.lead_id,
             'nombre', coalesce(d.nombre, ''),
             'telefono', coalesce(d.telefono, ''),
             'programa', d.programa,
             'nivel', d.nivel,
             'fecha_inscripcion', d.fecha_inscripcion,
             'registrado_por', coalesce(d.registrado_por_nombre, '')
           ) order by d.programa, d.nivel, d.nombre, d.fecha_inscripcion nulls last), '[]'::jsonb)
    into result
    from (
      select e.lead_id, e.programa, e.nivel, e.fecha_inscripcion,
             e.registrado_por_nombre, l."Nombre" as nombre, l."Telefono" as telefono
      from public.lead_program_enrollments e
      left join public.leads l on l.id = e.lead_id
      where e.activa
        and (e.fecha_inscripcion between p_desde and p_hasta or e.fecha_inscripcion is null)
    ) d;
  return result;
end;
$$;


ALTER FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") IS 'Filas de inscripcion (una por inscripcion vigente) para el CSV: las del periodo y las pendientes de fecha.';



CREATE OR REPLACE FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result jsonb;
begin
  if p_desde is null or p_hasta is null then
    raise exception using errcode='22023', message='period_range_required';
  end if;
  if p_desde > p_hasta then
    raise exception using errcode='22023', message='period_range_invalid';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with activas as (
    select e.lead_id, e.programa, e.nivel, e.fecha_inscripcion
    from public.lead_program_enrollments e
    where e.activa
  ),
  periodo as (
    select lead_id, programa, nivel, fecha_inscripcion
    from activas
    where fecha_inscripcion between p_desde and p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'personas_inscritas', (select count(distinct lead_id) from activas),
    'inscripciones', (select count(*) from activas),
    'pendientes_fecha', (select count(*) from activas where fecha_inscripcion is null),
    'altas_periodo', (select count(*) from periodo),
    'bajas_periodo', (select count(*) from public.lead_program_enrollments
                       where fecha_baja is not null and fecha_baja::date between p_desde and p_hasta),
    'cambios_nivel_periodo', (select count(*) from public.lead_program_enrollments
                                where fecha_baja is not null and fecha_baja::date between p_desde and p_hasta
                                  and baja_motivo = 'cambio_nivel'),
    'por_programa_nivel', (
      select coalesce(jsonb_agg(jsonb_build_object('programa', x.programa, 'nivel', x.nivel, 'personas', x.personas)
                                 order by x.programa, x.nivel), '[]'::jsonb)
      from (select programa, nivel, count(distinct lead_id) as personas from activas group by programa, nivel) x
    ),
    'por_mes', (
      select coalesce(jsonb_agg(jsonb_build_object('mes', x.mes, 'personas', x.personas, 'inscripciones', x.inscripciones)
                                 order by x.mes), '[]'::jsonb)
      from (select to_char(fecha_inscripcion, 'YYYY-MM') as mes,
                   count(distinct lead_id) as personas,
                   count(*) as inscripciones
            from periodo group by 1) x
    )
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") IS 'Reporte de inscripciones: personas (una vez) e inscripciones (una por programa) por nivel y por mes, con pendientes de fecha, altas y bajas del periodo.';



CREATE OR REPLACE FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) RETURNS "date"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result date;
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  select e.fecha_inscripcion into result from public._crm_inscripcion_eventos() e
  where e.id = p_lead_id order by e.registrado_at desc, e.gestion_id desc limit 1;
  return result;
end;
$$;


ALTER FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) IS 'Fecha de la ultima transicion real desde fuera hacia la familia de inscritos de un lead. Devuelve null cuando no hay evidencia en el historial.';



CREATE OR REPLACE FUNCTION "public"."leads_set_contact_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  NEW.contact_id := public.lead_contact_id_for(NEW."Telefono", NEW."Nombre", NEW."Ciudad");
  return NEW;
end;
$$;


ALTER FUNCTION "public"."leads_set_contact_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_crm_task_advisors"() RETURNS TABLE("user_id" "uuid", "nombre" "text", "role" "text", "last_activity_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.user_access ua where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;
  return query
    select ua.user_id, coalesce(ua.nombre, '')::text, ua.role::text,
      case when p.last_seen_at >= now() - interval '3 minutes' then p.last_seen_at else null end
    from public.user_access ua
    left join public.crm_task_presence p on p.user_id = ua.user_id
    where ua.activo = true and ua.role in ('agente', 'supervisor', 'admin');
end;
$$;


ALTER FUNCTION "public"."list_crm_task_advisors"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result jsonb;
begin
  if p_desde is null or p_hasta is null then raise exception using errcode='22023', message='period_range_required'; end if;
  if p_desde > p_hasta then raise exception using errcode='22023', message='period_range_invalid'; end if;
  if not public.is_active_user() or not (public.is_crm_user() or public.is_campaign_editor()) then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;
  with g as (
    select g.lead_id,
           lower(btrim(coalesce(g.canal, ''))) as canal,
           g.is_data_dura,
           g.fecha_gestion,
           l."Mes" as mes,
           l."Fecha" as fecha,
           upper(btrim(g.gestion_nueva)) as estado,
           upper(btrim(coalesce(g.gestion_anterior, ''))) as estado_anterior,
           public._crm_inscripcion_clase(public._crm_fecha_ingreso(l."Fecha"), g.fecha_gestion) as clase_inscripcion
    from public.lead_gestiones g
    join public.leads l on l.id = g.lead_id and l.archived_at is null
    where g.fecha_gestion between p_desde and p_hasta
  ),
  por_estado as (
    select estado as label,
           count(*) as eventos,
           count(distinct lead_id) as leads
    from g
    group by estado
  ),
  c as (
    select a.status, a.is_data_dura, a.campus
    from public.lead_appointments a
    join public.leads l on l.id = a.lead_id and l.archived_at is null
    where (a.scheduled_at at time zone 'America/New_York')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'gestiones', jsonb_build_object(
      'total_eventos', (select count(*) from g),
      'leads_unicos', (select count(distinct lead_id) from g),
      'agendados_normales', (select count(distinct lead_id) from g where estado like 'AGENDAD%' and estado not like '%DATA%DURA%'),
      'agendados_data_dura', (select count(distinct lead_id) from g where estado like 'AGENDAD%DATA%DURA%'),
      'inscripciones_realizadas_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado_anterior not like 'INSCRIT%' and clase_inscripcion = 'NORMAL'),
      'inscripciones_realizadas_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado_anterior not like 'INSCRIT%' and clase_inscripcion = 'DATA_DURA'),
      'inscritos_normales', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado not like '%DATA%'),
      'inscritos_data_dura', (select count(distinct lead_id) from g where estado like 'INSCRIT%' and estado like '%DATA%'),
      'por_estado', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'eventos', p.eventos, 'leads', p.leads) order by p.eventos desc, p.label) from por_estado p), '[]'::jsonb)),
    'canales', jsonb_build_object(
      'llamadas_normales', (select count(*) from g where canal = 'llamada' and (is_data_dura is false or (is_data_dura is null and not public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamadas_data_dura', (select count(*) from g where canal = 'llamada' and (is_data_dura is true or (is_data_dura is null and public._daily_report_data_dura(mes, fecha, fecha_gestion)))),
      'llamada_whatsapp', (select count(*) from g where canal = 'llamada y whatsapp'),
      'whatsapp', (select count(*) from g where canal = 'whatsapp'),
      'instagram', (select count(*) from g where canal = 'instagram'),
      'otros', (select count(*) from g where coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp', 'instagram'))),
    'citas', jsonb_build_object(
      'programadas_normales', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura is distinct from true),
      'programadas_data_dura', (select count(*) from c where status = 'PROGRAMADA' and is_data_dura = true),
      'asistieron', (select count(*) from c where status = 'ASISTIO'),
      'no_asistieron', (select count(*) from c where status = 'NO_ASISTIO'),
      'canceladas', (select count(*) from c where status = 'CANCELADA'),
      'reprogramadas', (select count(*) from c where status = 'REPROGRAMADA'),
      'doral_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura is distinct from true),
      'doral_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'DORAL' and is_data_dura = true),
      'weston_normal', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura is distinct from true),
      'weston_data_dura', (select count(*) from c where status = 'PROGRAMADA' and campus = 'WESTON' and is_data_dura = true),
      'sin_sede', (select count(*) from c where status = 'PROGRAMADA' and campus is null))
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") IS 'Actividad del periodo: altas reales por clase de fechas; canales excluyentes con Instagram separado de otros.';



CREATE OR REPLACE FUNCTION "public"."normalize_agent_name"("v" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when v is null then null
    when lower(btrim(v)) = 'jessi' then 'Jessica'
    else public.title_case_text(v)
  end;
$$;


ALTER FUNCTION "public"."normalize_agent_name"("v" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_agent_name"("v" "text") IS 'Helper interno de normalizacion de nombres de asesor. Uso interno: no se expone a anon ni public.';



CREATE OR REPLACE FUNCTION "public"."record_lead_appointment_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare actor text; previous_at timestamptz;
begin
  select coalesce(nombre, '') into actor from public.user_access where user_id = auth.uid() limit 1;
  if tg_op = 'INSERT' and new.rescheduled_from_id is not null then
    select scheduled_at into previous_at from public.lead_appointments where id = new.rescheduled_from_id;
  elsif tg_op = 'UPDATE' then
    previous_at := old.scheduled_at;
  end if;
  if tg_op = 'INSERT' or old.status is distinct from new.status or old.scheduled_at is distinct from new.scheduled_at then
    insert into public.lead_appointment_events (
      appointment_id, status_anterior, status_nuevo, actor_user_id, actor_name, notes,
      scheduled_at_anterior, scheduled_at_nuevo
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      auth.uid(),
      coalesce(actor, ''),
      new.notes,
      previous_at,
      new.scheduled_at
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."record_lead_appointment_event"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_lead_appointment_event"() IS 'Trigger de trazabilidad: cada cambio de estado de una cita escribe actor (action_user_id/action_name), estado anterior y nuevo, y las fechas. Es la fuente del historial por actor que muestra la ficha del lead.';



CREATE OR REPLACE FUNCTION "public"."record_lead_gestion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."record_lead_gestion"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_lead_gestion"() IS 'Records lead gestion changes with date, channel and current user attribution; unparseable or missing dates fall back to today in Miami (America/New_York) time.';



CREATE OR REPLACE FUNCTION "public"."refresh_crm_task_assignments"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.user_access ua where ua.user_id = auth.uid() and ua.activo = true
      and ua.role in ('agente', 'supervisor', 'admin')
  ) then raise exception using errcode = '42501', message = 'crm_access_required'; end if;
  return 0;
end;
$$;


ALTER FUNCTION "public"."refresh_crm_task_assignments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") RETURNS "public"."lead_catalogs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") IS 'Admin-only label change; leads keep their own text (no reclassification).';



CREATE OR REPLACE FUNCTION "public"."reporte_periodo_leads"() RETURNS TABLE("id" bigint, "Fecha" "text", "Medio" "text", "Campaña" "text", "GESTION" "text", "archived_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select l.id, l."Fecha", l."Medio", l."Campaña", l."GESTION", l.archived_at
  from public.leads l
  where public.is_active_user() and (public.is_crm_user() or public.is_campaign_editor())
$$;


ALTER FUNCTION "public"."reporte_periodo_leads"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reporte_periodo_leads"() IS 'Base del reporte de periodo sin PII (Fecha/Medio/Campana/GESTION); lectura CRM o editor de campanas. Nunca exponer nombres ni telefonos.';



CREATE OR REPLACE FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text" DEFAULT ''::"text") RETURNS "public"."lead_appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare old_appointment public.lead_appointments; created public.lead_appointments; new_notes text; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments where id = p_id;
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into old_appointment from public.lead_appointments
  where id = p_id and lead_id = target_lead_id and status = 'PROGRAMADA' for update;
  if old_appointment.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  perform 1 from public.user_access where user_id = old_appointment.advisor_user_id
    and activo = true and role in ('admin', 'agente', 'supervisor') for share;
  if not found then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  new_notes := case when coalesce(p_notes, '') = '' then old_appointment.notes else p_notes end;
  update public.lead_appointments set status = 'REPROGRAMADA', resolved_at = now(), updated_at = now() where id = p_id;
  insert into public.lead_appointments (
    lead_id, scheduled_at, advisor_user_id, advisor_name, notes, rescheduled_from_id,
    created_by_user_id, is_data_dura, student_name, contact_email, student_age, campus
  )
  values (
    old_appointment.lead_id, p_scheduled_at, old_appointment.advisor_user_id, old_appointment.advisor_name,
    new_notes, p_id, auth.uid(), old_appointment.is_data_dura, old_appointment.student_name,
    old_appointment.contact_email, old_appointment.student_age, old_appointment.campus
  ) returning * into created;
  return created;
end;
$$;


ALTER FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text") IS 'Modelo de equipo ratificado (turnos cruzados): cualquier usuario CRM activo reprograma una cita de otra asesora. El cambio queda en lead_appointment_events con el actor y las dos fechas (scheduled_at_anterior/scheduled_at_nuevo).';



CREATE OR REPLACE FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  stat_name text;
  stat public.campaign_stats;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;
  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  if p_mes is null or not (upper(btrim(p_mes)) = any (month_names)) then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;

  select * into stat from public.campaign_stats
  where campaign_name = stat_name and anio = p_anio and mes = upper(btrim(p_mes));
  if stat.id is null then
    return false; -- sin corrección manual: nada que reajustar
  end if;
  if access.role <> 'admin' and stat.creado_por is distinct from access.user_id then
    raise exception using errcode = '42501', message = 'own_campaign_stat_required';
  end if;
  delete from public.campaign_stats where id = stat.id;
  return true;
end;
$$;


ALTER FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") IS 'Admin o creador: elimina la corrección mensual manual de una campaña+mes para volver al cálculo automático (suma de períodos). No toca los períodos.';



CREATE OR REPLACE FUNCTION "public"."restore_lead"("p_id" bigint) RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."restore_lead"("p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_lead public.leads;
  v_gestion text;
  v_es_inscrito boolean;
  v_item jsonb;
  v_programa text;
  v_nivel text;
  v_fecha date;
  v_actor text;
  v_motivo text;
  v_actual record;
  v_resultado jsonb;
begin
  if p_lead_id is null then
    raise exception using errcode='22023', message='lead_id_required';
  end if;
  if p_enrollments is null then p_enrollments := '[]'::jsonb; end if;
  if jsonb_typeof(p_enrollments) <> 'array' then
    raise exception using errcode='22023', message='enrollments_invalid';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;

  select * into v_lead from public.leads where id = p_lead_id and archived_at is null for update;
  if not found then
    raise exception using errcode='P0002', message='lead_not_found';
  end if;
  v_gestion := upper(btrim(coalesce(v_lead."GESTION", '')));
  v_es_inscrito := v_gestion like 'INSCRIT%';

  if jsonb_array_length(p_enrollments) > 2 then
    raise exception using errcode='22023', message='enrollments_too_many';
  end if;
  if jsonb_array_length(p_enrollments) > 0 and not v_es_inscrito then
    raise exception using errcode='22023', message='lead_not_inscribed';
  end if;
  if (
    select count(distinct upper(btrim(coalesce(x->>'programa',''))))
    from jsonb_array_elements(p_enrollments) x
  ) <> jsonb_array_length(p_enrollments) then
    raise exception using errcode='22023', message='programa_duplicado';
  end if;

  for v_item in select * from jsonb_array_elements(p_enrollments) loop
    v_programa := upper(btrim(coalesce(v_item->>'programa','')));
    v_nivel := btrim(coalesce(v_item->>'nivel',''));
    if v_programa not in ('TEATRO_MUSICAL','ACTUACION') then
      raise exception using errcode='22023', message='programa_invalido';
    end if;
    if (v_programa = 'TEATRO_MUSICAL' and v_nivel not in ('MT Piojitos','MT Teens','MT Advance'))
       or (v_programa = 'ACTUACION' and v_nivel not in ('Acting Piojitos','Acting Teens','Acting 101 (Teens)','Acting Advance')) then
      raise exception using errcode='22023', message='nivel_invalido';
    end if;
    if nullif(btrim(coalesce(v_item->>'fecha_inscripcion','')), '') is null then
      v_fecha := null;
    else
      begin
        v_fecha := btrim(v_item->>'fecha_inscripcion')::date;
      exception when others then
        raise exception using errcode='22023', message='fecha_inscripcion_invalida';
      end;
    end if;
  end loop;

  select coalesce(nombre,'') into v_actor from public.user_access where user_id = auth.uid() limit 1;
  v_motivo := case when v_es_inscrito then 'programa_retirado' else 'cambio_estado' end;

  for v_actual in
    select e.id
    from public.lead_program_enrollments e
    where e.lead_id = p_lead_id and e.activa
      and e.programa <> all (
        select upper(btrim(coalesce(x->>'programa',''))) from jsonb_array_elements(p_enrollments) x
      )
    for update
  loop
    update public.lead_program_enrollments
       set activa = false,
           fecha_baja = now(),
           baja_motivo = v_motivo,
           actualizado_por = auth.uid(),
           actualizado_por_nombre = v_actor,
           updated_at = now()
     where id = v_actual.id;
  end loop;

  for v_item in select * from jsonb_array_elements(p_enrollments) loop
    v_programa := upper(btrim(coalesce(v_item->>'programa','')));
    v_nivel := btrim(coalesce(v_item->>'nivel',''));
    if nullif(btrim(coalesce(v_item->>'fecha_inscripcion','')), '') is null then
      v_fecha := null;
    else
      v_fecha := btrim(v_item->>'fecha_inscripcion')::date;
    end if;

    select * into v_actual
      from public.lead_program_enrollments
     where lead_id = p_lead_id and programa = v_programa and activa
     for update;

    if not found then
      insert into public.lead_program_enrollments (
        lead_id, programa, nivel, fecha_inscripcion, activa,
        registrado_por, registrado_por_nombre, actualizado_por, actualizado_por_nombre
      ) values (
        p_lead_id, v_programa, v_nivel, v_fecha, true,
        auth.uid(), v_actor, auth.uid(), v_actor
      );
    elsif v_actual.nivel <> v_nivel then
      update public.lead_program_enrollments
         set activa = false,
             fecha_baja = now(),
             baja_motivo = 'cambio_nivel',
             actualizado_por = auth.uid(),
             actualizado_por_nombre = v_actor,
             updated_at = now()
       where id = v_actual.id;
      insert into public.lead_program_enrollments (
        lead_id, programa, nivel, fecha_inscripcion, activa,
        registrado_por, registrado_por_nombre, actualizado_por, actualizado_por_nombre
      ) values (
        p_lead_id, v_programa, v_nivel, v_fecha, true,
        auth.uid(), v_actor, auth.uid(), v_actor
      );
    else
      update public.lead_program_enrollments
         set fecha_inscripcion = v_fecha,
             actualizado_por = auth.uid(),
             actualizado_por_nombre = v_actor,
             updated_at = now()
       where id = v_actual.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'lead_id', e.lead_id,
             'programa', e.programa,
             'nivel', e.nivel,
             'fecha_inscripcion', e.fecha_inscripcion,
             'created_at', e.created_at
           ) order by e.programa), '[]'::jsonb)
    into v_resultado
    from public.lead_program_enrollments e
   where e.lead_id = p_lead_id and e.activa;

  return v_resultado;
end;
$$;


ALTER FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") IS 'Guarda las inscripciones (programa/nivel/fecha) de un lead inscrito. Cierra (no borra) lo retirado y conserva el historial.';



CREATE OR REPLACE FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text" DEFAULT ''::"text") RETURNS "public"."lead_appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare updated public.lead_appointments; target_lead_id bigint;
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_status is null or p_status not in ('ASISTIO', 'NO_ASISTIO', 'CANCELADA') then raise exception using errcode = '22023', message = 'invalid_status'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select lead_id into target_lead_id from public.lead_appointments where id = p_id;
  perform 1 from public.leads where id = target_lead_id and archived_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and lead_id = target_lead_id for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  if updated.status = p_status then return updated; end if;
  if updated.status <> 'PROGRAMADA' then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments set status = p_status, resolved_at = now(), updated_at = now(), notes = case when coalesce(p_notes, '') = '' then notes else p_notes end
  where id = p_id returning * into updated;
  return updated;
end;
$$;


ALTER FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text") IS 'Modelo de equipo ratificado (turnos cruzados): cualquier usuario CRM activo (is_active_user + is_crm_user) registra ASISTIO/NO_ASISTIO/CANCELADA de cualquier cita, aunque la asesora asignada sea otra. La autoria se conserva en lead_appointment_events (action_user_id/action_name = actor) y se ve en el historial de la ficha. Editar datos y eliminar cita siguen siendo de la asesora asignada o de un admin.';



CREATE OR REPLACE FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) RETURNS "public"."lead_catalogs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) IS 'Admin-only enable/disable; deactivation only hides the value from filters and forms.';



CREATE OR REPLACE FUNCTION "public"."set_lead_gestion_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_lead_gestion_meta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_programa text;
begin
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'lead_id_required';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if not exists (select 1 from public.leads where id = p_lead_id and archived_at is null) then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  v_programa := nullif(btrim(coalesce(p_programa, '')), '');
  if v_programa is not null then
    -- El programa debe existir en el catálogo de campañas (activo o no: uno
    -- desactivado se conserva como histórico).
    if not exists (
      select 1 from public.lead_catalogs
       where kind = 'campana' and lower(btrim(value)) = lower(v_programa)
    ) then
      raise exception using errcode = '22023', message = 'programa_invalido';
    end if;
  end if;

  update public.leads
     set "PROGRAMA INSCRIPCION" = v_programa,
         updated_at = now()
   where id = p_lead_id and archived_at is null;

  return v_programa;
end;
$$;


ALTER FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") IS 'Guarda el programa de inscripción (campaña del catálogo) de un lead. Opcional: null lo deja sin programa. No toca la campaña de origen.';



CREATE TABLE IF NOT EXISTS "public"."agent_sessions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_name" "text" DEFAULT ''::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "end_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_sessions_end_reason_check" CHECK (("end_reason" = ANY (ARRAY['manual_logout'::"text", 'idle_timeout'::"text", 'session_invalid'::"text"])))
);


ALTER TABLE "public"."agent_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_sessions" IS 'Sesiones operativas de asesoras: inicio, ultima actividad, cierre y motivo. Resumen, sin clics ni PII. Retencion 90 dias.';



CREATE OR REPLACE FUNCTION "public"."start_agent_session"() RETURNS "public"."agent_sessions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  created public.agent_sessions;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if access.role <> 'agente' then return null; end if;
  delete from public.agent_sessions where ended_at is not null and ended_at < now() - interval '90 days';
  insert into public.agent_sessions (user_id, agent_name)
  values (auth.uid(), left(coalesce(access.nombre, ''), 120))
  returning * into created;
  return created;
end;
$$;


ALTER FUNCTION "public"."start_agent_session"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_access_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare target text := lower(btrim(new.email));
begin
  if target is not distinct from lower(btrim(old.email)) then return new; end if;
  -- Un conflicto UNIQUE/NOT NULL aborta tambien Auth: ambos correos cambian o ninguno.
  update public.user_access set email = target, updated_at = now()
  where user_id = new.id and email is distinct from target;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_user_access_email"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."sync_user_access_email"() IS 'Copia auth.users.email a user_access.email tras un cambio confirmado; no toca user_id, role ni activo.';



CREATE OR REPLACE FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date" DEFAULT NULL::"date", "p_hasta" "date" DEFAULT NULL::"date", "p_busqueda" "text" DEFAULT NULL::"text", "p_antes_id" bigint DEFAULT NULL::bigint, "p_limite" integer DEFAULT 100) RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  termino text := nullif(btrim(coalesce(p_busqueda, '')), '');
  patron text;
begin
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if p_origen is null or p_origen not in ('actual', 'historico')
     or (p_desde is null) <> (p_hasta is null)
     or (p_desde is not null and (p_desde > p_hasta or p_desde < date '2000-01-01' or p_hasta > date '2100-12-31'))
     or (termino is null and p_desde is null)
     or (termino is not null and (char_length(termino) < 3 or char_length(termino) > 80))
     or p_limite is null or p_limite < 1 or p_limite > 100
     or (p_antes_id is not null and p_antes_id < 1) then
    raise exception using errcode = '22023', message = 'tablero_filtros_invalidos';
  end if;
  patron := '%' || replace(replace(replace(termino, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  if p_origen = 'actual' then
    return query
      select to_jsonb(l) from public.leads l
      where l.archived_at is null and (p_antes_id is null or l.id < p_antes_id)
        and (p_desde is null or public._crm_fecha_ingreso(l."Fecha") between p_desde and p_hasta)
        and (termino is null or (coalesce(l."Nombre", '') || ' ' || coalesce(l."Apellido", '') || ' ' || coalesce(l."Telefono", '')) ilike patron escape chr(92))
      order by l.id desc limit p_limite + 1;
  else
    return query
      select to_jsonb(h) from public.leads_historico h
      where (p_antes_id is null or h.id < p_antes_id)
        and (p_desde is null or public._crm_fecha_ingreso(h."Fecha") between p_desde and p_hasta)
        and (termino is null or (coalesce(h."Nombre", '') || ' ' || coalesce(h."Apellido", '') || ' ' || coalesce(h."Telefono", '')) ilike patron escape chr(92))
      order by h.id desc limit p_limite + 1;
  end if;
end;
$$;


ALTER FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date", "p_hasta" "date", "p_busqueda" "text", "p_antes_id" bigint, "p_limite" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date", "p_hasta" "date", "p_busqueda" "text", "p_antes_id" bigint, "p_limite" integer) IS 'Tablero: lectura con RLS por origen, fecha de ingreso y/o texto, páginas acotadas; no modifica leads.';



CREATE OR REPLACE FUNCTION "public"."title_case_text"("v" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case
    when v is null then null
    when btrim(v) = '' then ''
    else upper(left(btrim(v), 1)) || lower(substr(btrim(v), 2))
  end;
$$;


ALTER FUNCTION "public"."title_case_text"("v" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."title_case_text"("v" "text") IS 'Helper interno de normalizacion de catalogos. Uso interno: no se expone a anon ni public.';



CREATE OR REPLACE FUNCTION "public"."touch_agent_session"("p_session_id" bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare n int;
begin
  if not public.is_active_user() then return false; end if;
  update public.agent_sessions
  set last_activity_at = now()
  where id = p_session_id and user_id = auth.uid() and ended_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;


ALTER FUNCTION "public"."touch_agent_session"("p_session_id" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."touch_agent_session"("p_session_id" bigint) IS 'Registra actividad de la sesion abierta. Exige usuario activo (is_active_user) y que la sesion sea del propio usuario.';



CREATE OR REPLACE FUNCTION "public"."trg_catalogs_normalize_value"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.kind = 'agente' then
    new.value := public.normalize_agent_name(new.value);
  else
    new.value := public.title_case_text(new.value);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_catalogs_normalize_value"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_leads_normalize_catalog_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new."GESTION"        := public.title_case_text(new."GESTION");
  new."ULTIMA GESTION" := public.title_case_text(new."ULTIMA GESTION");
  new."Mes"            := public.title_case_text(new."Mes");
  new."Medio"          := public.title_case_text(new."Medio");
  new."Campaña"        := public.title_case_text(new."Campaña");
  new."AGENTE"         := public.normalize_agent_name(new."AGENTE");
  new."ULTIMO AGENTE " := public.normalize_agent_name(new."ULTIMO AGENTE ");
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_leads_normalize_catalog_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_old_ag boolean := upper(btrim(coalesce(old."GESTION", ''))) like 'AGENDAD%';
  v_new_ag boolean := upper(btrim(coalesce(new."GESTION", ''))) like 'AGENDAD%';
  v_old_dd boolean := upper(btrim(coalesce(old."GESTION", ''))) like 'AGENDAD%DATA%DURA%';
  v_new_dd boolean := upper(btrim(coalesce(new."GESTION", ''))) like 'AGENDAD%DATA%DURA%';
begin
  if v_old_ag and v_new_ag and v_old_dd is distinct from v_new_dd then
    update public.lead_appointments
    set is_data_dura = v_new_dd
    where lead_id = new.id and status = 'PROGRAMADA';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"() IS 'Sincroniza lead_appointments.is_data_dura de citas PROGRAMADA cuando el lead cambia entre Agendado normal y Agendado Data Dura.';



CREATE OR REPLACE FUNCTION "public"."update_lead_appointment_campus"("p_id" bigint, "p_campus" "text") RETURNS "public"."lead_appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_lead_appointment_campus"("p_id" bigint, "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_appointment_details"("p_id" bigint, "p_details" "jsonb") RETURNS "public"."lead_appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  updated public.lead_appointments;
  d jsonb := public._appointment_details(p_details);
begin
  if not public.is_active_user() then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  select * into updated from public.lead_appointments
  where id = p_id and (public.is_admin_user() or advisor_user_id = auth.uid())
  for update;
  if updated.id is null then raise exception using errcode = 'P0002', message = 'appointment_not_found_or_forbidden'; end if;
  update public.lead_appointments
  set student_name = d->>'student_name',
      contact_email = d->>'contact_email',
      student_age = (d->>'student_age')::smallint,
      updated_at = now()
  where id = p_id
  returning * into updated;
  return updated;
end;
$$;


ALTER FUNCTION "public"."update_lead_appointment_details"("p_id" bigint, "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
  next_action text;
  followup_date_text text;
  followup_date date;
  set_parts text[] := array[]::text[];
  has_commercial boolean := false;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if (p_fields ? 'proxima_accion') is distinct from (p_fields ? 'fecha_seguimiento') then
    raise exception using errcode = '22023', message = 'followup_pair_required';
  end if;
  if p_fields ? 'proxima_accion' then
    if jsonb_typeof(p_fields->'proxima_accion') not in ('string', 'null')
       or jsonb_typeof(p_fields->'fecha_seguimiento') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'followup_string_required';
    end if;
    next_action := nullif(btrim(p_fields->>'proxima_accion', E' \t\r\n'), '');
    followup_date_text := nullif(btrim(p_fields->>'fecha_seguimiento', E' \t\r\n'), '');
    if (next_action is null) is distinct from (followup_date_text is null) then
      raise exception using errcode = '22023', message = 'followup_pair_required';
    end if;
    if length(next_action) > 200 then
      raise exception using errcode = '22023', message = 'proxima_accion_too_long';
    end if;
    if followup_date_text is not null then
      if followup_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end if;
      begin
        followup_date := followup_date_text::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end;
      if to_char(followup_date, 'YYYY-MM-DD') <> followup_date_text then
        raise exception using errcode = '22023', message = 'fecha_seguimiento_invalida';
      end if;
    end if;
    p_fields := p_fields || jsonb_build_object('proxima_accion', next_action, 'fecha_seguimiento', followup_date);
  end if;

  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  -- Solo fragmentos constantes; todos los valores JSON viajan en USING.
  -- A diferencia de quote_literal(NULL), los parametros admiten JSON null.
  if p_fields ? 'Nombre' then
    set_parts := array_append(set_parts, '"Nombre" = left(coalesce($1->>''Nombre'', "Nombre"), 200)');
    has_commercial := true;
  end if;
  if p_fields ? 'Telefono' then
    set_parts := array_append(set_parts, '"Telefono" = left(coalesce($1->>''Telefono'', "Telefono"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'GESTION' then
    set_parts := array_append(set_parts, '"GESTION" = left(coalesce($1->>''GESTION'', "GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'Fecha Última Gestión' or p_fields ? 'Fecha Última Gestión ' then
    set_parts := array_append(set_parts, '"Fecha Última Gestión " = left(coalesce($1->>''Fecha Última Gestión'', $1->>''Fecha Última Gestión '', "Fecha Última Gestión "), 40)');
    has_commercial := true;
  end if;
  if p_fields ? 'ULTIMA GESTION' then
    set_parts := array_append(set_parts, '"ULTIMA GESTION" = left(coalesce($1->>''ULTIMA GESTION'', "ULTIMA GESTION"), 80)');
    has_commercial := true;
  end if;
  if p_fields ? 'OBSERVACIONES' or p_fields ? 'OBSERVACIONES ' then
    set_parts := array_append(set_parts, '"OBSERVACIONES " = left(coalesce($1->>''OBSERVACIONES'', $1->>''OBSERVACIONES '', "OBSERVACIONES "), 5000)');
    has_commercial := true;
  end if;
  if p_fields ? 'INTERESADO EN' then
    set_parts := array_append(set_parts, '"INTERESADO EN" = nullif(left(coalesce($1->>''INTERESADO EN'', "INTERESADO EN"), 120), '''')');
    has_commercial := true;
  end if;
  if p_fields ? 'proxima_accion' then
    set_parts := array_append(set_parts, 'proxima_accion = $1->>''proxima_accion'', fecha_seguimiento = ($1->>''fecha_seguimiento'')::date');
  end if;
  if has_commercial then
    set_parts := array_append(set_parts, '"ULTIMO AGENTE " = left($3, 120)');
  end if;
  if array_length(set_parts, 1) is null then
    updated := current_lead;
  else
    set_parts := array_append(set_parts, 'updated_at = now()');
    execute 'update public.leads set ' || array_to_string(set_parts, ', ') || ' where id = $2 and archived_at is null returning *'
      into updated using p_fields, p_id, access.nombre;
  end if;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
  end if;
  return updated;
end;
$_$;


ALTER FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") IS 'Agentes actualizan solo campos de seguimiento; pasar a AGENDAD* exige crear cita.';



CREATE OR REPLACE FUNCTION "public"."update_lead_followup_with_appointment_campus"("p_id" bigint, "p_fields" "jsonb", "p_appointment_id" bigint, "p_campus" "text") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  appointment_lead_id bigint;
  updated public.leads;
begin
  select lead_id into appointment_lead_id
  from public.lead_appointments
  where id = p_appointment_id;

  if appointment_lead_id is null or appointment_lead_id <> p_id then
    raise exception using errcode = 'P0002', message = 'appointment_not_found_or_wrong_lead';
  end if;

  -- Orden de locks: lead primero; cita despues. Cada RPC conserva sus guards.
  if public.is_admin_user() then
    updated := public.update_lead_full(p_id, p_fields);
  else
    updated := public.update_lead_followup(p_id, p_fields);
  end if;
  perform public.update_lead_appointment_campus(p_appointment_id, p_campus);
  return updated;
end;
$$;


ALTER FUNCTION "public"."update_lead_followup_with_appointment_campus"("p_id" bigint, "p_fields" "jsonb", "p_appointment_id" bigint, "p_campus" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  updated public.leads;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
  followup_fields jsonb;
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
    'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
    'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
    'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'
  ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'full_edit_fields_only';
  end if;
  -- No tocar columnas comerciales (ni sus triggers) al guardar solo el par.
  if p_lead - array['proxima_accion', 'fecha_seguimiento'] = '{}'::jsonb then
    return public.update_lead_followup(p_id, p_lead);
  end if;
  if p_lead ? 'Nombre' and btrim(coalesce(p_lead->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_lead ? 'Telefono'
     and btrim(coalesce(p_lead->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_lead->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_lead->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "Mes" = left(coalesce(p_lead->>'Mes', "Mes"), 40),
      "Fecha" = left(coalesce(p_lead->>'Fecha', "Fecha"), 40),
      "Nombre" = left(coalesce(p_lead->>'Nombre', "Nombre"), 200),
      "Telefono" = left(coalesce(p_lead->>'Telefono', "Telefono"), 80),
      "Campaña" = left(coalesce(p_lead->>'Campaña', "Campaña"), 120),
      "Medio" = left(coalesce(p_lead->>'Medio', "Medio"), 80),
      "Ciudad" = left(coalesce(p_lead->>'Ciudad', "Ciudad"), 120),
      "AGENTE" = left(coalesce(p_lead->>'AGENTE', p_lead->>'Agente', p_lead->>'Agente ', "AGENTE"), 120),
      "Odoo" = left(coalesce(p_lead->>'Odoo', "Odoo"), 80),
      "Fecha de Atencion" = left(coalesce(p_lead->>'Fecha de Atencion', "Fecha de Atencion"), 40),
      "LANDING" = left(coalesce(p_lead->>'LANDING', "LANDING"), 500),
      "GESTION" = left(coalesce(p_lead->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_lead->>'Fecha Última Gestión', p_lead->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_lead->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "OBSERVACIONES " = left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      "INTERESADO EN" = nullif(left(coalesce(p_lead->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_lead ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
  end if;
  -- Si falla validacion del par, tambien se revierte el UPDATE comercial.
  if p_lead ?| array['proxima_accion', 'fecha_seguimiento'] then
    select jsonb_object_agg(key, value) into followup_fields
    from jsonb_each(p_lead) where key in ('proxima_accion', 'fecha_seguimiento');
    updated := public.update_lead_followup(p_id, followup_fields);
  end if;
  return updated;
end;
$_$;


ALTER FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") IS 'Edicion completa de admin; pasar a AGENDAD* exige crear cita.';



CREATE OR REPLACE FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") RETURNS "public"."lead_notes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") IS 'Admin-only note edit; agents always get admin_required.';



CREATE OR REPLACE FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text" DEFAULT ''::"text", "p_advisor_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', '')));
  if previous_gestion like 'AGENDAD%' or next_gestion not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'agendado_transition_required';
  end if;

  if access.role = 'admin' then
    if p_fields - array[
      'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
      'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ',
      'proxima_accion', 'fecha_seguimiento', 'INTERESADO EN'
    ] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'full_edit_fields_only';
    end if;
    -- accion y fecha deben ir juntas o vacias
    if (p_fields ? 'proxima_accion') is distinct from (p_fields ? 'fecha_seguimiento') then
      raise exception using errcode = '22023', message = 'followup_pair_required';
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
        "INTERESADO EN" = case when p_fields ? 'INTERESADO EN' then nullif(left(coalesce(p_fields->>'INTERESADO EN', ''), 120), '') else "INTERESADO EN" end,
        proxima_accion = case when p_fields ? 'proxima_accion' then nullif(left(coalesce(p_fields->>'proxima_accion', ''), 200), '') else proxima_accion end,
        fecha_seguimiento = case when p_fields ? 'fecha_seguimiento' then nullif(p_fields->>'fecha_seguimiento', '')::date else fecha_seguimiento end,
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields - array['GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'proxima_accion', 'fecha_seguimiento'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'followup_fields_only';
    end if;
    if (p_fields ? 'proxima_accion') is distinct from (p_fields ? 'fecha_seguimiento') then
      raise exception using errcode = '22023', message = 'followup_pair_required';
    end if;
    update public.leads
    set "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "ULTIMO AGENTE " = left(access.nombre, 120),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        proxima_accion = case when p_fields ? 'proxima_accion' then nullif(left(coalesce(p_fields->>'proxima_accion', ''), 200), '') else proxima_accion end,
        fecha_seguimiento = case when p_fields ? 'fecha_seguimiento' then nullif(p_fields->>'fecha_seguimiento', '')::date else fecha_seguimiento end,
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return updated;
end;
$$;


ALTER FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text" DEFAULT ''::"text", "p_advisor_user_id" "uuid" DEFAULT NULL::"uuid", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."leads"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.update_lead_with_appointment(p_id, p_fields, p_scheduled_at, p_notes, p_advisor_user_id, p_details, null::text);
$$;


ALTER FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") RETURNS "public"."leads"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
  followup_fields jsonb;
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
  if p_fields ? 'Nombre' and btrim(coalesce(p_fields->>'Nombre', '')) = '' then
    raise exception using errcode = '22023', message = 'nombre_required';
  end if;
  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if p_fields ? 'Telefono'
     and btrim(coalesce(p_fields->>'Telefono', '')) is distinct from btrim(coalesce(current_lead."Telefono", ''))
     and coalesce(regexp_replace(coalesce(p_fields->>'Telefono', ''), chr(92)||'D', '', 'g'), '') !~ '^[0-9]{7,15}$'
  then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', '')));
  if previous_gestion like 'AGENDAD%' or next_gestion not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'agendado_transition_required';
  end if;
  if access.role = 'admin' then
    if p_fields - array[
      'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
      'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'
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
        "INTERESADO EN" = nullif(left(coalesce(p_fields->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields - array['Nombre', 'Telefono', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES ', 'INTERESADO EN', 'proxima_accion', 'fecha_seguimiento'] <> '{}'::jsonb then
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
        "INTERESADO EN" = nullif(left(coalesce(p_fields->>'INTERESADO EN', "INTERESADO EN"), 120), ''),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;
  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  if (p_fields ? 'Nombre') and updated.contact_id is not null then
    update public.lead_contacts set nombre = left(updated."Nombre", 200), updated_at = now()
    where id = updated.contact_id and (btrim(coalesce(nombre, '')) = '' or upper(btrim(nombre)) in ('SN', 'S/N', 'SIN NOMBRE'));
  end if;
  -- Validacion y persistencia reutilizadas; cualquier error revierte lead/contacto.
  if p_fields ?| array['proxima_accion', 'fecha_seguimiento'] then
    select jsonb_object_agg(key, value) into followup_fields
    from jsonb_each(p_fields) where key in ('proxima_accion', 'fecha_seguimiento');
    updated := public.update_lead_followup(p_id, followup_fields);
  end if;
  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus);
  return updated;
end;
$_$;


ALTER FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_period_stats" (
    "id" bigint NOT NULL,
    "campaign_name" "text" NOT NULL,
    "desde" "date" NOT NULL,
    "hasta" "date" NOT NULL,
    "alcance" integer DEFAULT 0 NOT NULL,
    "gasto" numeric DEFAULT 0 NOT NULL,
    "resultados" integer DEFAULT 0 NOT NULL,
    "creado_por" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_period_stats_alcance_check" CHECK (("alcance" >= 0)),
    CONSTRAINT "campaign_period_stats_gasto_check" CHECK (("gasto" >= (0)::numeric)),
    CONSTRAINT "campaign_period_stats_rango_anios" CHECK ((("desde" >= '2024-01-01'::"date") AND ("hasta" <= '2100-12-31'::"date"))),
    CONSTRAINT "campaign_period_stats_rango_valido" CHECK (("desde" <= "hasta")),
    CONSTRAINT "campaign_period_stats_resultados_check" CHECK (("resultados" >= 0)),
    CONSTRAINT "campaign_period_stats_un_mes" CHECK (("date_trunc"('month'::"text", ("desde")::timestamp with time zone) = "date_trunc"('month'::"text", ("hasta")::timestamp with time zone)))
);


ALTER TABLE "public"."campaign_period_stats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) RETURNS "public"."campaign_period_stats"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  period_row public.campaign_period_stats;
  stat_name text;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;

  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception using errcode = '22023', message = 'period_range_required';
  end if;
  if p_desde > p_hasta then
    raise exception using errcode = '22023', message = 'period_range_invalid';
  end if;
  if date_trunc('month', p_desde) <> date_trunc('month', p_hasta) then
    raise exception using errcode = '22023', message = 'period_month_required';
  end if;
  if coalesce(p_alcance, 0) < 0 or coalesce(p_gasto, 0) < 0 or coalesce(p_resultados, 0) < 0 then
    raise exception using errcode = '22023', message = 'negative_value_not_allowed';
  end if;

  -- Mismo período exacto: actualizar cifras (sin duplicar). Fila ajena: admin.
  select * into period_row
  from public.campaign_period_stats
  where campaign_name = stat_name and desde = p_desde and hasta = p_hasta;
  if period_row.id is not null then
    if access.role <> 'admin' and period_row.creado_por is distinct from access.user_id then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
    update public.campaign_period_stats
    set alcance = coalesce(p_alcance, 0),
        gasto = coalesce(p_gasto, 0),
        resultados = coalesce(p_resultados, 0),
        updated_at = now()
    where id = period_row.id
    returning * into period_row;
    return period_row;
  end if;

  -- Solape parcial con otro período de la misma campaña: rechazar con código propio.
  if exists (
    select 1 from public.campaign_period_stats
    where campaign_name = stat_name
      and daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]')
  ) then
    raise exception using errcode = '22023', message = 'period_overlap';
  end if;

  insert into public.campaign_period_stats (campaign_name, desde, hasta, alcance, gasto, resultados, creado_por)
  values (stat_name, p_desde, p_hasta,
          coalesce(p_alcance, 0), coalesce(p_gasto, 0), coalesce(p_resultados, 0), access.user_id)
  returning * into period_row;
  return period_row;
end;
$$;


ALTER FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) IS 'Admin/trafficker/supervisor (via is_campaign_editor()); períodos dentro de un mismo mes; mismo período exacto actualiza cifras; solape -> 22023 period_overlap; editar la fila de otro creador exige ser admin (42501 own_campaign_stat_required).';



CREATE TABLE IF NOT EXISTS "public"."campaign_stats" (
    "id" bigint NOT NULL,
    "campaign_name" "text" NOT NULL,
    "anio" integer NOT NULL,
    "mes" "text" NOT NULL,
    "estado" "text" DEFAULT 'activa'::"text" NOT NULL,
    "alcance" integer DEFAULT 0 NOT NULL,
    "gasto" numeric DEFAULT 0 NOT NULL,
    "resultados" integer DEFAULT 0 NOT NULL,
    "creado_por" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_stats_alcance_check" CHECK (("alcance" >= 0)),
    CONSTRAINT "campaign_stats_anio_check" CHECK ((("anio" >= 2024) AND ("anio" <= 2100))),
    CONSTRAINT "campaign_stats_estado_check" CHECK (("estado" = ANY (ARRAY['activa'::"text", 'pausada'::"text", 'finalizada'::"text"]))),
    CONSTRAINT "campaign_stats_gasto_check" CHECK (("gasto" >= (0)::numeric)),
    CONSTRAINT "campaign_stats_mes_check" CHECK (("mes" = ANY (ARRAY['ENERO'::"text", 'FEBRERO'::"text", 'MARZO'::"text", 'ABRIL'::"text", 'MAYO'::"text", 'JUNIO'::"text", 'JULIO'::"text", 'AGOSTO'::"text", 'SEPTIEMBRE'::"text", 'OCTUBRE'::"text", 'NOVIEMBRE'::"text", 'DICIEMBRE'::"text"]))),
    CONSTRAINT "campaign_stats_resultados_check" CHECK (("resultados" >= 0))
);


ALTER TABLE "public"."campaign_stats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) RETURNS "public"."campaign_stats"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  access public.user_access;
  stat public.campaign_stats;
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  stat_name text;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;

  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  if p_mes is null or not (upper(btrim(p_mes)) = any (month_names)) then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;
  if p_estado is null or p_estado not in ('activa', 'pausada', 'finalizada') then
    raise exception using errcode = '22023', message = 'invalid_estado';
  end if;
  if coalesce(p_alcance, 0) < 0 or coalesce(p_gasto, 0) < 0 or coalesce(p_resultados, 0) < 0 then
    raise exception using errcode = '22023', message = 'negative_value_not_allowed';
  end if;

  if p_id is null then
    -- Insert o correccion de la fila del mes existente (upsert por el unique).
    insert into public.campaign_stats (campaign_name, anio, mes, estado, alcance, gasto, resultados, creado_por)
    values (stat_name, p_anio, upper(btrim(p_mes)), p_estado,
            coalesce(p_alcance, 0), coalesce(p_gasto, 0), coalesce(p_resultados, 0), access.user_id)
    on conflict (campaign_name, anio, mes) do update
    set estado = excluded.estado,
        alcance = excluded.alcance,
        gasto = excluded.gasto,
        resultados = excluded.resultados,
        updated_at = now()
    where public.is_admin_user() or public.campaign_stats.creado_por = access.user_id
    returning * into stat;
    if stat.id is null then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
  else
    select * into stat from public.campaign_stats where id = p_id;
    if stat.id is null then
      raise exception using errcode = 'P0002', message = 'campaign_stat_not_found';
    end if;
    if access.role <> 'admin' and stat.creado_por is distinct from access.user_id then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
    update public.campaign_stats
    set campaign_name = stat_name,
        anio = p_anio,
        mes = upper(btrim(p_mes)),
        estado = p_estado,
        alcance = coalesce(p_alcance, 0),
        gasto = coalesce(p_gasto, 0),
        resultados = coalesce(p_resultados, 0),
        updated_at = now()
    where id = p_id
    returning * into stat;
  end if;

  return stat;
end;
$$;


ALTER FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) IS 'Admin/trafficker/supervisor (via is_campaign_editor()); upsert por (campaign_name, anio, mes); editar la fila de otro creador exige ser admin (42501 own_campaign_stat_required).';



CREATE TABLE IF NOT EXISTS "public"."daily_report_notes" (
    "id" bigint NOT NULL,
    "report_date" "date" NOT NULL,
    "autor_name" "text" NOT NULL,
    "autor_user_id" "uuid" DEFAULT "auth"."uid"(),
    "problemas" "text" DEFAULT ''::"text" NOT NULL,
    "observaciones" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "daily_report_notes_observaciones_check" CHECK (("length"("observaciones") <= 5000)),
    CONSTRAINT "daily_report_notes_problemas_check" CHECK (("length"("problemas") <= 5000))
);


ALTER TABLE "public"."daily_report_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_report_notes" IS 'Manual daily report notes per advisor and date; shared read, RPC-enforced writes (agents: own note today only; admin: any).';



CREATE OR REPLACE FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") RETURNS "public"."daily_report_notes"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") IS 'Saves the daily report note for a date and advisor; agents only their own note for today in Miami time, admin any.';



CREATE OR REPLACE FUNCTION "public"."webhook_rate_limit_hit"("p_ip" "text", "p_maximo" integer, "p_ventana_segundos" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_hits integer;
begin
  if p_ip is null or btrim(p_ip) = '' then return 0; end if;
  if p_maximo is null or p_maximo < 1 then p_maximo := 30; end if;
  if p_ventana_segundos is null or p_ventana_segundos < 1 then p_ventana_segundos := 60; end if;

  insert into public.webhook_rate_limit as t (ip, hits, ventana)
  values (p_ip, 1, now())
  on conflict (ip) do update
    set hits = case when t.ventana < now() - make_interval(secs => p_ventana_segundos) then 1 else t.hits + 1 end,
        ventana = case when t.ventana < now() - make_interval(secs => p_ventana_segundos) then now() else t.ventana end
  returning hits into v_hits;

  -- Limpieza de filas que ya no sirven (la ventana es corta).
  delete from public.webhook_rate_limit where ventana < now() - interval '1 day';

  return v_hits;
end;
$$;


ALTER FUNCTION "public"."webhook_rate_limit_hit"("p_ip" "text", "p_maximo" integer, "p_ventana_segundos" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."webhook_rate_limit_hit"("p_ip" "text", "p_maximo" integer, "p_ventana_segundos" integer) IS 'Contador global de peticiones por IP (ventana fija). Devuelve el numero de peticiones de la ventana actual; la tabla vive en la base de datos porque el contador en memoria de la edge function se reparte entre instancias. Uso interno: service_role.';



CREATE TABLE IF NOT EXISTS "public"."_bkp_lead_gestiones_20260926" (
    "id" bigint,
    "lead_id" bigint,
    "fecha_gestion" "date",
    "gestion_anterior" "text",
    "gestion_nueva" "text",
    "canal" "text",
    "autor_name" "text",
    "autor_user_id" "uuid",
    "created_at" timestamp with time zone
);


ALTER TABLE "public"."_bkp_lead_gestiones_20260926" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_bkp_leads_20261005" (
    "id" bigint,
    "Mes" "text",
    "Fecha" "text",
    "Nombre" "text",
    "Telefono" "text",
    "Campaña" "text",
    "Medio" "text",
    "GESTION" "text",
    "Interesado en " "text",
    "Ciudad" "text",
    "AGENTE" "text",
    "Odoo" "text",
    "Fecha de Atencion" "text",
    "OBSERVACIONES " "text",
    "Fecha Última Gestión " "text",
    "ULTIMA GESTION" "text",
    "ULTIMO AGENTE " "text",
    "LANDING" "text",
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "contact_id" bigint,
    "whatsapp_message_id" "text"
);


ALTER TABLE "public"."_bkp_leads_20261005" OWNER TO "postgres";


ALTER TABLE "public"."agent_sessions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."agent_sessions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."authorize_bootstrap" (
    "singleton" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "authorize_bootstrap_singleton_check" CHECK ("singleton")
);


ALTER TABLE "public"."authorize_bootstrap" OWNER TO "postgres";


ALTER TABLE "public"."campaign_period_stats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."campaign_period_stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."campaign_stats" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."campaign_stats_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."crm_task_presence" (
    "user_id" "uuid" NOT NULL,
    "last_seen_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."crm_task_presence" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."crm_tasks_visible" WITH ("security_invoker"='true') AS
 SELECT "id",
    "lead_id",
    "descripcion",
    "scheduled_at",
    "created_by",
    "assignee_id",
    "status",
    "history",
    "claimed_at",
    "completed_at",
    "created_at",
    "updated_at",
    (("status" = 'asignada'::"text") AND "public"."crm_task_is_shared"("assignee_id", "scheduled_at", "claimed_at")) AS "is_shared"
   FROM "public"."crm_tasks" "t";


ALTER VIEW "public"."crm_tasks_visible" OWNER TO "postgres";


ALTER TABLE "public"."daily_report_notes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."daily_report_notes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lead_appointment_events" (
    "id" bigint NOT NULL,
    "appointment_id" bigint NOT NULL,
    "status_anterior" "text",
    "status_nuevo" "text" NOT NULL,
    "actor_user_id" "uuid",
    "actor_name" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_at_anterior" timestamp with time zone,
    "scheduled_at_nuevo" timestamp with time zone,
    CONSTRAINT "lead_appointment_events_status_anterior_check" CHECK ((("status_anterior" IS NULL) OR ("status_anterior" = ANY (ARRAY['PROGRAMADA'::"text", 'ASISTIO'::"text", 'NO_ASISTIO'::"text", 'CANCELADA'::"text", 'REPROGRAMADA'::"text"])))),
    CONSTRAINT "lead_appointment_events_status_nuevo_check" CHECK (("status_nuevo" = ANY (ARRAY['PROGRAMADA'::"text", 'ASISTIO'::"text", 'NO_ASISTIO'::"text", 'CANCELADA'::"text", 'REPROGRAMADA'::"text"])))
);


ALTER TABLE "public"."lead_appointment_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_appointment_events" IS 'Historial de resultados y reprogramaciones de citas. action_user_id/action_name = quien registro el cambio (actor), no la asesora asignada a la cita.';



ALTER TABLE "public"."lead_appointment_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_appointment_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."lead_appointments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_appointments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."lead_catalogs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_catalogs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lead_contacts" (
    "id" bigint NOT NULL,
    "phone_normalized" "text" NOT NULL,
    "phone_display" "text" DEFAULT ''::"text" NOT NULL,
    "nombre" "text" DEFAULT ''::"text" NOT NULL,
    "ciudad" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_contacts_phone_digits" CHECK (("phone_normalized" ~ '^[0-9]{7,15}$'::"text"))
);


ALTER TABLE "public"."lead_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_contacts" IS 'Contacto unico por telefono normalizado. Fase 1 de dedup: leads conserva su columna "Telefono"; la retirada es una fase posterior tras verificacion.';



ALTER TABLE "public"."lead_contacts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_contacts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lead_gestiones" (
    "id" bigint NOT NULL,
    "lead_id" bigint NOT NULL,
    "fecha_gestion" "date" NOT NULL,
    "gestion_anterior" "text",
    "gestion_nueva" "text" NOT NULL,
    "canal" "text",
    "autor_name" "text",
    "autor_user_id" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_data_dura" boolean
);


ALTER TABLE "public"."lead_gestiones" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_gestiones" IS 'Append-only history of lead gestion changes; written by trigger.';



COMMENT ON COLUMN "public"."lead_gestiones"."is_data_dura" IS 'Marca manual: true = Llamada Data Dura, false = Llamada normal en gestiones nuevas, null = historico (el reporte aplica la regla por Mes/Fecha).';



ALTER TABLE "public"."lead_gestiones" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_gestiones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."lead_notes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_notes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lead_program_enrollments" (
    "id" bigint NOT NULL,
    "lead_id" bigint NOT NULL,
    "programa" "text" NOT NULL,
    "nivel" "text" NOT NULL,
    "fecha_inscripcion" "date",
    "activa" boolean DEFAULT true NOT NULL,
    "fecha_baja" timestamp with time zone,
    "baja_motivo" "text",
    "registrado_por" "uuid",
    "registrado_por_nombre" "text" DEFAULT ''::"text" NOT NULL,
    "actualizado_por" "uuid",
    "actualizado_por_nombre" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_program_enrollments_check" CHECK (((("programa" = 'TEATRO_MUSICAL'::"text") AND ("nivel" = ANY (ARRAY['MT Piojitos'::"text", 'MT Teens'::"text", 'MT Advance'::"text"]))) OR (("programa" = 'ACTUACION'::"text") AND ("nivel" = ANY (ARRAY['Acting Piojitos'::"text", 'Acting Teens'::"text", 'Acting 101 (Teens)'::"text", 'Acting Advance'::"text"]))))),
    CONSTRAINT "lead_program_enrollments_programa_check" CHECK (("programa" = ANY (ARRAY['TEATRO_MUSICAL'::"text", 'ACTUACION'::"text"])))
);


ALTER TABLE "public"."lead_program_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."lead_program_enrollments" IS 'Inscripciones por programa y nivel. Una fila activa por persona y programa; las filas dadas de baja conservan el historial.';



ALTER TABLE "public"."lead_program_enrollments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lead_program_enrollments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."leads_historico" (
    "id" bigint NOT NULL,
    "Mes" "text",
    "Fecha" "text",
    "Nombre" "text",
    "Apellido" "text",
    "Telefono" "text",
    "Campaña" "text",
    "Medio" "text",
    "GESTION" "text",
    "AGENTE" "text",
    "Odoo" "text",
    "Fecha de Atencion" "text",
    "OBSERVACIONES " "text",
    "source_year" smallint DEFAULT 2025 NOT NULL,
    "source_file" "text",
    "source_row" integer,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telefono_normalizado" "text" GENERATED ALWAYS AS ("regexp_replace"(COALESCE("Telefono", ''::"text"), '\D'::"text", ''::"text", 'g'::"text")) STORED,
    "registro_key" "text" GENERATED ALWAYS AS (((('historico_'::"text" || ("source_year")::"text") || '_'::"text") || ("id")::"text")) STORED
);


ALTER TABLE "public"."leads_historico" OWNER TO "postgres";


COMMENT ON TABLE "public"."leads_historico" IS 'Read-only 2025 historical leads imported from the source CSV; the app never writes to it. Relates to public.leads by telefono_normalizado (digits only) and is audited via source_year/source_file/source_row.';



ALTER TABLE "public"."leads_historico" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."leads_historico_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."leads" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."leads_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_rate_limit" (
    "ip" "text" NOT NULL,
    "hits" integer DEFAULT 0 NOT NULL,
    "ventana" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_rate_limit" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."authorize_bootstrap"
    ADD CONSTRAINT "authorize_bootstrap_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."campaign_period_stats"
    ADD CONSTRAINT "campaign_period_stats_no_solape" EXCLUDE USING "gist" ("campaign_name" WITH =, "daterange"("desde", "hasta", '[]'::"text") WITH &&);



ALTER TABLE ONLY "public"."campaign_period_stats"
    ADD CONSTRAINT "campaign_period_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_period_stats"
    ADD CONSTRAINT "campaign_period_stats_unique_period" UNIQUE ("campaign_name", "desde", "hasta");



ALTER TABLE ONLY "public"."campaign_stats"
    ADD CONSTRAINT "campaign_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_stats"
    ADD CONSTRAINT "campaign_stats_unique_period" UNIQUE ("campaign_name", "anio", "mes");



ALTER TABLE ONLY "public"."crm_task_presence"
    ADD CONSTRAINT "crm_task_presence_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_report_notes"
    ADD CONSTRAINT "daily_report_notes_fecha_autor_key" UNIQUE ("report_date", "autor_user_id");



ALTER TABLE ONLY "public"."daily_report_notes"
    ADD CONSTRAINT "daily_report_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_appointment_events"
    ADD CONSTRAINT "lead_appointment_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_appointments"
    ADD CONSTRAINT "lead_appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_catalogs"
    ADD CONSTRAINT "lead_catalogs_kind_value_key" UNIQUE ("kind", "value");



ALTER TABLE ONLY "public"."lead_catalogs"
    ADD CONSTRAINT "lead_catalogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_contacts"
    ADD CONSTRAINT "lead_contacts_phone_key" UNIQUE ("phone_normalized");



ALTER TABLE ONLY "public"."lead_contacts"
    ADD CONSTRAINT "lead_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_gestiones"
    ADD CONSTRAINT "lead_gestiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_program_enrollments"
    ADD CONSTRAINT "lead_program_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads_historico"
    ADD CONSTRAINT "leads_historico_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_access"
    ADD CONSTRAINT "user_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_access"
    ADD CONSTRAINT "user_access_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."webhook_rate_limit"
    ADD CONSTRAINT "webhook_rate_limit_pkey" PRIMARY KEY ("ip");



CREATE INDEX "agent_sessions_open_idx" ON "public"."agent_sessions" USING "btree" ("id") WHERE ("ended_at" IS NULL);



CREATE INDEX "agent_sessions_user_idx" ON "public"."agent_sessions" USING "btree" ("user_id", "id" DESC);



CREATE INDEX "campaign_period_stats_campaign_idx" ON "public"."campaign_period_stats" USING "btree" ("campaign_name");



CREATE INDEX "campaign_period_stats_desde_idx" ON "public"."campaign_period_stats" USING "btree" ("desde");



CREATE INDEX "campaign_period_stats_hasta_idx" ON "public"."campaign_period_stats" USING "btree" ("hasta");



CREATE INDEX "campaign_stats_campaign_idx" ON "public"."campaign_stats" USING "btree" ("campaign_name");



CREATE INDEX "crm_tasks_assignee_idx" ON "public"."crm_tasks" USING "btree" ("assignee_id", "status", "scheduled_at");



CREATE INDEX "crm_tasks_status_idx" ON "public"."crm_tasks" USING "btree" ("status", "scheduled_at");



CREATE INDEX "daily_report_notes_fecha_idx" ON "public"."daily_report_notes" USING "btree" ("report_date");



CREATE INDEX "idx_leads_gestion" ON "public"."leads" USING "btree" ("GESTION");



CREATE INDEX "idx_leads_mes" ON "public"."leads" USING "btree" ("Mes");



CREATE INDEX "lead_appointment_events_appointment_created_idx" ON "public"."lead_appointment_events" USING "btree" ("appointment_id", "created_at");



CREATE INDEX "lead_appointments_advisor_scheduled_idx" ON "public"."lead_appointments" USING "btree" ("advisor_user_id", "scheduled_at");



CREATE INDEX "lead_appointments_lead_scheduled_idx" ON "public"."lead_appointments" USING "btree" ("lead_id", "scheduled_at");



CREATE UNIQUE INDEX "lead_appointments_one_programmed_per_lead_uidx" ON "public"."lead_appointments" USING "btree" ("lead_id") WHERE ("status" = 'PROGRAMADA'::"text");



COMMENT ON INDEX "public"."lead_appointments_one_programmed_per_lead_uidx" IS 'Como maximo una cita PROGRAMADA por lead; varias historicas siguen permitidas.';



CREATE INDEX "lead_appointments_status_idx" ON "public"."lead_appointments" USING "btree" ("status");



CREATE INDEX "lead_gestiones_lead_fecha_created_idx" ON "public"."lead_gestiones" USING "btree" ("lead_id", "fecha_gestion" DESC, "created_at" DESC);



CREATE INDEX "lead_notes_lead_id_idx" ON "public"."lead_notes" USING "btree" ("lead_id", "created_at" DESC);



CREATE UNIQUE INDEX "lead_program_enrollments_activa_unica" ON "public"."lead_program_enrollments" USING "btree" ("lead_id", "programa") WHERE "activa";



CREATE INDEX "lead_program_enrollments_lead_idx" ON "public"."lead_program_enrollments" USING "btree" ("lead_id");



CREATE INDEX "leads_active_id_idx" ON "public"."leads" USING "btree" ("id") WHERE ("archived_at" IS NULL);



CREATE INDEX "leads_archived_at_idx" ON "public"."leads" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);



CREATE INDEX "leads_contact_id_idx" ON "public"."leads" USING "btree" ("contact_id");



CREATE INDEX "leads_historico_source_year_mes_idx" ON "public"."leads_historico" USING "btree" ("source_year", "Mes");



CREATE INDEX "leads_historico_telefono_norm_idx" ON "public"."leads_historico" USING "btree" ("telefono_normalizado") WHERE ("telefono_normalizado" <> ''::"text");



CREATE UNIQUE INDEX "leads_whatsapp_message_id_uidx" ON "public"."leads" USING "btree" ("whatsapp_message_id") WHERE ("whatsapp_message_id" IS NOT NULL);



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "user_access_email_idx" ON "public"."user_access" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "user_access_email_key" ON "public"."user_access" USING "btree" ("email");



CREATE INDEX "user_access_user_id_idx" ON "public"."user_access" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "lead_appointments_record_event" AFTER INSERT OR UPDATE OF "status" ON "public"."lead_appointments" FOR EACH ROW EXECUTE FUNCTION "public"."record_lead_appointment_event"();



CREATE OR REPLACE TRIGGER "leads_record_gestion" AFTER UPDATE OF "GESTION", "ULTIMA GESTION", "OBSERVACIONES " ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."record_lead_gestion"();



CREATE OR REPLACE TRIGGER "leads_set_contact_id" BEFORE INSERT OR UPDATE OF "Telefono" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."leads_set_contact_id"();



CREATE OR REPLACE TRIGGER "leads_set_gestion_meta" BEFORE UPDATE OF "GESTION", "ULTIMA GESTION", "OBSERVACIONES " ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_lead_gestion_meta"();



CREATE OR REPLACE TRIGGER "trg_catalogs_normalize_value" BEFORE INSERT OR UPDATE ON "public"."lead_catalogs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_catalogs_normalize_value"();



CREATE OR REPLACE TRIGGER "trg_leads_normalize_catalog_columns" BEFORE INSERT OR UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_leads_normalize_catalog_columns"();



CREATE OR REPLACE TRIGGER "trg_leads_sync_agendado_dd_appointments" AFTER UPDATE OF "GESTION" ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"();



ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_period_stats"
    ADD CONSTRAINT "campaign_period_stats_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_stats"
    ADD CONSTRAINT "campaign_stats_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_task_presence"
    ADD CONSTRAINT "crm_task_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_tasks"
    ADD CONSTRAINT "crm_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."daily_report_notes"
    ADD CONSTRAINT "daily_report_notes_autor_user_id_fkey" FOREIGN KEY ("autor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_appointment_events"
    ADD CONSTRAINT "lead_appointment_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_appointment_events"
    ADD CONSTRAINT "lead_appointment_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."lead_appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_appointments"
    ADD CONSTRAINT "lead_appointments_advisor_user_id_fkey" FOREIGN KEY ("advisor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_appointments"
    ADD CONSTRAINT "lead_appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_appointments"
    ADD CONSTRAINT "lead_appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_appointments"
    ADD CONSTRAINT "lead_appointments_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."lead_appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_contacts"
    ADD CONSTRAINT "lead_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_gestiones"
    ADD CONSTRAINT "lead_gestiones_autor_user_id_fkey" FOREIGN KEY ("autor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_gestiones"
    ADD CONSTRAINT "lead_gestiones_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_notes"
    ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_program_enrollments"
    ADD CONSTRAINT "lead_program_enrollments_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lead_program_enrollments"
    ADD CONSTRAINT "lead_program_enrollments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lead_program_enrollments"
    ADD CONSTRAINT "lead_program_enrollments_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."lead_contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_access"
    ADD CONSTRAINT "user_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE "public"."_bkp_lead_gestiones_20260926" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."_bkp_leads_20261005" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."authorize_bootstrap" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_period_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_period_stats_read_active" ON "public"."campaign_period_stats" FOR SELECT TO "authenticated" USING ("public"."is_active_user"());



ALTER TABLE "public"."campaign_stats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_stats_read_active" ON "public"."campaign_stats" FOR SELECT TO "authenticated" USING ("public"."is_active_user"());



ALTER TABLE "public"."crm_task_presence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crm_tasks_select" ON "public"."crm_tasks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_access" "ua"
  WHERE (("ua"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ua"."activo" = true) AND ("ua"."role" = ANY (ARRAY['agente'::"text", 'supervisor'::"text", 'admin'::"text"])) AND (("ua"."role" = 'admin'::"text") OR ("crm_tasks"."assignee_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("crm_tasks"."status" = 'sin_asignar'::"text") AND ("crm_tasks"."assignee_id" IS NULL)) OR (("crm_tasks"."status" = 'asignada'::"text") AND "public"."crm_task_is_shared"("crm_tasks"."assignee_id", "crm_tasks"."scheduled_at", "crm_tasks"."claimed_at")))))));



ALTER TABLE "public"."daily_report_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_report_notes_read_active_authorized" ON "public"."daily_report_notes" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_appointment_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_appointment_events_read_active_authorized" ON "public"."lead_appointment_events" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_appointments_read_active_authorized" ON "public"."lead_appointments" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_catalogs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_catalogs_read_active_authorized" ON "public"."lead_catalogs" FOR SELECT TO "authenticated" USING ("public"."is_active_user"());



ALTER TABLE "public"."lead_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_contacts_read_active_authorized" ON "public"."lead_contacts" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_gestiones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_gestiones_read_active_authorized" ON "public"."lead_gestiones" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_notes_read_active_authorized" ON "public"."lead_notes" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."lead_program_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "lead_program_enrollments_read_crm" ON "public"."lead_program_enrollments" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads_historico" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_historico_read_active_authorized" ON "public"."leads_historico" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"()));



CREATE POLICY "leads_read_active_authorized" ON "public"."leads" FOR SELECT TO "authenticated" USING (("public"."is_active_user"() AND "public"."is_crm_user"() AND ("archived_at" IS NULL)));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_delete_own" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_insert_own" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_select_own" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "push_subscriptions_update_own" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."user_access" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_access_read_self_or_admin" ON "public"."user_access" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin_user"()));



ALTER TABLE "public"."webhook_rate_limit" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_appointment_details"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_appointment_details"("p" "jsonb") TO "service_role";



GRANT MAINTAIN ON TABLE "public"."leads" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_create_lead_with_gestion"("p_lead" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."_crm_fecha_ingreso"("p_fecha" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_crm_fecha_ingreso"("p_fecha" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."_crm_fecha_ingreso"("p_fecha" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."_crm_inscripcion_clase"("p_ingreso" "date", "p_inscripcion" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_crm_inscripcion_clase"("p_ingreso" "date", "p_inscripcion" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_crm_inscripcion_eventos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_crm_inscripcion_eventos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_daily_report_data_dura"("p_mes" "text", "p_fecha" "text", "p_report" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_agent_sessions_report"("p_from" "date", "p_to" "date", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_agent_sessions_report"("p_from" "date", "p_to" "date", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_agent_sessions_report"("p_from" "date", "p_to" "date", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid", "p_activo" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid", "p_activo" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_manage_user_access"("p_action" "text", "p_user_id" "uuid", "p_activo" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."archive_lead"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_lead"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_lead"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_admin_user"("p_user_id" "uuid", "p_email" "text", "p_nombre" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_admin_user"("p_user_id" "uuid", "p_email" "text", "p_nombre" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."campaign_monthly_rollup"("p_anio" integer, "p_mes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."crm_tasks" TO "service_role";
GRANT SELECT ON TABLE "public"."crm_tasks" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_crm_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_crm_task"("p_task_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."cancel_crm_task"("p_task_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."check_lead_phone_occurrences"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_lead_phone_occurrences"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_lead_phone_occurrences"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_crm_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_crm_task"("p_task_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_crm_task"("p_task_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_crm_task"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_crm_task"("p_task_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."complete_crm_task"("p_task_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_crm_task"("p_lead_id" bigint, "p_descripcion" "text", "p_scheduled_at" timestamp with time zone, "p_assignee" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_crm_task"("p_lead_id" bigint, "p_descripcion" "text", "p_scheduled_at" timestamp with time zone, "p_assignee" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_crm_task"("p_lead_id" bigint, "p_descripcion" "text", "p_scheduled_at" timestamp with time zone, "p_assignee" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_lead"("p_lead" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead"("p_lead" "jsonb") TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."lead_appointments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."lead_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_appointments" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_lead_appointment"("p_lead_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "service_role";



GRANT MAINTAIN ON TABLE "public"."lead_catalogs" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."lead_catalogs" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_catalogs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_lead_catalog"("p_kind" "text", "p_value" "text") TO "service_role";



GRANT MAINTAIN ON TABLE "public"."lead_notes" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."lead_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_notes" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_lead_note"("p_lead_id" bigint, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_record"("p_lead" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_lead_with_appointment"("p_lead" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_inscripciones_detalle"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_inscripciones_detalle"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_inscripciones_detalle"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_inscripciones_historial"("p_desde" "date", "p_hasta" "date", "p_actuales" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_inscripciones_historial"("p_desde" "date", "p_hasta" "date", "p_actuales" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_inscripciones_historial"("p_desde" "date", "p_hasta" "date", "p_actuales" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_inscripciones_resumen"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_inscripciones_resumen"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crm_inscripciones_resumen"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crm_task_heartbeat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_task_heartbeat"() TO "service_role";
GRANT ALL ON FUNCTION "public"."crm_task_heartbeat"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."crm_task_is_shared"("p_assignee" "uuid", "p_scheduled_at" timestamp with time zone, "p_claimed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crm_task_is_shared"("p_assignee" "uuid", "p_scheduled_at" timestamp with time zone, "p_claimed_at" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."crm_task_is_shared"("p_assignee" "uuid", "p_scheduled_at" timestamp with time zone, "p_claimed_at" timestamp with time zone) TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."user_access" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."user_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_access" TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_access"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_access"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."daily_management_report"("p_fecha" "date", "p_autor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_campaign_period_stat"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_campaign_stat"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_campaign_stat"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_campaign_stat"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_daily_report_note"("p_note_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_lead_appointment"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_lead_appointment"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_lead_appointment"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_lead_note"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_lead_note"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_lead_note"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."end_agent_session"("p_session_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_asesora_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_asesora_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_asesora_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_campaign_editor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_campaign_editor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_campaign_editor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_crm_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_crm_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_crm_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_supervisor"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_supervisor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_supervisor"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."lead_contact_id_for"("p_phone" "text", "p_nombre" "text", "p_ciudad" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lead_contact_id_for"("p_phone" "text", "p_nombre" "text", "p_ciudad" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lead_enrollments_detail"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lead_enrollments_report"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lead_inscripcion_fecha_historial"("p_lead_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."leads_set_contact_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leads_set_contact_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_crm_task_advisors"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_crm_task_advisors"() TO "service_role";
GRANT ALL ON FUNCTION "public"."list_crm_task_advisors"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."management_period_summary"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_agent_name"("v" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_agent_name"("v" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_agent_name"("v" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_lead_appointment_event"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_lead_appointment_event"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_lead_gestion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_lead_gestion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_crm_task_assignments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_crm_task_assignments"() TO "service_role";
GRANT ALL ON FUNCTION "public"."refresh_crm_task_assignments"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rename_lead_catalog"("p_id" bigint, "p_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reporte_periodo_leads"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reporte_periodo_leads"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reporte_periodo_leads"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_lead_appointment"("p_id" bigint, "p_scheduled_at" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_campaign_stat_auto"("p_campaign_name" "text", "p_anio" integer, "p_mes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_lead"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_lead"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_lead"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_lead_enrollments"("p_lead_id" bigint, "p_enrollments" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lead_appointment_status"("p_id" bigint, "p_status" "text", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lead_catalog_active"("p_id" bigint, "p_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_lead_gestion_meta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_lead_gestion_meta"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lead_inscripcion_programa"("p_lead_id" bigint, "p_programa" "text") TO "service_role";



GRANT ALL ON TABLE "public"."agent_sessions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_agent_session"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_agent_session"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_agent_session"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_user_access_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_user_access_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date", "p_hasta" "date", "p_busqueda" "text", "p_antes_id" bigint, "p_limite" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date", "p_hasta" "date", "p_busqueda" "text", "p_antes_id" bigint, "p_limite" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tablero_consultar"("p_origen" "text", "p_desde" "date", "p_hasta" "date", "p_busqueda" "text", "p_antes_id" bigint, "p_limite" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."title_case_text"("v" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."title_case_text"("v" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."title_case_text"("v" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_agent_session"("p_session_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_agent_session"("p_session_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_agent_session"("p_session_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_catalogs_normalize_value"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_catalogs_normalize_value"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_catalogs_normalize_value"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_leads_normalize_catalog_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_leads_normalize_catalog_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_leads_normalize_catalog_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_sync_lead_agendado_dd_appointments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_appointment_campus"("p_id" bigint, "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_appointment_campus"("p_id" bigint, "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_appointment_campus"("p_id" bigint, "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_appointment_details"("p_id" bigint, "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_appointment_details"("p_id" bigint, "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_appointment_details"("p_id" bigint, "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_followup"("p_id" bigint, "p_fields" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_followup_with_appointment_campus"("p_id" bigint, "p_fields" "jsonb", "p_appointment_id" bigint, "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_followup_with_appointment_campus"("p_id" bigint, "p_fields" "jsonb", "p_appointment_id" bigint, "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_followup_with_appointment_campus"("p_id" bigint, "p_fields" "jsonb", "p_appointment_id" bigint, "p_campus" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_full"("p_id" bigint, "p_lead" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_note"("p_id" bigint, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_with_appointment"("p_id" bigint, "p_fields" "jsonb", "p_scheduled_at" timestamp with time zone, "p_notes" "text", "p_advisor_user_id" "uuid", "p_details" "jsonb", "p_campus" "text") TO "service_role";



GRANT MAINTAIN ON TABLE "public"."campaign_period_stats" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."campaign_period_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_period_stats" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campaign_period_stat"("p_campaign_name" "text", "p_desde" "date", "p_hasta" "date", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) TO "service_role";



GRANT MAINTAIN ON TABLE "public"."campaign_stats" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."campaign_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_stats" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_campaign_stat"("p_id" bigint, "p_campaign_name" "text", "p_anio" integer, "p_mes" "text", "p_estado" "text", "p_alcance" integer, "p_gasto" numeric, "p_resultados" integer) TO "service_role";



GRANT MAINTAIN ON TABLE "public"."daily_report_notes" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."daily_report_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_report_notes" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_daily_report_note"("p_report_date" "date", "p_autor_name" "text", "p_problemas" "text", "p_observaciones" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."webhook_rate_limit_hit"("p_ip" "text", "p_maximo" integer, "p_ventana_segundos" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."webhook_rate_limit_hit"("p_ip" "text", "p_maximo" integer, "p_ventana_segundos" integer) TO "service_role";



GRANT ALL ON TABLE "public"."_bkp_lead_gestiones_20260926" TO "service_role";



GRANT ALL ON TABLE "public"."_bkp_leads_20261005" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_sessions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_sessions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_sessions_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."campaign_period_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."campaign_period_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."campaign_period_stats_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."campaign_stats_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."campaign_stats_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."campaign_stats_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."crm_task_presence" TO "service_role";



GRANT ALL ON TABLE "public"."crm_tasks_visible" TO "service_role";
GRANT SELECT ON TABLE "public"."crm_tasks_visible" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."daily_report_notes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_report_notes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_report_notes_id_seq" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."lead_appointment_events" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."lead_appointment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_appointment_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_appointment_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_appointment_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_appointment_events_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_appointments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_catalogs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_catalogs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_catalogs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."lead_contacts" TO "service_role";
GRANT SELECT ON TABLE "public"."lead_contacts" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."lead_contacts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_contacts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_contacts_id_seq" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."lead_gestiones" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."lead_gestiones" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_gestiones" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_gestiones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_gestiones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_gestiones_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_notes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_notes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_notes_id_seq" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lead_program_enrollments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lead_program_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_program_enrollments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lead_program_enrollments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lead_program_enrollments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lead_program_enrollments_id_seq" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."leads_historico" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."leads_historico" TO "authenticated";
GRANT ALL ON TABLE "public"."leads_historico" TO "service_role";



GRANT ALL ON SEQUENCE "public"."leads_historico_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leads_historico_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leads_historico_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."leads_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leads_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leads_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."webhook_rate_limit" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








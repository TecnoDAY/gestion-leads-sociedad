-- Clasificacion de inscripciones por fecha de ingreso (regla de negocio
-- confirmada por el humano): Normal cuando el lead ingreso en el mismo
-- mes y ano en que se inscribio; Data Dura cuando ingreso en un mes
-- anterior. La etiqueta guardada en GESTION deja de decidir la clase.
--
-- Solo lectura: no altera el historial, las etiquetas ni las fechas.
-- PENDIENTE: falta o no se puede leer la fecha de ingreso.
-- INCONSISTENTE: el ingreso figura despues de la inscripcion.

begin;

-- Fecha de llegada del lead parseada desde el texto (dd/mm/yyyy, dd-mm-yyyy
-- o yyyy-mm-dd). Null cuando no se puede leer; no inventa nada.
create or replace function public._crm_fecha_ingreso(p_fecha text)
returns date
language plpgsql immutable
set search_path = ''
as $$
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
$$;
revoke all on function public._crm_fecha_ingreso(text) from public, anon, authenticated;

-- Clase compartida de una inscripcion: compara ingreso con inscripcion.
create or replace function public._crm_inscripcion_clase(p_ingreso date, p_inscripcion date)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_inscripcion is null or p_ingreso is null then 'PENDIENTE'
    when p_ingreso > p_inscripcion then 'INCONSISTENTE'
    when date_trunc('month', p_ingreso) = date_trunc('month', p_inscripcion) then 'NORMAL'
    else 'DATA_DURA'
  end
$$;
revoke all on function public._crm_inscripcion_clase(date, date) from public, anon, authenticated;

-- crm_inscripciones_historial gana la columna clase: hay que dropearla antes
-- (Postgres no permite cambiar el RETURNS TABLE con create or replace) y
-- tambien sus dos consumidoras, que se recrean con la misma migracion.
drop function if exists public.crm_inscripciones_detalle(date, date);
drop function if exists public.crm_inscripciones_resumen(date, date);
drop function if exists public.crm_inscripciones_historial(date, date, boolean);

create or replace function public.crm_inscripciones_historial(
  p_desde date default null, p_hasta date default null, p_actuales boolean default false
)
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text, clase text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if (p_desde is null) <> (p_hasta is null) or p_desde > p_hasta or p_actuales is null
     or (not p_actuales and p_desde is null) then
    raise exception using errcode = '22023', message = 'period_range_invalid';
  end if;
  if p_actuales then
    -- Primero elegir la ultima entrada registrada, despues filtrar por fecha.
    -- MAX(fecha_gestion) seria incorrecto ante una fecha retroactiva.
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
    -- Opcion A: una baja/archivo posterior no borra el hecho historico.
    -- Una persona por rango, incluso si se reinscribe varias veces.
    return query
      select distinct on (e.id) e.id, e.gestion_id, e.fecha_inscripcion, e.estado_inscripcion,
        public._crm_inscripcion_clase(public._crm_fecha_ingreso(l."Fecha"), e.fecha_inscripcion)
      from public._crm_inscripcion_eventos() e
      join public.leads l on l.id = e.id
      where e.fecha_inscripcion between p_desde and p_hasta
      order by e.id, e.registrado_at desc, e.gestion_id desc;
  end if;
end;
$$;
revoke all on function public.crm_inscripciones_historial(date, date, boolean) from public, anon;
grant execute on function public.crm_inscripciones_historial(date, date, boolean) to authenticated;

create or replace function public.crm_inscripciones_resumen(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  -- La funcion compartida valida tanto acceso como rango.
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
revoke all on function public.crm_inscripciones_resumen(date, date) from public, anon;
grant execute on function public.crm_inscripciones_resumen(date, date) to authenticated;

create or replace function public.crm_inscripciones_detalle(p_desde date, p_hasta date)
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text, clase text,
  nombre text, telefono text, campana text, programa text, estado_actual text)
language plpgsql stable security definer set search_path = ''
as $$
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
revoke all on function public.crm_inscripciones_detalle(date, date) from public, anon;
grant execute on function public.crm_inscripciones_detalle(date, date) to authenticated;

-- Actividad: las altas reales se clasifican con la misma regla de fechas,
-- comparando el ingreso del lead con la fecha de la propia transicion.
-- Las filas de "gestionados en estado" siguen separando por el estado del
-- evento (seguimientos), no por la clase.
create or replace function public.management_period_summary(p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
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
    left join public.leads l on l.id = g.lead_id
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
      'otros', (select count(*) from g where coalesce(canal, '') not in ('llamada', 'llamada y whatsapp', 'whatsapp'))),
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
revoke all on function public.management_period_summary(date, date) from public, anon;
grant execute on function public.management_period_summary(date, date) to authenticated;

commit;

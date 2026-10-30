-- Solo lectura: la fecha de inscripcion procede del cambio de estado.
-- No altera ni rellena el historial ni las fechas manuales de programas.
begin;

create or replace function public._crm_inscripcion_eventos()
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text, registrado_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select g.lead_id, g.id, g.fecha_gestion, btrim(g.gestion_nueva), g.created_at
  from public.lead_gestiones g
  where upper(btrim(coalesce(g.gestion_nueva, ''))) like 'INSCRIT%'
    and upper(btrim(coalesce(g.gestion_anterior, ''))) not like 'INSCRIT%';
$$;
revoke all on function public._crm_inscripcion_eventos() from public, anon, authenticated;

create or replace function public.crm_inscripciones_historial(
  p_desde date default null, p_hasta date default null, p_actuales boolean default false
)
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text)
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
      select l.id, e.gestion_id, e.fecha_inscripcion, e.estado_inscripcion
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
      select distinct on (e.id) e.id, e.gestion_id, e.fecha_inscripcion, e.estado_inscripcion
      from public._crm_inscripcion_eventos() e
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
    select * from public.crm_inscripciones_historial(p_desde, p_hasta, false)
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'personas_inscritas', count(*),
    'normales', count(*) filter (where upper(estado_inscripcion) not like '%DATA%'),
    'data_dura', count(*) filter (where upper(estado_inscripcion) like '%DATA%'),
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

-- El detalle historico incluye archivados solo en este endpoint acotado.
-- No amplia la politica de lectura habitual de leads.
create or replace function public.crm_inscripciones_detalle(p_desde date, p_hasta date)
returns table (id bigint, gestion_id bigint, fecha_inscripcion date, estado_inscripcion text,
  nombre text, telefono text, programa text, estado_actual text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_active_user(), false) or not coalesce(public.is_crm_user(), false) then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  return query
    select h.id, h.gestion_id, h.fecha_inscripcion, h.estado_inscripcion,
      l."Nombre"::text, l."Telefono"::text, l."PROGRAMA INSCRIPCION"::text, l."GESTION"::text
    from public.crm_inscripciones_historial(p_desde, p_hasta, false) h
    join public.leads l on l.id = h.id;
end;
$$;
revoke all on function public.crm_inscripciones_detalle(date, date) from public, anon;
grant execute on function public.crm_inscripciones_detalle(date, date) to authenticated;

-- Endurece la funcion aislada creada previamente en remoto: no basta con
-- que el rol sea authenticated; debe ser un usuario activo del CRM.
create or replace function public.lead_inscripcion_fecha_historial(p_lead_id bigint)
returns date
language plpgsql stable security definer set search_path = ''
as $$
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
revoke all on function public.lead_inscripcion_fecha_historial(bigint) from public, anon;
grant execute on function public.lead_inscripcion_fecha_historial(bigint) to authenticated;

commit;

-- Reporte de inscripciones por programa y nivel (continuacion de
-- 202610200001_lead_program_enrollments.sql).
--
-- Dos RPC de solo lectura para el reporte por periodo:
--   - lead_enrollments_report : conteos y desgloses (personas vs inscripciones).
--   - lead_enrollments_detail : filas para el CSV (una por inscripcion).
-- Las dos exigen sesion CRM activa y rangos validos.

begin;

create or replace function public.lead_enrollments_report(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    -- Personas: cada persona cuenta una vez, aunque este en los dos programas.
    'personas_inscritas', (select count(distinct lead_id) from activas),
    -- Inscripciones: una por persona y programa vigente.
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

revoke all on function public.lead_enrollments_report(date, date) from public, anon;
grant execute on function public.lead_enrollments_report(date, date) to authenticated;
comment on function public.lead_enrollments_report(date, date) is
  'Reporte de inscripciones: personas (una vez) e inscripciones (una por programa) por nivel y por mes, con pendientes de fecha, altas y bajas del periodo.';

create or replace function public.lead_enrollments_detail(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.lead_enrollments_detail(date, date) from public, anon;
grant execute on function public.lead_enrollments_detail(date, date) to authenticated;
comment on function public.lead_enrollments_detail(date, date) is
  'Filas de inscripcion (una por inscripcion vigente) para el CSV: las del periodo y las pendientes de fecha.';

commit;

-- Rollback manual (solo tras revision):
-- drop function if exists public.lead_enrollments_detail(date, date);
-- drop function if exists public.lead_enrollments_report(date, date);

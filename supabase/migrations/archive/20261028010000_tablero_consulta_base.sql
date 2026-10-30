-- Consulta explícita del Tablero; no cambia estados, citas ni datos de leads.
begin;

create or replace function public.tablero_consultar(
  p_origen text, p_desde date default null, p_hasta date default null,
  p_busqueda text default null, p_antes_id bigint default null, p_limite integer default 100
)
returns setof jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
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
  -- ILIKE literal: %, _ y barra invertida de la entrada no actúan como comodines.
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

revoke all on function public.tablero_consultar(text, date, date, text, bigint, integer) from public, anon;
-- SECURITY INVOKER necesita EXECUTE en la función de fecha; no concede SELECT sobre tablas.
grant execute on function public._crm_fecha_ingreso(text) to authenticated;
grant execute on function public.tablero_consultar(text, date, date, text, bigint, integer) to authenticated;
comment on function public.tablero_consultar(text, date, date, text, bigint, integer) is
  'Tablero: lectura con RLS por origen, fecha de ingreso y/o texto, páginas acotadas; no modifica leads.';
commit;

-- ============================================================================
-- P0 auditoria: limpieza de gestiones fantasma + blindaje del trigger
--
-- Contexto (auditoria 2026-09-26): la migracion 202609260001 normalizo
-- leads."GESTION" en masa y el trigger leads_record_gestion registro cada
-- cambio como una gestion historica: 4.797 filas con autor_name='' y
-- autor_user_id=NULL creadas todas en el mismo instante.
--
-- 1. Respaldo de las filas a borrar (sin grants para la API).
-- 2. Borrado con doble predicado: sin autor Y dentro de la ventana exacta
--    del lote. Las 5 gestiones reales tienen autor_user_id no nulo.
-- 3. Blindaje del trigger: una actualizacion sin actor autenticado
--    (migraciones, service role, SQL editor) no registra gestion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Respaldo. create table if not exists: si se reejecuta tras el borrado,
--    el select devuelve 0 filas y la tabla previa (con los datos) se conserva.
-- ---------------------------------------------------------------------------
create table if not exists public._bkp_lead_gestiones_20260926 as
select *
from public.lead_gestiones
where autor_user_id is null
  and btrim(coalesce(autor_name, '')) = '';

revoke all on public._bkp_lead_gestiones_20260926 from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Assertions + borrado
-- ---------------------------------------------------------------------------
do $blk$
declare
  total_antes bigint;
  fantasmas bigint;
  fuera_de_ventana bigint;
  borradas bigint;
  total_despues bigint;
begin
  select count(*) into total_antes from public.lead_gestiones;

  select count(*) into fantasmas
  from public.lead_gestiones
  where autor_user_id is null
    and btrim(coalesce(autor_name, '')) = '';

  -- Toda fila sin autor debe pertenecer al lote de la migracion (un unico
  -- instante). Si aparece alguna fuera de esa ventana, abortar y revisar.
  select count(*) into fuera_de_ventana
  from public.lead_gestiones
  where autor_user_id is null
    and btrim(coalesce(autor_name, '')) = ''
    and created_at <> timestamptz '2026-09-26 21:30:06.529359+00';

  if fuera_de_ventana > 0 then
    raise exception using errcode = 'P0001',
      message = 'filas_sin_autor_fuera_del_lote: ' || fuera_de_ventana::text;
  end if;

  delete from public.lead_gestiones
  where autor_user_id is null
    and btrim(coalesce(autor_name, '')) = ''
    and created_at = timestamptz '2026-09-26 21:30:06.529359+00';

  get diagnostics borradas = row_count;

  select count(*) into total_despues from public.lead_gestiones;

  if borradas <> fantasmas or total_antes - borradas <> total_despues then
    raise exception using errcode = 'P0001',
      message = 'conteo_inconsistente_tras_borrado';
  end if;

  raise notice 'respaldo=% borradas=% restantes=%', fantasmas, borradas, total_despues;
end
$blk$;

-- ---------------------------------------------------------------------------
-- 3. Blindaje del trigger record_lead_gestion
-- ---------------------------------------------------------------------------
create or replace function public.record_lead_gestion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  gestion_fecha text;
  fecha date;
  fecha_partes text[];
  autor text;
begin
  -- Sin actor autenticado (migraciones, service role, SQL editor) no hay
  -- gestion que registrar: el historial solo recoge acciones de personas.
  if auth.uid() is null then
    return NEW;
  end if;

  gestion_fecha := nullif(btrim(NEW."Fecha Última Gestión "), '');
  fecha_partes := regexp_match(gestion_fecha, '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$');
  if fecha_partes is not null
     and fecha_partes[1]::int between 1 and 31
     and fecha_partes[2]::int between 1 and 12 then
    begin
      fecha := make_date(fecha_partes[3]::int, fecha_partes[2]::int, fecha_partes[1]::int);
    exception when others then
      fecha := current_date;
    end;
  else
    fecha := current_date;
  end if;

  select coalesce(ua.nombre, '') into autor
  from public.user_access ua
  where ua.user_id = auth.uid()
  limit 1;

  insert into public.lead_gestiones (
    lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal,
    autor_name, autor_user_id
  ) values (
    NEW.id, fecha, OLD."GESTION", NEW."GESTION", NEW."ULTIMA GESTION",
    coalesce(autor, ''), auth.uid()
  );
  return NEW;
end;
$fn$;

-- ============================================================================
-- Normalizacion de valores de catalogo + canon Jessica
--
-- Alcance (documento ODD: normalizacion-datos-leads.md, tareas T5-T6):
--   1. trim + primera letra mayuscula / resto minusculas en las columnas de
--      catalogo de leads y leads_historico y en lead_catalogs.value.
--   2. Rename 'Jessi' -> 'Jessica' en TODAS las superficies de agente (el
--      usuario real en user_access ya se llama Jessica).
--   3. Dedupe de lead_catalogs por (kind, value normalizado).
--   4. Triggers BEFORE INSERT/UPDATE para impedir que la variante vuelva.
--
-- Garantias:
--   - Las fusiones solo unen variantes del MISMO valor (lower(btrim(a)) =
--      lower(btrim(b))); ningun valor distinto se fusiona.
--   - lead_catalogs tiene un UNIQUE (kind, value): por eso el dedupe va
--      ANTES de normalizar valores, comparando por valor normalizado, y el
--      rename a Jessica borra primero la fila inactiva preexistente (id 60,
--      active=false al escribir esta migracion). Si esa suposicion deja de
--      ser cierta la migracion aborta con 23505 sin aplicarse parcialmente.
--   - Compatible con la app: normalizeGestion/normalizeLeadMonth/getField ya
--      normalizan mayusculas y espacios antes de comparar (index.html).
--   - No se toca: las etiquetas 'Nina', la columna "Interesado en ",
--      indices, politicas RLS, RPCs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Funciones de normalizacion
-- ---------------------------------------------------------------------------

-- Trim + primera letra mayuscula y resto minusculas. Mantiene NULL y ''
-- tal cual los trata getField (el chequeo de cadena vacia es del cliente).
create or replace function public.title_case_text(v text)
returns text
language sql
immutable
as $fn$
  select case
    when v is null then null
    when btrim(v) = '' then ''
    else upper(left(btrim(v), 1)) || lower(substr(btrim(v), 2))
  end;
$fn$;

-- Canon del nombre de agente: cualquier variante del apodo 'jessi' pasa a
-- 'Jessica', que es el nombre registrado en user_access. Lo demas solo se
-- title-casea.
create or replace function public.normalize_agent_name(v text)
returns text
language sql
immutable
as $fn$
  select case
    when v is null then null
    when lower(btrim(v)) = 'jessi' then 'Jessica'
    else public.title_case_text(v)
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Normalizacion de datos existentes (tablas sin UNIQUE en estas columnas)
-- ---------------------------------------------------------------------------

update public.leads set
  "GESTION"          = public.title_case_text("GESTION"),
  "ULTIMA GESTION"   = public.title_case_text("ULTIMA GESTION"),
  "AGENTE"           = public.title_case_text("AGENTE"),
  "ULTIMO AGENTE "   = public.title_case_text("ULTIMO AGENTE "),
  "Mes"              = public.title_case_text("Mes"),
  "Medio"            = public.title_case_text("Medio"),
  "Campaña"          = public.title_case_text("Campaña");

update public.leads_historico set
  "GESTION" = public.title_case_text("GESTION"),
  "AGENTE"  = public.title_case_text("AGENTE"),
  "Mes"     = public.title_case_text("Mes"),
  "Medio"   = public.title_case_text("Medio"),
  "Campaña" = public.title_case_text("Campaña");

-- ---------------------------------------------------------------------------
-- 3. Canon Jessica en datos (tablas sin UNIQUE, orden indiferente)
-- ---------------------------------------------------------------------------

update public.leads set
  "AGENTE"         = 'Jessica'
where "AGENTE" = 'Jessi';

update public.leads set
  "ULTIMO AGENTE " = 'Jessica'
where "ULTIMO AGENTE " = 'Jessi';

update public.leads_historico set "AGENTE"     = 'Jessica' where "AGENTE"     = 'Jessi';
update public.lead_appointments set advisor_name = 'Jessica' where advisor_name = 'Jessi';
update public.lead_gestiones    set autor_name   = 'Jessica' where autor_name   = 'Jessi';
update public.lead_notes        set author_name  = 'Jessica' where author_name  = 'Jessi';

-- ---------------------------------------------------------------------------
-- 4. Catalogo: dedupe por valor normalizado (antes de normalizar, para no
--    violar el UNIQUE (kind, value)), luego canon Jessica, luego normalizar.
-- ---------------------------------------------------------------------------

-- 4a. De cada grupo de valores que colapsan al mismo normalizado, sobrevive
--     la fila activa y a igualdad la mas antigua.
delete from public.lead_catalogs a
using public.lead_catalogs b
where a.kind = b.kind
  and a.id <> b.id
  and public.title_case_text(a.value) = public.title_case_text(b.value)
  and ((a.active = false and b.active = true)
       or (a.active = b.active and a.id > b.id));

-- 4b. Canon Jessica en el catalogo: borramos la fila inactiva 'Jessica'
--     preexistente y renombramos la activa 'Jessi'.
delete from public.lead_catalogs
where kind = 'agente' and value = 'Jessica' and active = false;

update public.lead_catalogs
set value = 'Jessica'
where kind = 'agente' and value = 'Jessi' and active = true;

-- 4c. Normaliza los valores restantes (ya sin duplicados por 4a/4b).
update public.lead_catalogs set value = public.title_case_text(value);

-- ---------------------------------------------------------------------------
-- 5. Guardas: nadie reintroduce una variante en escritura futura (RPC
--    create_lead/update_lead_full y el editor admin de catalogos incluidos).
-- ---------------------------------------------------------------------------

create or replace function public.trg_leads_normalize_catalog_columns()
returns trigger
language plpgsql
as $tg$
begin
  new."GESTION"        := public.title_case_text(new."GESTION");
  new."ULTIMA GESTION" := public.title_case_text(new."ULTIMA GESTION");
  new."Mes"            := public.title_case_text(new."Mes");
  new."Medio"          := public.title_case_text(new."Medio");
  new."Campaña"        := public.title_case_text(new."Campaña");
  -- Los nombres de agente pasan por el canon Jessica, no solo por caja.
  new."AGENTE"         := public.normalize_agent_name(new."AGENTE");
  new."ULTIMO AGENTE " := public.normalize_agent_name(new."ULTIMO AGENTE ");
  return new;
end;
$tg$;

create trigger trg_leads_normalize_catalog_columns
before insert or update on public.leads
for each row
execute function public.trg_leads_normalize_catalog_columns();

create or replace function public.trg_catalogs_normalize_value()
returns trigger
language plpgsql
as $tg$
begin
  if new.kind = 'agente' then
    new.value := public.normalize_agent_name(new.value);
  else
    new.value := public.title_case_text(new.value);
  end if;
  return new;
end;
$tg$;

create trigger trg_catalogs_normalize_value
before insert or update on public.lead_catalogs
for each row
execute function public.trg_catalogs_normalize_value();

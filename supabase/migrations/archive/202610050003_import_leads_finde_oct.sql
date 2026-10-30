-- Carga de los leads del finde 2-5 octubre 2026 desde el CSV de la asesora (odd/tasks/carga-leads-finde-oct.md, T1).
-- Origen: 'leads nuevos del 4,5,6 de octubre  - Hoja 1.csv' (63 filas; fechas reales 2,3,4,5 de octubre de 2026).
-- Generado localmente con Python stdlib; NO ejecutado por el repositorio.
-- Dedup idempotente por telefono (digitos) + Fecha normalizada: 59 claves -> 2 UPDATE (ids 5959, 5961) + 57 INSERT.
-- Reejecutar no duplica: el INSERT condiciona su NOT EXISTS a la misma clave y los asserts validan 0 altas.
begin;

-- Backup reversible de los 2 leads que se actualizan (patron _bkp_lead_gestiones_20260926).
create table if not exists public._bkp_leads_20261005 as
select * from public.leads where id in (5959, 5961);

create temp table _csv_leads (tel text, fecha text, nombre text, "Mes" text, "Fecha" text, "Nombre" text, "Telefono" text, "Campaña" text, "Medio" text, "GESTION" text, "Ciudad" text, "AGENTE" text, "Odoo" text, "Fecha de Atencion" text, "OBSERVACIONES " text, "Fecha Última Gestión " text, "ULTIMA GESTION" text, "ULTIMO AGENTE " text, "LANDING" text) on commit drop;

-- ------------------------------------------------------------------
-- PII RETIRADA DEL REPOSITORIO (2026-10-19, auditoria de seguridad).
-- El payload original contenia los 63 leads reales del lote (nombre, telefono,
-- fecha y observaciones). Se sustituye por esta nota para que la PII de
-- produccion no siga dentro del git.
-- Los leads ya estan en public.leads (ids 5959 y 5961 actualizados, 57
-- insertados) y el backup original en public._bkp_leads_20261005. La version
-- 202610050003 queda registrada en el historico remoto.
-- ------------------------------------------------------------------
commit;

-- Verificacion posterior (solo lectura, ejecutar a parte):
-- 1) select count(*) from public.leads;                               -> 6017
-- 2) select count(*) from (select 1 from public.leads where "Fecha" in ('2/10/2026','3/10/2026','4/10/2026','5/10/2026','02/10/2026','03/10/2026','04/10/2026','05/10/2026') group by regexp_replace("Telefono",'\D','','g'), regexp_replace(regexp_replace("Fecha",'^0',''),'/0','/','g') having count(*) > 1) d; -> 0
-- 3) select * from public._bkp_leads_20261005;                        -> 2 filas originales
-- 4) select id, "Nombre", "Campaña", "GESTION", "OBSERVACIONES " from public.leads where id in (5959,5961); -> reflejan el CSV

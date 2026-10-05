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

insert into _csv_leads values
('19048004422','2/10/2026','SN','Octubre','2/10/2026','SN','1 (904) 800-4422','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta','3/10/2026','Llamada','Loli','contestador'),('19547902897','2/10/2026','Luis Nava','Octubre','2/10/2026','Luis Nava','1 (954) 790-2897','Taller camara','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','SE le marco y no respondio, se le dejo mensaje por ws',NULL,NULL,NULL,NULL),('17864028448','2/10/2026','SN','Octubre','2/10/2026','SN','1 (786) 402-8448','Locos adams','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('34644197737','2/10/2026','Lalis','Octubre','2/10/2026','Lalis','34 644 19 77 37','Weston','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13053018940','3/10/2026','Mario','Octubre','3/10/2026','Mario','1 (305) 301-8940','Taller camara','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13059344725','3/10/2026','Mariel Rosetti','Octubre','3/10/2026','Mariel Rosetti','1 (305) 934-4725','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('15619856964','3/10/2026','SN','Octubre','3/10/2026','SN','1 (561) 985-6964','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17864995955','3/10/2026','Sole','Octubre','3/10/2026','Sole','1 (786) 499-5955','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13055827393','3/10/2026','Jorge Cabal','Octubre','3/10/2026','Jorge Cabal','1 (305) 582-7393','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','Se le marco y no respondio, se le dejo mensaje por ws',NULL,NULL,NULL,NULL),('13057997590','3/10/2026','Ary','Octubre','3/10/2026','Ary','1 (305) 799-7590','Kids doral inglés','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17869055638','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 905-5638','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','Numero sale ocupado se le marco 2 veces',NULL,NULL,NULL,NULL),('17867738314','3/10/2026','Adriana Florian','Octubre','3/10/2026','Adriana Florian','1 (786) 773-8314','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','Se le llamó pero no pudo contestar porque estaba trabajando',NULL,NULL,NULL,NULL),('13052407311','3/10/2026','SN','Octubre','3/10/2026','SN','1 (305) 240-7311','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13058795272','3/10/2026','SN','Octubre','3/10/2026','SN','1 (305) 879-5272','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','Se le llamo y no respondio,se le dejo mensaje por ws',NULL,NULL,NULL,NULL),('17867102035','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 710-2035','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('19542970387','3/10/2026','Richard','Octubre','3/10/2026','Richard','1 (954) 297-0387','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'3/10/2026','Sono pero no dejo opcion para contestador',NULL,NULL,NULL,NULL),('17864176773','3/10/2026','Zucel','Octubre','3/10/2026','Zucel','1 (786) 417-6773','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17869147861','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 914-7861','Locos adams','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17863271365','3/10/2026','Nancy','Octubre','3/10/2026','Nancy','1 (786) 327-1365','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17865615601','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 561-5601','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17864398820','3/10/2026','Angel','Octubre','3/10/2026','Angel','1 (786) 439-8820','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17863852906','3/10/2026','Delia','Octubre','3/10/2026','Delia','1 (786) 385-2906','Sin definir','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19542499184','3/10/2026','Kenia','Octubre','3/10/2026','Kenia','1 (954) 249-9184','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('15615684865','3/10/2026','Carmen','Octubre','3/10/2026','Carmen','1 (561) 568-4865','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17866595774','3/10/2026','Adriana','Octubre','3/10/2026','Adriana','1 (786) 659-5774','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('','3/10/2026','Horacio Terzaghi','Octubre','3/10/2026','Horacio Terzaghi','SN','Taller camara','Instagram','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('','3/10/2026','Onna Rita Salerno','Octubre','3/10/2026','Onna Rita Salerno','SN','Taller camara','Instagram','Información',NULL,'Loli',NULL,'3/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19546878141','3/10/2026','Rosi','Octubre','3/10/2026','Rosi','1 (954) 687-8141','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13053336134','3/10/2026','SN','Octubre','3/10/2026','SN','1 (305) 333-6134','Kids doral inglés','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17865546560','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 554-6560','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17868935262','3/10/2026','SN','Octubre','3/10/2026','SN','1 (786) 893-5262','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('13058428187','3/10/2026','SN','Octubre','3/10/2026','SN','1 (305) 842-8187','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'4/10/2026','Se le dejo la inf via ws y lo va a evaluar',NULL,NULL,NULL,NULL),('17865802762','4/10/2026','Alejandra','Octubre','4/10/2026','Alejandra','1 (786) 580-2762','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'4/10/2026','Se le dejo la inf via ws y lo va a evaluar',NULL,NULL,NULL,NULL),('13057840893','4/10/2026','SN','Octubre','4/10/2026','SN','1 (305) 784-0893','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17867160279','4/10/2026','Adriana','Octubre','4/10/2026','Adriana','1 (786) 716-0279','Actuacion kids','Whatsapp nuevo','Menor 5 años',NULL,'Loli',NULL,'4/10/2026','Tiene 4 años y los cumple en abril',NULL,NULL,NULL,NULL),('17727825164','4/10/2026','Marha','Octubre','4/10/2026','Marha','1 (772) 782-5164','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'4/10/2026','Se le dejo la inf via ws y lo va a evaluar',NULL,NULL,NULL,NULL),('17869611094','4/10/2026','SN','Octubre','4/10/2026','SN','1 (786) 961-1094','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('17864056971','4/10/2026','SN','Octubre','4/10/2026','SN','1 (786) 405-6971','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','Se envia link de pago para los tickets',NULL,NULL,NULL,NULL),('17864284019','4/10/2026','Vivian Gomez','Octubre','4/10/2026','Vivian Gomez','1 (786) 428-4019','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19542784087','4/10/2026','SN','Octubre','4/10/2026','SN','1 (954) 278-4087','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19548339294','4/10/2026','Maria pelaez','Octubre','4/10/2026','Maria pelaez','1 (954) 833-9294','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19542189366','4/10/2026','Rosa','Octubre','4/10/2026','Rosa','1 (954) 218-9366','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'4/10/2026','Se le llamo y no respondio,se le dejo mensaje por ws',NULL,NULL,NULL,NULL),('17862842323','4/10/2026','Andry','Octubre','4/10/2026','Andry','1 (786) 284-2323','Taller camara','Whatsapp nuevo','No contesta',NULL,'Loli',NULL,'4/10/2026','Se le llamo y no respondio,se le dejo mensaje por ws',NULL,NULL,NULL,NULL),('16892263102','4/10/2026','Teresita Alvear','Octubre','4/10/2026','Teresita Alvear','1 (689) 226-3102','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','Se envia link de pago para los tickets Nota de carga: en el CSV constaba ademas gestion ''Repetido''',NULL,NULL,NULL,NULL),('17869605357','4/10/2026','SN','Octubre','4/10/2026','SN','1 (786) 960-5357','Taller camara','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17543019792','4/10/2026','Geo','Octubre','4/10/2026','Geo','1 (754) 301-9792','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13412107598','4/10/2026','Liz','Octubre','4/10/2026','Liz','1 (341) 210-7598','Actuacion kids','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17862239514','4/10/2026','Javier Fuquen','Octubre','4/10/2026','Javier Fuquen','1 (786) 223-9514','Locos adams','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('16452205877','4/10/2026','Ricardo De La Rosa','Octubre','4/10/2026','Ricardo De La Rosa','1 (645) 220-5877','Taller camara','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19542759527','4/10/2026','Diana','Octubre','4/10/2026','Diana','1 (954) 275-9527','Taller camara','Whatsapp nuevo','Información',NULL,'Loli',NULL,'4/10/2026','En espera de respuesta Nota de carga: en el CSV constaba ademas gestion ''Repetido'' con campana ''Weston''',NULL,NULL,NULL,NULL),('17864872109','4/10/2026','Raymond','Octubre','4/10/2026','Raymond','1 (786) 487-2109','Taller camara','Whatsapp nuevo','Vive lejos',NULL,'Loli',NULL,'5/10/2026','Esta interesado pero vive en Hollywood',NULL,NULL,NULL,NULL),('18628993582','4/10/2026','SN','Octubre','4/10/2026','SN','1 (862) 899-3582','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('19545168020','5/10/2026','Yomaira','Octubre','5/10/2026','Yomaira','1 (954) 516-8020','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('17868672049','5/10/2026','Margloris','Octubre','5/10/2026','Margloris','1 (786) 867-2049','Weston','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','Esta interesada en las clases del Doral , hija tiene 7 años',NULL,NULL,NULL,NULL),('13057466118','5/10/2026','Angelica','Octubre','5/10/2026','Angelica','1 (305) 746-6118','Kids doral inglés','Whatsapp nuevo','Repetido',NULL,'Loli',NULL,'5/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('14056426737','5/10/2026','Jennifer Blotte','Octubre','5/10/2026','Jennifer Blotte','1 (405) 642-6737','Kids doral inglés','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','interesada para clases de adultos',NULL,NULL,NULL,NULL),('15619870030','5/10/2026','Jorge Leo','Octubre','5/10/2026','Jorge Leo','1 (561) 987-0030','Kids doral inglés','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','En espera de respuesta',NULL,NULL,NULL,NULL),('13054168869','5/10/2026','Patricia Bernardon','Octubre','5/10/2026','Patricia Bernardon','1 (305) 416-8869','Kids doral inglés','Whatsapp nuevo','Información',NULL,'Loli',NULL,'5/10/2026','Tiene niña de 13 años',NULL,NULL,NULL,NULL),('14077599963','5/10/2026','Mangi Herrera','Octubre','5/10/2026','Mangi Herrera','1 (407) 759-9963','Weston','Whatsapp nuevo','Menor 5 años',NULL,'Loli',NULL,'5/10/2026','Tiene niña de 4 años',NULL,NULL,NULL,NULL);

do $$
declare
  v_upd int;
  v_ins int;
  v_filas int;
  v_claves int;
begin
  update public.leads l
     set "Mes" = c."Mes",
      "Fecha" = c."Fecha",
      "Nombre" = c."Nombre",
      "Telefono" = c."Telefono",
      "Campaña" = c."Campaña",
      "Medio" = c."Medio",
      "GESTION" = c."GESTION",
      "Ciudad" = c."Ciudad",
      "AGENTE" = c."AGENTE",
      "Odoo" = c."Odoo",
      "Fecha de Atencion" = c."Fecha de Atencion",
      "OBSERVACIONES " = c."OBSERVACIONES ",
      "Fecha Última Gestión " = c."Fecha Última Gestión ",
      "ULTIMA GESTION" = c."ULTIMA GESTION",
      "ULTIMO AGENTE " = c."ULTIMO AGENTE ",
      "LANDING" = c."LANDING",
         updated_at = now()
    from _csv_leads c
   where regexp_replace(l."Telefono", '\D', '', 'g') = c.tel
       AND regexp_replace(regexp_replace(l."Fecha", '^0', ''), '/0', '/', 'g') = c.fecha
       AND (c.tel <> '' OR upper(btrim(l."Nombre")) = upper(btrim(c.nombre)));
  get diagnostics v_upd = row_count;

  insert into public.leads ("Mes","Fecha","Nombre","Telefono","Campaña","Medio","GESTION","Ciudad","AGENTE","Odoo","Fecha de Atencion","OBSERVACIONES ","Fecha Última Gestión ","ULTIMA GESTION","ULTIMO AGENTE ","LANDING")
  select "Mes","Fecha","Nombre","Telefono","Campaña","Medio","GESTION","Ciudad","AGENTE","Odoo","Fecha de Atencion","OBSERVACIONES ","Fecha Última Gestión ","ULTIMA GESTION","ULTIMO AGENTE ","LANDING"
    from _csv_leads c
   where not exists (select 1 from public.leads l where regexp_replace(l."Telefono", '\D', '', 'g') = c.tel
       AND regexp_replace(regexp_replace(l."Fecha", '^0', ''), '/0', '/', 'g') = c.fecha
       AND (c.tel <> '' OR upper(btrim(l."Nombre")) = upper(btrim(c.nombre))));
  get diagnostics v_ins = row_count;

  if v_upd not in (2, 59) then
    raise exception 'UPDATE inesperado: % (2 en la primera pasada, 59 en reejecucion)', v_upd;
  end if;
  if v_ins not in (0, 57) then
    raise exception 'INSERT inesperado: % (57 en la primera pasada, 0 en reejecucion)', v_ins;
  end if;

  -- Estado final: exactamente 1 lead por cada una de las 59 claves del lote.
  with m as (
    select l.id, c.tel, c.fecha, c.nombre
      from public.leads l
      join _csv_leads c
        on regexp_replace(l."Telefono", '\D', '', 'g') = c.tel
       and regexp_replace(regexp_replace(l."Fecha", '^0', ''), '/0', '/', 'g') = c.fecha
       and (c.tel <> '' OR upper(btrim(l."Nombre")) = upper(btrim(c.nombre)))
  )
  select count(*), count(distinct tel || '|' || fecha || '|' || coalesce(nombre, ''))
    into v_filas, v_claves
    from m;

  if v_claves <> 59 or v_filas <> 59 then
    raise exception 'Estado inconsistente: % leads para % claves (esperado 59/59)', v_filas, v_claves;
  end if;
end $$;

commit;

-- Verificacion posterior (solo lectura, ejecutar a parte):
-- 1) select count(*) from public.leads;                               -> 6017
-- 2) select count(*) from (select 1 from public.leads where "Fecha" in ('2/10/2026','3/10/2026','4/10/2026','5/10/2026','02/10/2026','03/10/2026','04/10/2026','05/10/2026') group by regexp_replace("Telefono",'\D','','g'), regexp_replace(regexp_replace("Fecha",'^0',''),'/0','/','g') having count(*) > 1) d; -> 0
-- 3) select * from public._bkp_leads_20261005;                        -> 2 filas originales
-- 4) select id, "Nombre", "Campaña", "GESTION", "OBSERVACIONES " from public.leads where id in (5959,5961); -> reflejan el CSV

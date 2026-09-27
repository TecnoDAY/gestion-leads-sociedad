# Contactos unicos por telefono (dedup) — fase 1

Fecha: 2026-09-26 · Estado: implementando · Origen: analisis aprobado por el humano ("implementa el plan").

## Objetivo
Que cada numero de telefono normalizado exista una unica vez como contacto y que cada lead nuevo o editado se vincule al contacto correcto, SIN romper nada existente: leads se siguen creando como hoy (misma persona desde otra campana = nuevo lead ligado al mismo contacto, politica recomendada y aceptada).

## Problema y por que
- Se pidio que un lead nuevo con numero repetido no duplique el numero.
- Datos: 452 grupos repetidos (1.001 leads), 329 con nombre o campana distintos, 123 aparentemente mismo nombre+campana, 309 sin ningun digito, max 13 digitos, 0 > 15.
- Historial: appointments, gestiones y notes cuelgan de leads.id con CASCADE: fusionar/borrar leads es destructivo.

## Alcance (fase 1, aditiva)
- T1: tabla `public.lead_contacts` (telefono normalizado UNICO, check 7-15 digitos) + RLS idem a leads.
- T2: `leads.contact_id` (FK set null) + indice + backfill (contacto = lead mas antiguo por telefono; 4.953 contactos esperados, 5.502 leads ligados).
- T3: helper `lead_contact_id_for` + trigger `leads_set_contact_id` BEFORE INSERT OR UPDATE OF "Telefono". create_lead y demas RPCs quedan intactas.
- T4: verificacion: conteos, autotest con sesion simulada en transaccion con ROLLBACK.

## Restricciones
- Cero cambios en index.html ni en RPCs creadas/desplegadas (resolucion de drift: nunca reescribir funciones basandose solo en ficheros del repo — 202609250004 del humano podria desplegar algo distinto).
- Nunca sobrescribir nombre/ciudad ya guardados: solo rellenar campos vacios.
- No tocar ficheros del humano sin commitear. Writes:a Supabase via ask.

## No romper
- Altas de leads (RPC create_lead, create_lead_with_appointment via trigger), edicion completa (religa contact on Telefono change), followups (no tocan Telefono, no disparan), ficha/repetidos, citas, gestiones, notas, exportacion, busqueda.
- leads."Telefono" SIGUE EXISTIENDO y visible (fase 1); la retirada es fase posterior tras verificacion.

## TDD
- Modo: off · Fuente: default · Runner: no aplicable (BD); checks funcionales: conteos antes/despues + autotest con rollback + list_migrations.

## Tareas
- [x] T1-T3: migracion 202609260003_lead_contacts.sql (tabla + columna + backfill + trigger).
- [x] T4: verificacion y evidence.

## Criterios de aceptacion
- [x] lead_contacts = telefonos distintos validos detectados (4.953); leads con contact_id = leads con telefono valido (5.502); leads total intacto (5.815).
- [x] Alta simulada (rollback) enlaza contacto nuevo; segunda alta con mismo telefono enlaza al MISMO contacto y no sobrescribe nombre.
- [x] Trigger activo; RLS activa, anon sin acceso; funciones auxiliares sin grants a anon/authenticated.
- [x] Migracion registrada en list_migrations; ficheros del humano intactos.

## Decisiones aceptadas
- Trigger antes que reescribir create_lead (minimo acoplamiento, reversible, cubre todos los caminos de escritura).
- Contacto canonico = lead mas antiguo (created_at, id) por telefono.
- Sin auth.uid() (importaciones/migraciones) el trigger funciona igual: los contactos son dato del sistema, no del historial humano.

## Reutilizacion investigada
- La normalizacion replica la de la UI (`normalizePhone`: solo digitos; L1736) y la ficha de repetidos ya usa la misma clave (>= 7 digitos): se captura el mismo concepto.
- Patron RLS/grants copiado de leads/lead_notes (read_active_authorized + is_active_user()).

## Evidencia
- Estructural: contactos=4953, leads ligados=5502, total_leads=5815, trigger `leads_set_contact_id` activo, RLS en lead_contacts, anon sin SELECT, helper no ejecutable por authenticated.
- Autotest transaccional con `set local request.jwt.claims` (Miguel, admin) y ROLLBACK (nada persistido): alta con numero nuevo -> contacto nuevo; segunda alta mismo numero (otro formato, otra campana, otro nombre) -> MISMO contact_id, lead distinto, nombre del contacto no sobrescrito; telefono '123' -> contact_id null; alta reusando telefono existente (1 (786) 763-7471) -> contacto_asignado = contacto_esperado (3543), sin contacto nuevo.

## Errores encontrados durante la implementacion (corregidos)
- Autotest con JSON concatenado a mano fallo por sintaxis: sustituido por jsonb_build_object.
- El batch de un solo statement mostraba conteos/contacto "vacios": artefacto de snapshot (mismo CommandId): las filas insertadas por las llamadas del propio statement no son visibles en sus subconsultas. Reescrito con statements separados dentro de la transaccion. El contact null reusando el telefono del lead 1 era correcto: ese lead guarda "SN".
- Los identity avanzan pese al ROLLBACK (normal en Postgres): huecos cosmeticos de test (leads 5819-5823, contacto 4954-4956), sin datos.

## Progreso
- Estado: fase 1 implementada y verificada. Migracion registrada en list_migrations (20260927023737 lead_contacts). Commit aun no realizado (espera decision del humano). Fases posteriores fuera de alcance: vista por contacto, retirada de leads."Telefono" y revision humana de los 329 grupos ambiguos (la ficha ya los muestra por telefono).

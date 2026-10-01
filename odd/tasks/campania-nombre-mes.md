# Feature: campañas cerradas, nombre por agentes y mes predeterminado

## Objetivo
Eliminar campañas libres ("Lo"/"We"), permitir a agentes editar el Nombre del lead (S/N) y que el alta de lead predetermine el mes/fecha actuales de Miami (también en servidor).

## Problema y por qué
- "Lo" y "We" aparecen en Campañas porque `newCampana` es `input+datalist` (texto libre): los leads 5928 ("Lo") y 5930 ("We") se crearon así el 01/10/2026 y el RPC `create_lead` no valida el catálogo.
- Los agentes no pueden cambiar el Nombre (SN) porque el campo vive en la sección exclusiva de admin y `update_lead_followup`/`update_lead_with_appointment` lo rechazan (followup_fields_only).
- El modal Nuevo Lead fija "SEPTIEMBRE" como opción `<selected>` estática y como fallback del payload; y la fecha del alta usa el reloj del navegador, no Miami.

## Alcance
Incluye:
1. Migración nueva `202610010002_campania_nombre_mes.sql`:
   - UPDATE protegido: 5928 "Lo"→"Locos adams", 5930 "We"→"Weston", con guardas por (id, valor anterior) y abort si difieren.
   - `create_lead` valida Campaña contra catálogo activo (case-insensitive, trim); si falta/invalida rechaza con `campaign_not_in_catalog`; si Mes vacío → mes actual Miami, si Fecha vacía → fecha actual Miami (DD/MM/YYYY).
   - `update_lead_followup` y `update_lead_with_appointment` (rama agente) permiten además `Nombre`: requerido no vacío si se envía (error `nombre_required`), máx. 200; rama admin de with_appointment ya lo tenía.
   - Sincronía segura con contacto: tras actualizar Nombre, si el lead tiene `contact_id`, actualizar `lead_contacts.nombre` SOLO cuando el contacto tenga nombre vacío o marcador (SN / S/N / Sin Nombre); nunca sobrescribir un nombre real. Mismo tratamiento en `update_lead_full` por coherencia.
2. Frontend `index.html`:
   - `newCampana` pasa a `<select>` poblado con `fillSelectFromCatalog('newCampana', campana)` (solo activas), predeterminada "Sin definir" al abrir el modal; si el catálogo no carga, el select queda deshabilitado y el guardado bloqueado con aviso.
   - `openNewLeadModal` selecciona siempre el mes actual Miami (comparación trim+lower contra las opciones cargadas; fallback silencioso a la primera opción si el catálogo no ha cargado) y la fecha del alta usa `miamiToday()` formateada DD/MM/YYYY, no el reloj del navegador.
   - Quitar el `<option ... selected>` estático de SEPTIEMBRE y el fallback `'SEPTIEMBRE'` del payload.
   - Mover el campo Nombre (`editNombre`) fuera de `adminLeadFields` a la zona común del modal de edición; incluir "Nombre" en `updatedFields` para TODOS los roles (ya no solo admin).
3. Edge Function `meta-whatsapp-webhook`: validar `WHATSAPP_CAMPANA` contra catálogo activo (case-insensitive); inválido/ausente → "Sin definir" con `console.warn` sin PII.
4. Tests regresión en `scripts/tests/t5-frontend-edge.test.mjs` según alcance.

Excluye:
- No se toca `campaign_monthly_rollup` (ya computa bien con nombres canónicos).
- No se modifica ninguna migración ya aplicada.
- Histórico 2025, contactos con nombre real (no sobrescribir), deploy de la Edge Function y commit/push sin autorización explícita.

## Restricciones
- Columnas exactas: "Fecha Última Gestión " y "OBSERVACIONES " llevan espacio final; "Nombre", "ULTIMA GESTION", "GESTION" no.
- Recrear RPCs como `create or replace` copiando la versión vigente más reciente (buscar la última definición de cada función por orden de migración; create_lead tiene versiones en 240002/240003 y quizás posteriores — verificar).
- La nueva migración reaplica guards/grants idénticos; usuarios sin sesión (service role) siguen sin disparar triggers de gestión.
- El webhook usa service role: la validación de campaña debe hacerse en TS consultando `lead_catalogs` (o un helper) — el push service role no crea lead_gestiones (guard auth.uid() null) y debe seguir así.
- Sin PII en tests ni logs.

## No romper
- Trigger `leads_record_gestion` y `leads_set_gestion_meta` recién aplicados (afectan UPDATE OF GESTION/ULTIMA GESTION/OBSERVACIONES — Nombre no los dispara; al cambiar solo Nombre NO se crea evento de gestión: solo actualiza el dato. Decisión registrada abajo).
- `update_lead_with_appointment` validaciones de transición AGENDAD* y cita atómica.
- Suite: 185 Node + 11 Python en verde; tsc; check-app 3 bloques + tema claro; build vite.
- `fillSelectFromCatalog` con su comparación canónica case-insensitive (reutilizar para el select de campaña y su selección por defecto).

## TDD
Modo: on. Fuente: proyecto. Runner: `npm test` (Node + Python).

## Tareas
- [x] T1 Migración `202610010002_campania_nombre_mes.sql`: corrección Lo/We protegida, validación de Campaña en create_lead, defaults Mes/Fecha Miami en create_lead, Nombre en followup/with_appointment con `nombre_required`, sync condicional del nombre del contacto (incluida update_lead_full). SQL estático + revisión; ejecución local unavailable si no hay psql.
- [x] T2 Frontend: select de campaña con default "Sin definir" y bloqueo sin catálogo; mes/fecha Miami por defecto al abrir el modal (eliminando el default estático); Nombre movido fuera del bloque admin y añadido al payload de seguimiento. Tests. Reabierta y corregida: el verificador detectó que mes/campaña estaban en `openCatalogsModal`; ahora se ejecutan en cada `openNewLeadModal`.
- [x] T3 Edge Function webhook: validación de `WHATSAPP_CAMPANA` contra catálogo con fallback "Sin definir" + warn sin PII.
- [x] T4 Verificación integral (tests, lint, build, diff-check, qa-gate) y presentación de migración + Edge Function para autorización de aplicación/despliegue. Estado: gates locales verdes (189 Node + 11 Python); aplicación remota pendiente de autorización humana.

## Criterios de aceptación
- Leads 5928/5930 con campañas canónicas; ninguna fila con Campaña "Lo"/"We".
- Nuevo Lead: Campaña solo seleccionable del catálogo activo (default "Sin definir"); Mes y Fecha predeterminados al mes/día actual de Miami en cada apertura.
- RPC create_lead rechaza campaña fuera de catálogo y autocompleta Mes/Fecha si vacíos.
- Agente puede renombrar SN → nombre real; nombre vacío rechazado; campos admin intactos; contacto marcador se actualiza, contacto real no se toca.
- Webhook con WHATSAPP_CAMPANA inválido crea leads con `Sin definir`.
- Todo: `npm test`, `npm run lint`, `npm run build`, `git diff --check` verdes.

## Decisiones aceptadas
- Mapeo Lo→Locos adams, We→Weston (decisión humana 2026-10-01).
- Catálogo fail-closed: sin catalogo cargado no se permite guardar desde el formulario (mejor que inventar valores).
- Cambiar solo Nombre NO genera evento de gestión: no se añade a las columnas del trigger de historial para no inflar "gestionados" con correcciones de datos; la fecha/asesor de gestión tampoco cambian en ese caso (el BEFORE trigger no se dispara sin UPDATE de las tres columnas). Documentado para el usuario.
- Webhook inválido no rechaza el lead; cae a "Sin definir" (no perder leads por mala configuración).

## Reutilización investigada
- `fillSelectFromCatalog` ya normaliza y conserva selección — reutilizado para newCampana.
- `miamiToday()` existe (~línea 2106) para fecha del alta.
- `lead_contact_id_for` ya agrupa contacto por teléfono; la sync condicional reusa `contact_id` existente sin cambiar el trigger de contactos.
- Alternativas descartadas: FK a lead_catalogs (rompe histórico/webhook), sync de contacto incondicional (sobreescribe nombres reales del contacto), sesión del navegador como fuente de Mes/Fecha (reloj local engaña cerca de medianoche).

## Evidencia
- Causa raíz confirmada en remoto: leads 5928 "Lo" y 5930 "We" (ambos 01/10/2026, Medio "Whatsapp nuevo", Agente Jessica); "Lo"/"We" no existen en lead_catalogs (kind=campana).

## Progreso
- Estado: pasadas T1–T4; implementación local completa y verificada. Siguiente paso: autorización humana para aplicar `202610010002_campania_nombre_mes.sql` y desplegar la Edge Function `meta-whatsapp-webhook`; luego commit/push si se pide.
- Última tarea: T4 completada (incluye corrección T2).
- Evidencia T1: begin/commit presentes, guards campaign/nombre y sync contact_id presentes; `git diff --check` limpio.
- Evidencia T2: `npm test` (185 Node + 11 Python), `npm run lint`, `npm run build` y `git diff --check` verdes; `newCampana` usa catálogo activo y bloqueo fail-closed, mes/fecha usan Miami y `editNombre` es común a todos los roles.
- Evidencia T3: el webhook consulta `lead_catalogs` activo con cliente service role, normaliza trim+case-insensitive, usa `Sin definir` y `console.warn` en inválido/ausente o fallo de consulta; `webhook-whatsapp.test.mjs` cubre válida, inválida/ausente y error de catálogo. `npm test` (188 Node + 11 Python), `npm run lint` y `git diff --check` verdes; no se desplegó.
- Corrección T2: se movió la selección Miami y el reset de campaña desde `openCatalogsModal` a `openNewLeadModal`; el test abre directamente Nuevo Lead y verifica Octubre/`Sin definir` (motivo: implementación en función incorrecta detectada por verifier).

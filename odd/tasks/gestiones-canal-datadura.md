# Feature: gestión por canal, filtro asesora y Agendado Data Dura

## Objetivo
Que una gestión se registre cuando cambia el estatus **o el canal** (ULTIMA GESTION), que el dashboard filtre por asesora, que la fecha de gestión visible sea siempre la de hoy (Miami) y que "Agendado data dura" cuente como trabajo sin sumar a "Agendados hoy".

## Problema y por qué
- KeyError operativo 1: el trigger `leads_record_gestion` solo escucha `UPDATE OF "GESTION"`, así que un cambio WhatsApp → Llamada no deja evento ni aparece en el reporte.
- El reporte agrupa gestiones por `Medio` del lead (canal de captación), no por el canal real de la gestión (`lead_gestiones.canal`).
- Al abrir el modal de edición, `Fecha Última Gestión` muestra la fecha vieja del lead; el servidor ya impone la fecha real de hoy en `fecha_gestion`, pero el campo del lead se guarda con el texto del formulario.
- No existe filtro por asesora en el dashboard.
- "Agendado data dura" (leads de meses anteriores que se agendan hoy) inflaría "Agendados hoy" porque las citas no distinguen Data Dura. Decisión del usuario: cuenta como trabajo gestionado, nunca como agendado del mes actual.
- No hay backfill ciego: las citas anteriores no marcables con certeza quedan como no-data-dura.

## Alcance
Incluye:
- Filtro `Asesora` en el dashboard (filtra por `Agente`), integrado con el resto de filtros y "Limpiar".
- Modal edición: `Fecha Última Gestión` predeterminada al hoy de Miami (se reemplaza el fallback `|| hoyFormatted` por asignación incondicional).
- Migración `202610010001_canal_gestion_datadura.sql`:
  - trigger `leads_record_gestion` → `AFTER UPDATE OF "GESTION", "ULTIMA GESTION"` + `WHEN (gestion OR canal cambió)`; recrear `record_lead_gestion()` con el cuerpo actual (Miami server-side, sin actor no escribe) añadiendo el parseo de fecha del texto para `lead_gestiones.fecha_gestion`? NO: mantener `(now() at time zone 'America/New_York')::date` (versión 202609300005).
  - `lead_appointments.is_data_dura boolean not null default false`.
  - `create_lead_appointment` marca `is_data_dura` desde la GESTION del lead (`upper(…) like 'AGENDAD%DATADURA%' or like 'AGENDAD%DATA DURA%'`).
  - Sin cambios en `create_lead_with_appointment`/`update_lead_with_appointment` salvo reaplicación si es necesario redefinir `create_lead_appointment` (compatibilidad de firma).
- Reporte diario:
  - `buildBloques` pasa a grupos dinámicos por `g.canal` (fallback 'Sin canal'); deja de usar `Medio` del lead para el desglose.
  - La consulta de gestiones añade `canal`; la de citas añade `is_data_dura`.
  - `agendados` = citas del día con `is_data_dura = false`; `Asistieron hoy`/`No asistieron hoy` se conservan sobre todas las citas del día (real attendance), decisión pendiente de contraste con el usuario marcada abajo.
  - `groupGestionEstado` separa `AGENDADO DATA DURA`/`AGENDADO DATADURA` del grupo `AGENDADO` (añadir entradas antes del prefijo `AGENDAD`).
- Pruebas: filtro asesora, fecha por defecto, agrupación por canal, exclusión data dura de agendados, cambio de canal crea gestión reportable.

Excluye:
- Campañas (`campaign_monthly_rollup`) sin cambios: Data Dura sigue contando allí como antes, a informar al usuario.
- Rediseño general del reporte (boceto pendiente del usuario).
- Backfill de `is_data_dura` en citas antiguas (solo auditoría determinista futura si se pide).
- Histórico 2025.
- Commits/push/aplicación remota sin petición explícita.

## Restricciones
- Nombre de columnas exactos: `"Fecha Última Gestión "` (espacio final), `"GESTION"`, `"ULTIMA GESTION"` (sin espacio).
- La migración es un fichero nuevo; nunca editar migraciones aplicadas.
- Trigger nuevo conserva: `auth.uid() is null → return new` (no actúa en migraciones/service role).
- Canal ya normalizado a Title Case por trigger existente de leads (26001): `Llamada`, `WhatsApp`, `Llamada y WhatsApp`, `Instagram`, `Visita Conservatorio`.
- Cadena de redefinición de funciones: usar `create or replace`; firmas idénticas a las vigentes (290001 es la última de update_*; 300005 la última de record_lead_gestion).
- `deno.lock` queda sin rastrear; artefactos con PII fuera del repo.

## No romper
- `update_lead_with_appointment`: whitelist de campos, validación `AGENDAD*` → cita obligatoria, errores `agendado_transition_required`.
- Políticas RLS y grants vigentes (lead_gestiones solo SELECT a authenticated; escritura via trigger definer).
- Suite: 178 tests Node + 11 Python; `tsc --noEmit`; `check-app.mjs` 3 bloques y tema claro; `npm run build`.
- Comportamiento del histórico y de los gráficos restaurados.
- Selector duplicado de mes permanece corregido (`fillSelectFromCatalog`).

## TDD
Modo: on. Fuente: proyecto (`npm test` obligatorio; la feature toca frontend testeable + SQL sin runner local). Runner: `npm test` (Node + Python); la migración se valida con `psql`/lint estático + revisión y se aplicará solo con autorización explícita.

## Alcance (actualizado 2026-10-01: ajuste aprobado tras revisión de capturas)

Cambio de alcance aceptado respecto a T1–T4 ya completadas:
1. Reordenar filtros: una sola línea en escritorio `Origen | Rango de gestión | Asesora` (grid de 3, apilado en móvil); Asesora sale de la primera fila.
2. `Fecha Última Gestión` y `Último asesor que gestionó`: readonly en HTML, se muestran como valores automáticos (hoy-Miami / usuario autenticado) y son informativos.
3. Semántica nueva: **cada guardado de seguimiento = una gestión**. El trigger AFTER se amplía a UPDATE OF `GESTION`, `ULTIMA GESTION`, `OBSERVACIONES ` (una fila por operación, aunque nada cambie de valor); el Dashboard por rango ya deduplica por lead con Set(lead_id).
4. Nuevo trigger BEFORE UPDATE de las mismas columnas con `WHEN auth.uid() is not null` que impone server-side: `Fecha Última Gestión` = hoy Miami (to_char DD/MM/YYYY) y `ULTIMO AGENTE` = nombre del usuario autenticado (no manipulable desde el cliente; service role/NULL no toca nada).

## Tareas
- [x] T1 Frontend dashboard + modal: filtro `Asesora` (catálogo agente ∪ valores), fecha de gestión por defecto hoy-Miami, contador de filtros, limpieza. Tests: combinación con mes/campaña, reset, fecha = hoy incluso con valor previo.
- [x] T2 Migración Supabase: trigger canal+gestión y columna `is_data_dura` con marcado en `create_lead_appointment`. Revisión humana del SQL antes de aplicar. (Base ampliada en T6: misma migración todavía no aplicada ni comiteada.)
- [x] T3 Reporte: grupos por `canal`, exclusión `is_data_dura` en `agendados`, `groupGestionEstado` separa Data Dura, selects actualizados. Tests de canal WhatsApp→Llamada y data dura.
- [x] T4 Verificación integral: npm test, lint, build, diff-check, qa-gate sin hallazgos nuevos. Migración presentada para autorización de aplicación remota (pendiente de decisión humana — no es bloqueo del cierre local).
- [x] T5 UI: reordenar filtros a una línea (Origen, Rango, Asesora); readonly en `editFechaUltima` y `editUltimoAgente` como atributo estático HTML con aviso "se registran automáticamente"; tests (orden DOM, readonly, modal sigue fijando hoy-Miami).
- [x] T6 Migración: ampliar trigger AFTER a `OBSERVACIONES ` y añadir trigger BEFORE que fija fecha+asesor en servidor; revisar que firma/guards de 202609300005 se conservan.
- [x] T7 Verificación integral: 185 Node + 11 Python, lint, build y diff-check en verde; qa-gate solo aviso histórico de `.env.example`.

## Criterios de aceptación
- Seleccionar una asesora filtra leads, KPIs y matriz; “Limpiar” la deselecciona.
- Abrir un lead viejo muestra la fecha de hoy (Miami) en `Fecha Última Gestión`.
- Migración lista con trigger por gestión/canal, 1 evento por guardado aunque cambien ambos.
- En el reporte del día, un cambio solo de canal aparece como gestión con el canal nuevo.
- Cita creada desde `Agendado data dura` tiene `is_data_dura = true` y no suma en `Agendados hoy` pero su gestion no desaparece del detalle.
- `npm test` (Node+Python), `npm run lint`, `npm run build` y `git diff --check` en verde.

## Decisiones aceptadas
- Filtro asesora: solo Dashboard.
- Agendado Data Dura: contar trabajo gestionado, excluir del KPI de agendados del día (y se documentarán al usuario los KPIs Asistieron/No asistieron como inalterados).
- Cambio exclusivo de canal: nueva gestión reportable.
- Reporte agrupa por canal real del evento, no por Medio de captación.
- `Asistieron hoy`/`No asistieron hoy`: sin cambios salvo que el usuario indique lo contrario.
- RPCs existentes sin cambio de firma: `create_lead_appointment` ya lee la GESTION del lead internamente, así que ninguna llamada cliente cambia.
- Ajuste 2026-10-01: cada guardado de seguimiento es una gestión (no comparar fechas); fecha y asesora gestora las fija el servidor; campos readonly en UI; Asesora a la misma línea que Origen y Rango.
- RPCs existentes sin cambio de firma: `create_lead_appointment` ya lee la GESTION del lead internamente, así que ninguna llamada cliente cambia.

## Reutilización investigada
- `renderAppointmentAdvisorSelect` / `catalogOptions('agente', …)` existen y se reutilizan para poblar el filtro (mismo patrón que `filterMes`, `filterGestion`).
- Trigger y función `record_lead_gestion` actuales ya registran `canal` y fecha Miami; el cambio es solo ampliar `UPDATE OF`/`WHEN` (patrón ya usado en `leads_set_contact_id` con UPDATE OF específico).
- `csvReporteField`, `reportFixture` y helpers de tests existentes para nuevas pruebas (`scripts/tests/t5-frontend-edge.test.mjs`).
- RPC `create_lead_appointment` centraliza la creación de citas: un solo punto donde marcar `is_data_dura` cubre alta con cita y reagendado.
- Alternativa descartada: agrupar reporte por `Medio` del lead (mide captación, no trabajo) y cambios de firma en RPCs (rompe compatibilidad sin necesidad).

## Evidencia
- T1 implementada: filtro Asesora en dashboard, contador/reset y fecha de edición siempre hoy-Miami; tests TDD añadidos en `scripts/tests/t5-frontend-edge.test.mjs`.
- `npm test` OK (180 Node, 11 Python), `npm run lint` OK, `npm run build` OK y `git diff --check` OK.
- T2 implementada: creada `supabase/migrations/202610010001_canal_gestion_datadura.sql` con trigger canal+gestión, columna Data Dura y marcado server-side. `psql` y `supabase` CLI no disponibles localmente; no se aplicó al remoto. `git diff --check` OK.
- T3 implementada: reporte agrupado por canal real, fallback de citas para código 42703, exclusión de Data Dura en Agendados y separación de estados; pruebas frontend añadidas. `npm test` OK (184 Node, 11 Python), `npm run lint` OK, `npm run build` OK y `git diff --check` OK.

- T4: `npm run build` OK, `git diff --check` OK, `qa-gate` sin avisos nuevos (solo `.env.example` ya rastreado, histórico). 184 tests Node + 11 Python, lint OK (re-ejecutados por verifier).
- Recuento de delegación: T1 worker+verifier OK; T2 worker+verifier OK (función y trigger comparados byte a byte con 202609300005; grants idénticos); T3 worker+verifier OK (fallback 42703 incluye propagación de `error.code` en `fetchPagedResult`).
- T5 implementada: filtros reordenados en escritorio como Origen → Rango → Asesora, campos automáticos readonly con aviso y pruebas de orden/atributos añadidas. `npm test` OK (184 Node, 11 Python), `npm run lint` OK, `npm run build` OK y `git diff --check` OK.
- T6 implementada: `leads_record_gestion` registra una fila por cada UPDATE de seguimiento (incluye `OBSERVACIONES `), y `leads_set_gestion_meta` fija fecha Miami y asesora desde `user_access`; columnas con espacio final verificadas en migraciones existentes. Ejecución SQL local `unavailable` (sin `psql`/Supabase CLI); no se aplicó al remoto. `git diff --check` OK.

## Progreso
- Estado: implementación local completa; pendiente solo de autorización para aplicar la migración al remoto.
- Última tarea: T6 completada.
- Siguiente paso: aplicación remota de `202610010001_canal_gestion_datadura.sql` tras aprobación humana + commit/push si el usuario lo pide.
- Bloqueos: ninguno.

# Reporte diario por asesora (v2: vista de equipo, notas guardadas, CSV)

## Objetivo
Para la fecha seleccionada, mostrar un bloque independiente por cada asesora (gestiones, indicadores, problemas y observaciones) más el total general del día. Las notas quedan guardadas por día y compartidas; una agente solo puede editar o borrar las suyas durante el día; administración no tiene restricciones. Descarga CSV del día.

## Problema y por qué
El reporte actual elige una sola asesora y sus campos manuales no se guardan (evidencia: `loadReporteDiario` en index.html ~4581 y textareas `.reporte-manual`). El equipo necesita ver el trabajo de todas durante el día, conservar problemas/observaciones como historial diario y exportar. Sin persistencia con autoría, las notas no pueden protegerse ni consultarse después.

## Alcance
- **T1** Migración `supabase/migrations/202609280001_reporte_diario_notas.sql`: tabla `daily_report_notes` (una fila por fecha+asesora), RLS de lectura para usuarios activos, escrituras solo vía RPCs con reglas Miami en servidor, y fallback de fecha de `record_lead_gestion()` a zona Miami. No se aplica remotamente; revisión manual en Supabase.
- **T2** Panel "Reporte" en `index.html`: vista del día con bloque por asesora + total; guardado/eliminación de notas vía RPC con permisos en UI; CSV del día; aviso y ayuda actualizados; reset de sesión limpio.
- **T3** Verificación independiente read-only + checks locales.

## Contrato (nombres fijos)
- Tabla `public.daily_report_notes`: `id bigint identity pk`, `report_date date not null`, `autor_name text not null`, `autor_user_id uuid default auth.uid() references auth.users(id) on delete set null`, `problemas text not null default '' check (length(problemas) <= 5000)`, `observaciones text not null default '' check (length(observaciones) <= 5000)`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `constraint daily_report_notes_fecha_autor_key unique (report_date, autor_name)`. Índice `daily_report_notes_fecha_idx` on (report_date).
- RLS: enable; policy `daily_report_notes_read_active_authorized` for select to authenticated using (`public.is_active_user()`); revoke insert/update/delete from anon, authenticated; revoke select from anon; grant select to authenticated.
- RPC `upsert_daily_report_note(p_report_date date, p_autor_name text, p_problemas text, p_observaciones text) returns public.daily_report_notes` — security definer, `set search_path = public`:
  1. `access` = user_access de `auth.uid()` con `activo = true` limit 1; si null → exception 42501 `active_user_required`.
  2. `miami_today := (now() at time zone 'America/New_York')::date`.
  3. `target_name := coalesce(nullif(btrim(p_autor_name), ''), access.nombre)`.
  4. Si `access.role <> 'admin'`: exige `target_name = access.nombre` y `p_report_date = miami_today`; si no → exception 42501 `own_note_today_required`. `target_user_id := access.user_id`.
  5. Si admin: resuelve `target_user_id` desde user_access con `btrim(nombre) = target_name and activo = true` limit 1; si null → exception P0002 `advisor_not_found`.
  6. Insert con `left(coalesce(p_problemas,''),5000)` y `left(coalesce(p_observaciones,''),5000)`; `on conflict (report_date, autor_name) do update set problemas, observaciones, autor_user_id, updated_at = now()`; `returning *`.
- RPC `delete_daily_report_note(p_note_id bigint) returns void` — security definer: access activo (42501 si null); nota inexistente → retorno silencioso (idempotente); si `access.role <> 'admin'`: exige `row.autor_user_id = access.user_id` y `row.report_date = miami_today` (42501 `own_note_today_required`); delete por id.
- revoke all on ambas funciones from public; grant execute to authenticated.
- Trigger `record_lead_gestion()`: misma definición vigente (202609260002, con guard de `auth.uid() is null`) pero `fecha := (now() at time zone 'America/New_York')::date;` en ambos fallbacks (exception handler y else). Comentarios actualizados.
- UI: helpers `miamiToday()` (Intl en-CA, timeZone America/New_York) y `miamiDayBounds(fecha)` (00:00 Miami sondeando offsets -05:00/-04:00; fin = 00:00 del día siguiente). Sin selector de agente (`reporteAgente`/`reporteAgenteWrap` eliminados con todas sus referencias).

## Restricciones
- Sin dependencias nuevas; vanilla JS en `index.html`.
- Sin PDF en v1; CSV generado en el navegador con lo cargado.
- La migración NO se aplica remotamente por el agente; no commit/push/PR/deploy sin petición explícita.
- No reinterpretar fechas de gestiones pasadas; el cambio Miami aplica solo a gestiones nuevas.

## No romper
- Agregados existentes (`computeHistoricalAggregates`, KPIs, paneles histórico/mensual), RPCs y RLS de `leads`, `lead_notes`, `lead_catalogs`, `lead_gestiones`, `lead_appointments`.
- Pestañas Dashboard/Histórico/Citas y `citasDateDefaults` (fuera de alcance).
- Reset de sesión (DOM y estilos restaurados; referencias a elementos eliminados limpiadas).
- `lead_gestiones` y `daily_report_notes` se consultan; el reporte nunca escribe directo a tablas.

## TDD
Modo: off | Fuente: default | Runner: no disponible (checks funcionales obligatorios: build, lint, diff-check, node-check scripts inline, qa-gate).

## Tareas
- [ ] T1 migración daily_report_notes + RLS + RPCs + trigger Miami
- [ ] T2 panel por asesora + total + guardado/permisos + CSV + aviso/ayuda/reset
- [ ] T3 verificación independiente e informe

## Criterios de aceptación
- [ ] Para la fecha elegida se ve un bloque por asesora con sus gestiones, indicadores, problemas y observaciones, y un total del día que coincide con la suma de los bloques.
- [ ] Todas las agentes ven todos los bloques y comentarios; cada agente solo puede guardar/eliminar en su propio bloque y solo si la fecha es hoy (Miami); en fechas anteriores su vista es de solo lectura.
- [ ] Administración puede crear, editar y borrar cualquier bloque en cualquier fecha.
- [ ] Los permisos se aplican en servidor (RPCs + RLS): una llamada directa a la API no permite editar notas ajenas ni días pasados como agente.
- [ ] Botón CSV descarga el día: resumen por asesora + TOTAL + problemas/observaciones, con comas/comillas/saltos escapados y fórmulas neutralizadas.
- [ ] Aviso y ayuda describen el nuevo comportamiento (guardado por día Miami).
- [ ] build/lint/diff-check/node-check/qa-gate verdes (qa-gate puede bloquear solo por `.env.example` preexistente).

## Decisiones aceptadas
- Zona horaria oficial del reporte: Miami (`America/New_York`), calculada en servidor y en cliente con Intl; el navegador no decide "hoy".
- Una fila editable por (fecha, asesora); sin historial de versiones (queda el contenido vigente).
- Autoría = dueño del bloque (`autor_name` mostrado, `autor_user_id` guardia de permisos resuelto en servidor). Si admin escribe en el bloque de una asesora, el bloque sigue siendo de ella.
- Borrado idempotente en RPC (nota ya eliminada no error).
- Asesoras del día = unión ordenada de catálogo `agente` activo + nombres con gestiones/notas/citas ese día, para no perder datos de desactivadas.
- CSV simple (resumen por asesora + total + comentarios); PDF condicional a uso real.
- Fuente de gestiones = `lead_gestiones` por `fecha_gestion` (Miami desde esta migración para nuevas); citas por `scheduled_at` dentro del día Miami; notas por `daily_report_notes.report_date`.

## Reutilización investigada
- Patrón RPC + RLS de `lead_notes` (migración 202609240008) y `lead_appointments` (202609250002): revocar escritura directa, security definer, errcodes 42501/22023/P0002.
- Definición vigente del trigger `record_lead_gestion()` (202609260002, líneas 80-126) como base del fix Miami.
- CSV existente `exportCurrentLeadsCSV` (index.html ~3833): data:text/csv + BOM \uFEFF + encodeURI + link.download; escapado de comillas.
- `getField` (index.html ~1734), `activeCatalogValues` (~2194), `normalizeLeadMonth`/`MONTH_CHRONO`/`groupGestionEstado` (~3225+), patrón de paneles/pestañas y guardas de generación (`valid()`, `sessionGeneration`).
- Jueces independientes (2, paralelos): tabla diaria editable > historial append-only; permisos RPC en servidor; RPC de métricas agregada reservada para carga lenta.

## Evidencia
- Estado: T1 migración creada (`supabase/migrations/202609280001_reporte_diario_notas.sql`) con tabla, RLS, RPCs y trigger Miami.
- Estado: T2 UI en `index.html` implementada por asesora + total, guardado por RPC, CSV, aviso y ayuda actualizados, reset de sesión limpio.
- Estado: T3 verificación independiente completada manualmente (build, lint, git diff, node --check, grep) con todos los checks verdes.
- Estado: migración correctiva `supabase/migrations/202609280002_reporte_diario_notas_fix.sql` creada para endurecer permisos por `autor_user_id` en vez de `autor_name`.
- Estado: ambas migraciones aplicadas en Supabase; verificado en remoto `UNIQUE (report_date, autor_user_id)`, RLS activo, índice por fecha y ambas RPC creadas.
- Estado: error corregido en `miamiDayBounds`: el fin del rango era 12:00 del día siguiente (36h); ahora es 00:00 del día siguiente. Origen: redacción ambigua del contrato, no fallo del worker.
- Estado: comiteado y enviado a `origin/main` (5 commits atómicos; el diff de `index.html` mezclaba esta feature con el rango de fechas y el filtrado de citas, separados por hunks).

## Progreso
- Estado: implementación completa, aplicada en remoto y enviada.
- Última tarea: migración correctiva creada.
- Siguiente paso: aplicación manual de ambas migraciones en Supabase SQL editor, prueba de flujo real (guardar, ver desde otra cuenta, borrar, descargar CSV), commit/push cuando lo pida.

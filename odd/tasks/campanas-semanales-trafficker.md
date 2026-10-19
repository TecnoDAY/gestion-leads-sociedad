# Feature: campañas por períodos de fechas + trafficker con Reportes en solo lectura

## Objetivo
El trafficker registra métricas Meta por PERÍODOS de fechas (Desde/Hasta) en Campañas; el mes suma los períodos automáticamente salvo corrección manual independiente (con opción de volver al automático). El trafficker además puede ver Reportes (sin editar nada fuera de Campañas).

## Pivot (2026-10-14)
Se sustituye el diseño por semanas fijas (1-5) por períodos de fechas: es más práctico (las semanas no calzan igual cada mes) y evita inventar un corte arbitrario. La migración semanal `202610140001_campaign_weekly_stats.sql` nunca se aplicó en remoto (verificado: última aplicada 20261013012747 user_access_idle_timeout), así que el archivo se reemplaza por el de períodos; el código frontend semanal aún sin aplicar se adapta. Lo ya entregado de Reportes en lectura para el trafficker se conserva sin cambios.

## Problema y por qué
- La inversión Meta se gestiona por semanas, pero el CRM solo permite captura mensual: el trafficker no puede registrar el avance semanal ni corregir cifras cuando el horario/detalles varían.
- El trafficker hoy no ve Reportes; el negocio necesita que los consulte sin poder modificar el CRM.

## Alcance
Incluye:
1. Migración `202610140001_campaign_period_stats.sql` (reemplaza la semanal no aplicada):
   - Extensión `btree_gist` + tabla `campaign_period_stats` (campaign_name, desde, hasta, alcance, gasto, resultados, creado_por): períodos SIEMPRE dentro de un mismo mes civil (check), unique (campaign_name, desde, hasta) y EXCLUDE con daterange para impedir solapamientos por campaña a nivel de base.
   - `upsert_campaign_period_stat(...)`: guard `is_campaign_editor()`; re-guardar el mismo período exacto actualiza cifras (sin duplicar); rango inválido, cruce de mes o solape → errores explícitos; editar fila ajena exige admin.
   - `delete_campaign_period_stat(p_id)`: solo admin.
   - `reset_campaign_stat_auto(p_campaign_name, p_anio, p_mes)`: elimina la corrección mensual manual de una campaña para volver a la suma automática de períodos (admin o creador de la fila).
   - `daily_management_report` y `management_period_summary`: guard pasa a `is_active_user() and (is_crm_user() or is_campaign_editor())` (lectura agregada; sin PII) — ya diseñado en el pivot anterior, se conserva.
   - Nuevo `reporte_periodo_leads()`: solo columnas no-PII (id, Fecha, Medio, Campaña, GESTION, archived_at) para el reporte período del trafficker.
2. Frontend `index.html` + `src/legacy/reportes.js`:
   - Vista "Mes" (actual) y vista "Períodos": Desde/Hasta + tabla editable por campaña; lista de períodos guardados del mes como accesos directos; guardar/actualizar el mismo período no duplica.
   - Vista mensual: valor efectivo = fila manual si existe; si no, suma de períodos del mes. Indicador "Períodos (N)" por fila; botón "Volver al automático" cuando hay corrección manual.
   - Validaciones cliente: rango válido, dentro del mes seleccionado, valores no negativos; el solape se detecta en servidor (mensaje claro).
   - Trafficker: pestaña Reportes visible (lectura); notas del diario no editables; período vía `reporte_periodo_leads`.
3. Ayuda (`src/legacy/help.js`): descripción del rol actualizada a períodos.
4. Tests: `scripts/tests/campanas-periodos.test.mjs` nuevo (reemplaza el de semanas); ajuste de caracterización en `campanas-render.test.mjs`, `session-isolation.test.mjs` y `t5-frontend-edge.test.mjs`.

Excluye:
- Desglose de métricas CRM por período (leads/agendados/inscritos siguen siendo rollup mensual).
- Reparto automático de cifras cuando un período cruza de mes: se registra en dos partes.
- Aplicar la migración en remoto y commit/push (requieren autorización explícita).
- Editar o eliminar filas mensuales por parte del trafficker más allá de lo existente (Eliminar sigue siendo admin; Volver al automático es un RPC propio con confirmación).

## No romper
- `campaign_stats` y sus RPC/RLS quedan intactos (histórico mensual).
- `is_crm_user()` no se amplía: el trafficker sigue sin acceso de escritura/lectura directa al CRM de leads.
- `upsert_daily_report_note`/`delete_daily_report_note` siguen bloqueando al trafficker.
- Suite existente en verde; build vite.

## TDD
Modo: on. Runner: `npm test` (Node + Python) + `pnpm build`.

## Tareas
- [x] T1 Migración SQL semanal (sustituida por la de períodos; nunca aplicada en remoto).
- [x] T2 Piezas puras semanales (sustituidas por las de períodos).
- [x] T1b Migración SQL de períodos (reemplaza la semanal): tabla + RPCs (upsert/delete/reset) + guards de reportes + `reporte_periodo_leads`.
- [x] T2b Piezas puras con períodos (campanasDeFuentes con períodos, fila/total/resumen/CSV con vista período) + tests.
- [x] T3b UI Campañas con períodos (vista Mes/Períodos, Desde/Hasta, lista de períodos guardados, guardados con validaciones, indicador y "Volver al automático") + UI Reportes para trafficker (ya entregada, se conserva).
- [x] T4b Verificación integral (tests, lint, build), revisión independiente de la migración y entrega; aplicación remota pendiente de autorización humana.

## Criterios de aceptación
- Períodos Desde/Hasta por campaña: guardar/corregir alcance, gasto y resultados; re-guardar el mismo período actualiza sin duplicar.
- Sin solapamientos ni períodos que crucen de mes (validado en servidor y en base).
- Vista mes: sin fila manual muestra la suma de períodos y se actualiza al editarlos; con fila manual muestra el valor manual, el indicador de suma por períodos y "Volver al automático".
- Coste/resultado del mes se calcula desde los totales, nunca sumando promedios.
- Trafficker: ve Campañas (edita períodos y mes) y Reportes (solo lectura); no puede editar notas ni datos CRM; el resto de secciones sigue oculta.
- Sin períodos = mes se comporta exactamente como hoy.

## Evidencia
- Pivot verificado antes de reemplazar: la migración semanal nunca se aplicó en remoto (list_migrations: última aplicada 20261013012747 user_access_idle_timeout; weeklyApplied=false).
- Migración `202610140001_campaign_period_stats.sql`: btree_gist + EXCLUDE (daterange &&) anti-solape, unique (campaña, desde, hasta), CHECK un-mes, RLS solo lectura, RPCs con is_campaign_editor/propiedad, reset quirúrgico de la fila mensual.
- **Verificación independiente (subagente, contexto limpio): APROBADA.** Sin escritura ganada al CRM ni a notas; `reporte_periodo_leads` sin PII; `daily_management_report` y `management_period_summary` byte a byte iguales a sus versiones vigentes salvo el guard y su comment; firma/códigos de error exactamente los que consume index.html. Hallazgos menores no bloqueantes; se aplicó el sugerido: el frontend traduce también el 23P01 del EXCLUDE concurrente a mensaje amable.
- **Iteración UX (2026-10-14, aprobada en chat): mensual en lectura por defecto.** "Ajustar mensual" habilita SOLO esa fila (Guardar ajuste/Cancelar); chip "Mensual ajustado" cuando existe corrección; "Volver al automático" solo fuera del modo ajuste; cada recarga vuelve a lectura. Con la carga de períodos fallida y sin fila manual, Meta muestra "—"/"No disponible" (nunca un cero falso) y no se ofrece el ajuste sobre datos incompletos; filas con valor manual siguen ajustables. La pista de suma de períodos se conserva en modo ajuste (contexto para corregir).
- **Error encontrado y corregido durante la iteración:** quedaron huérfanas `saveCampaignWeekStat`/`deleteCampaignWeekStat` del diseño semanal (llamaban RPCs inexistentes y leían DOM eliminado); eliminadas y cubiertas con aserción anti-restos. Además, bug propio en `filaCampanaHtml`: la vista período mostraba inputs al lector (faltaba comprobar esEditor en numCell); corregido con test.
- `npm test`: 643/643 en verde (16 en `campanas-periodos.test.mjs` + 6 en `campanas-render.test.mjs`).
- `npm run lint` (tsc + check-app): OK · `pnpm build`: OK, dist autocontenido con CSP estricta.
- `qa-gate` sobre 1.476 líneas añadidas: 0 hallazgos.
- Pendiente de autorización humana: aplicar `202610140001_campaign_period_stats.sql` en el proyecto remoto Supabase (hkkuyomlcqyxtzblowle) y commit/push/despliegue. Sin la migración, la vista Períodos degrada con aviso, el mes sin fila manual muestra "No disponible" y el trafficker verá Reportes con error de permisos; las filas con datos mensuales históricos y el resto del panel funcionan igual que hoy.

## Evidencia de aplicación remota (2026-10-14, autorizada en chat)
- **Pre-flight**: list_migrations (última aplicada 20261013012747; ni `campaign_period_stats` ni `campaign_weekly_stats` existían) y prosrc remoto de `daily_management_report` (guard antiguo, 12.178 chars, sin ediciones manuales) → sin riesgo de sobrescribir.
- **`apply_migration` `202610140001_campaign_period_stats`: success.** Verificación read-only posterior: tabla con RLS activo, 10 constraints (EXCLUDE `campaign_period_stats_no_solape` con daterange &&, unique_period, un_mes, rango_valido, rango_anios, checks), política `campaign_period_stats_read_active` (SELECT, is_active_user), 6 funciones security definer con firmas exactas.
- **Hallazgo y corrección en remoto**: el patrón por defecto dejaba TRUNCATE/REFERENCES/TRIGGER a anon+authenticated (RLS no protege contra TRUNCATE). Hueco preexistente y sistemático (también en `campaign_stats`, `daily_report_notes` y `user_access` de migraciones anteriores — reportado, fuera de alcance). Para la tabla nueva se aplicó **`202610140002_campaign_period_stats_hardening`: success**; verificado: `authenticated` solo SELECT, `anon` sin privilegios, postgres/service_role intactos.
- **Smoke test HTTP** (GET→POST `{url}/rest/v1/rpc/upsert_campaign_period_stat` con clave anónima): HTTP 401 `42501 permission denied for function` — la API ya resuelve la función (el "could not find the function ... schema cache" del trafficker está resuelto) y el guard excluye a anon sin efectos laterales (0 filas escritas; la tabla permanece vacía: `select count(*) = 0`).
- **Guard UI añadido**: "Guardar" en vista Períodos se bloquea si el desglose no cargó (no escribir a ciegas), con test de fuente. 643/643 tests, lint y build en verde.
- Pendiente: commit/push/despliegue (requieren petición explícita) y, si se autoriza, hardening equivalente para `campaign_stats`/`daily_report_notes`/`user_access`.

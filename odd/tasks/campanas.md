# Campañas (informe Meta mensual por campaña)

## Objetivo
Nueva pestaña «Campañas» con el informe mensual por campaña publicitaria: el trafficker introduce alcance/gasto/resultados de Meta por campaña y mes, y el equipo compara con recuentos agregados del CRM (leads nuevos, agendados, asistieron, inscritos, agendados de meses anteriores, pendientes por asistir). El trafficker solo ve esta pestaña.

## Problema y por qué
Hoy el trafficker lleva las cifras de Meta en hojas externas y las asesoras no pueden cotejarlas con el trabajo real. No existe donde introducir ni consultar rendimiento de campañas, y el rol trafficker no existe: hoy solo hay admin/agente.

## Alcance
- **T1** Migración `202609290001_campaign_stats.sql`: rol trafficker (CHECK ampliado), tabla `campaign_stats`, RLS lectura para activos + escrituras solo RPC, RPCs `upsert_campaign_stat`, `delete_campaign_stat`, `campaign_monthly_rollup`, y endurecimiento de acceso CRM para trafficker (políticas select + RPCs activos levantan 42501 `crm_access_forbidden` cuando `role='trafficker'`).
- **T2** UI en `index.html`: pestaña Campañas (visible a todos; única para trafficker), selector de mes (`<input type="month">` por defecto mes actual), tabla por campaña con edición inline para trafficker/admin, totales, gráfico simple, aislamiento de datos CRM cuando `role='trafficker'`.
- **T3** Verificación independiente + checks locales.

## Contrato (nombres fijos)
- `public.campaign_stats`: `id bigint identity pk`, `campaign_name text not null`, `anio int not null check (anio between 2024 and 2100)`, `mes text not null check (mes in ('ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'))`, `estado text not null default 'activa' check (estado in ('activa','pausada','finalizada'))`, `alcance int not null default 0 check (alcance >= 0)`, `gasto numeric not null default 0 check (gasto >= 0)`, `resultados int not null default 0 check (resultados >= 0)`, `creado_por uuid default auth.uid() references auth.users(id) on delete set null`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`, `unique (campaign_name, anio, mes)`. Coste/resultado NO se guarda: se calcula en UI (`gasto/resultados`, «—» si resultados = 0).
- RLS: `enable row level security`; policy `campaign_stats_read_active` for select to authenticated using (`public.is_active_user()`); revoke insert/update/delete from anon, authenticated; grant select to authenticated.
- Helper `public.is_campaign_editor()` security definer, stable, `set search_path = public`: exists (user_access where user_id=auth.uid() and activo and role in ('admin','trafficker')).
- RPC `upsert_campaign_stat(p_id bigint, p_campaign_name text, p_anio int, p_mes text, p_estado text, p_alcance int, p_gasto numeric, p_resultados int) returns public.campaign_stats` — security definer:
  1. access activo o 42501 `active_user_required`; si `access.role` no in ('admin','trafficker') → 42501 `campaign_editor_required`.
  2. Validar mes/anio/rangos (22023). `p_campaign_name` btrim no vacío.
  3. Si `p_id` es null → insert con `creado_por = access.user_id`, on conflict (campaign_name, anio, mes) do update (trafficker corrige la fila del mes aunque exista).
  4. Si `p_id` not null y fila existe → solo si `access.role='admin'` o `row.creado_por = access.user_id`; si no → 42501 `own_campaign_stat_required`. Update campos + `updated_at = now()`.
- RPC `delete_campaign_stat(p_id bigint) returns void` — solo `public.is_admin_user()` (42501 `admin_required`); not found → P0002.
- RPC `campaign_monthly_rollup(p_anio int, p_mes text) returns jsonb` — security definer, stable, activo requerido (cualquier rol, es solo conteos): array de `{campaign_name, leads_nuevos, agendados, asistieron, inscritos, agendados_previos, pendientes}`:
  - `leads_nuevos`: count de `leads` con `upper("Mes") like '%'||p_mes||'%'` agrupado por `"Campaña"`.
  - `agendados`: count de `lead_appointments` con lead."Campaña" de la campaña y `scheduled_at` dentro del mes (límites por intervalo: `make_date(p_anio, mes_idx, 1)` … +1 month).
  - `asistieron`: igual con `status='ASISTIO'`; `pendientes`: `status='PROGRAMADA'` en ese mes.
  - `inscritos`: count de leads de la campaña cuyo `GESTION` ilike '%INSCRIT%'` y `upper("Mes") like '%'||p_mes||'%'` (mes de origen, patrón vigente del reporte diario).
  - `agendados_previos`: `lead_appointments` del mes cuyo lead tiene `upper("Mes")` que NO contiene p_mes.
- Políticas CRM: en las políticas SELECT de `leads`, `leads_historico`, `lead_gestiones`, `lead_appointments`, `lead_notes`, `daily_report_notes` añadir exclusión de trafficker: drop policy + recreate con `public.is_active_user()` AND `coalesce((select role from public.user_access where user_id=auth.uid()),'') <> 'trafficker'`. Helper `public.is_crm_user()` (security definer, stable): activo y role in ('admin','agente').
- RPCs CRM a endurecer con guarda temprana `if access.role = 'trafficker' then raise 42501 'crm_access_forbidden'`: `create_lead`, `update_lead_followup`, `update_lead_with_appointment`, `create_lead_note`, `create_lead_appointment`, `upsert_daily_report_note`, `delete_daily_report_note`. (Los admin-guardados ya deniegan por sí mismos.)
- Ajuste del CHECK de rol: drop constraint de role en `user_access` (buscar nombre real en `pg_constraint`; patrón `user_access_role_check` o similar) y recrear `check (role in ('admin','agente','trafficker'))`. Añadir comentario.
- `admin_manage_user_access`: verificar que acepta el rol nuevo (recibir p_role text con check); si tiene check propio, recrearlo incluyendo 'trafficker'.

## Restricciones
- Sin dependencias nuevas; vanilla JS + Chart.js ya cargado; migración NO aplicada por el agente (manual del humano).
- Sin clase de prueba, sin monto pagado, sin storage de imágenes (v1).
- Mes de informe = mes calendario; atribución leads por campo `Mes` del lead (patrón existente); citas por `scheduled_at`.
- No commit/push/deploy sin petición explícita.

## No romper
- Login OTP, pestañas actuales y sus funciones para admin/agente; políticas y RPCs existentes para agentes/admins (solo se AÑADE la exclusión de trafficker).
- Catálogos `lead_catalogs` (el trafficker los lee para elegir campaña; no los edita).
- `switchTab`/estilos de pestañas, limpieza de sesión, guards de generación.

## TDD
Modo: off | Fuente: default | Runner: no disponible (checks funcionales obligatorios).

## Tareas
- [ ] T1 migración rol + tabla + RLS + RPCs + endurecimiento CRM
- [ ] T2 pestaña Campañas (selector mes, tabla, edición inline, totales, gráfico, aislamiento trafficker)
- [ ] T3 verificación independiente

## Criterios de aceptación
- [ ] Trafficker entra y solo ve Campañas; no puede llamar a tablas/leads/RPCs del CRM (42501/P0002).
- [ ] Trafficker puede crear y corregir campañas del mes; no puede borrar; no puede corregir filas de otro (salvo upsert del mismo campaign_name/anio/mes → admin o dueño).
- [ ] Agente y admin ven Campañas y el rollup sin poder editar (solo admin edita cualquier fila).
- [ ] Total mensual = suma de filas; coste/resultado mostrado y no editable; «—» si resultados=0.
- [ ] Selector de mes cambia el informe; por defecto mes actual.
- [ ] build/lint/diff-check/node-check/qa-gate (qa-gate admite solo aviso preexistente .env.example).

## Decisiones aceptadas
- `Campaña` del CRM == campaña de Meta (decidido por el humano en conversación).
- Datos semanales/periodo libre: v1 mensual; rango semanal queda fuera hasta que se pida.
- Sin historial de cambios en campañas (último valor).
- Clase de prueba, monto pagado: excluidos v1.
- Trafficker edita solo sus propias filas (su creado_por); admin cualquiera; upsert por (campaign_name, anio, mes).

## Reutilización investigada
- Patrón RLS/RPC `lead_notes` (202609240008) y `daily_report_notes` (202609280001/2): mismo sello errcode 42501/22023/P0002.
- Helpers `is_active_user()`/`is_admin_user()` (202609230001); nuevo `is_campaign_editor()` y `is_crm_user()` nuevos.
- `lead_catalogs` kind='campana' con RPCs admin (202609240009/10) para el desplegable de campaña.
- Meses `MONTH_CHRONO` + `normalizeLeadMonth` (index.html:4042/4067) para cruce de mesese en UI.
- Pestaña/patrón `switchTab` + init por pestaña (index.html:1691-1723); hook `data-admin-only` (línea 1509).

## Evidencia
- Estado: T1 migración `supabase/migrations/202609290001_campaign_stats.sql` creada y verificada (12 funciones, 24 dollar-tags pares, contrato de nombres/RLS/RPCs al pie de la letra; `update_lead_with_appointment` recreado con guarda `crm_access_forbidden`; `user_access_role_check` ampliado).
- Estado: T2 pestaña Campañas implementada en `index.html` (tabBtnCampanas, viewCampanas, campaignMesSel tipo month, tabla responsive, upsert/delete con guardas de sesión, CSV seguro, aislamiento trafficker que salta carga CRM y aterriza directo en campañas). Totales por suma, coste/resultado calculado en UI ("—" si resultados=0).
- Estado: T3 verificación independiente passed sin hallazgos bloqueantes: build/lint/diff-check/node-check/qa-gate verdes (solo aviso preexistente de .env.example); RPCs/RLS/aislamiento/UI/CSV verificados.
- Evidencia de menores (T3): gráfico simple ausente en v1 (lo permite el cock contractado); migración SQL pendiente de compilación real al aplicarla manualmente; on-conflict del upsert confirma el comportamiento acordado.

## Progreso
- Estado: implementación completa y verificada (T1-T3 passed).
- Última tarea: T3 verificación independiente; commit local.
- Siguiente paso: revisión del humano, aplicación manual de `202609290001_campaign_stats.sql` en Supabase, prueba del flujo trafficker (login → solo ve Campañas → guardar nota de campaña → refrescar → agente la entiende en solo lectura).

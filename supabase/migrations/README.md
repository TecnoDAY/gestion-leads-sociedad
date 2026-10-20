# Migraciones de Supabase

Este directorio es el historico **aplicado**: cada fichero ya se ejecutó en el
proyecto remoto. Reglas para no volver a pisar la base de datos por accidente.

## Reglas

1. **Una version por fichero.** El prefijo antes del primer `_` es la version
   (p.ej. `202610200005`). La CLI de Supabase la usa para saber que migracion
   esta aplicada: **dos ficheros con el mismo prefijo crean orden ambiguo**
   (se aplica el que alphabetically toque primero, no el mas nuevo). Hoy conviven
   dos pares historicos con prefijo repetido (`202610160005` y `202610160006`):
   estan applied y **no se renombran** (renombrar haria que la CLI los viera como
   pendientes); a partir de aqui, todo prefijo es unico.
2. **No se edita una migracion aplicada.** Para cambiar algo se crea una nueva
   (`create or replace function ...`) con la logica corregida. La excepcion son
   las notas de contrato (p.ej. `comment on function`), que si son history-safe.
3. **Una familia de funciones, una sola version vigente.** Cuando una funcion se
   redefine, la copia antigua deja de ser vigente aunque siga en el repo: por
   eso la tabla de abajo dice cual manda (cuerpo identico al remoto).
4. **PII fuera del repo.** Los imports historicos de leads (`202609240005/6/7`,
   `202610050003`) se aplicaron una vez; su payload se sustituyo por una nota
   el 2026-10-19 para que la PII de produccion no siga en el git. Los datos
   viven en `public.leads` y `public.leads_historico`.

## Version vigente por familia

Verificado el 2026-10-19 comparando el cuerpo de cada copia local con el
`prosrc` real del remoto (md5 normalizado: sin comentarios ni espacios).

| Funcion | Copias en el repo | Vigente |
| --- | --- | --- |
| `_create_lead_with_gestion` | 2 | `202610090003_canal_cierre_contable_reporte.sql` |
| `admin_manage_user_access` | 2 | `202610120001_user_access_idle_timeout.sql` |
| `campaign_monthly_rollup` | 2 | `202609300004_campaign_monthly_rollup_year.sql` |
| `create_lead` | 9 | `202610050001_fix_atomic_appointment_creation.sql` |
| `create_lead_appointment` | 6 | `202610020007_appointment_campus.sql` |
| `create_lead_catalog` | 2 | `202609240010_agent_catalog_kind.sql` |
| `create_lead_note` | 2 | `202609290001_campaign_stats.sql` |
| `create_lead_with_appointment` | 4 | `202610050001_fix_atomic_appointment_creation.sql` |
| `daily_management_report` | 15 | `202610200003_daily_report_llamada_whatsapp_grupo.sql` |
| `delete_daily_report_note` | 2 | `202609290001_campaign_stats.sql` |
| `end_agent_session` | 2 | `202610200006_sesiones_usuario_activo.sql` |
| `is_campaign_editor` | 2 | `202609290002_supervisor_role.sql` |
| `is_crm_user` | 2 | `202609290002_supervisor_role.sql` |
| `management_period_summary` | 2 | `202610140001_campaign_period_stats.sql` |
| `record_lead_appointment_event` | 2 | `202610160005_reschedule_any_advisor.sql` |
| `record_lead_gestion` | 4 | `202610020001_canal_datadura_manual_telefono.sql` |
| `rename_lead_catalog` | 2 | `202609240010_agent_catalog_kind.sql` |
| `reschedule_lead_appointment` | 5 | `202610160005_reschedule_any_advisor.sql` |
| `set_lead_appointment_status` | 3 | `202610160006_appointment_team_status.sql` |
| `set_lead_catalog_active` | 2 | `202609240010_agent_catalog_kind.sql` |
| `sync_user_access_email` | 2 | `202609300005_backend_integrity.sql` |
| `touch_agent_session` | 2 | `202610200006_sesiones_usuario_activo.sql` |
| `update_lead_followup` | 7 | `202610020001_canal_datadura_manual_telefono.sql` |
| `update_lead_full` | 6 | `202610010002_campania_nombre_mes.sql` |
| `update_lead_with_appointment` | 5 | `202610020007_appointment_campus.sql` |
| `upsert_campaign_stat` | 2 | `202609290002_supervisor_role.sql` |
| `upsert_daily_report_note` | 3 | `202609300005_backend_integrity.sql` |

## Modelo de negocio documentado en el codigo

- **Citas por equipo (turnos cruzados)**: cualquier usuario CRM activo puede
  registrar el resultado (`ASISTIO` / `NO_ASISTIO` / `CANCELADA`) o reprogramar
  una cita de otra asesora. La autoria la guarda
  `lead_appointment_events.action_user_id/action_name` (el actor), y la ficha
  del lead la muestra. Editar los datos de la cita y eliminarla siguen siendo de
  la asesora asignada o de un admin. Ver `202610200004_ratificacion_modelo_equipo_citas.sql`.

## Hardening reciente

- `20261018120000_security_hardening.sql`: `search_path` fijo en todas las
  `SECURITY DEFINER` y ACL de `user_access`.
- `202610160003/0004_anon_rpc_*.sql`: revokes a `anon`/`public` y grants
  explicitos a `authenticated`/`service_role`.
- `202610200005_endurecimiento_privilegios.sql`: `ALTER DEFAULT PRIVILEGES`
  (toda funcion nueva nace sin `EXECUTE` para `PUBLIC`), helpers internos
  cerrados a `anon`, `anon` sin `SELECT` sobre `leads`/`leads_historico`/
  `user_access` y sin `EXECUTE` en las 4 funciones `returns trigger`.

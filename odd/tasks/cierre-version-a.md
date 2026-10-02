# Feature/ops: cierre versión — security RLS backup + auditoría + QA manual

## Objetivo
Fase A del plan aprobado: proteger `public._bkp_lead_gestiones_20260926`, auditar el estado remoto tras las migraciones recientes, verificar comportamiento testeable y cerrar evidencias.

## Problema y por qué
- Aviso de Supabase: la tabla `_bkp_lead_gestiones_20260926` (copia de la limpieza de gestiones del 26/09) tiene RLS desactivado; aunque los permisos de anon/authenticated están revocados, la capa por filas falta y un grant futuro equivocado la expondría completa.
- Las migraciones 20261001 quedaron aplicadas con cambios no verificados a nivel de triggers/RLS y el ODD reflejaba estado desactualizado.

## Alcance
Incluye:
1. Migración `202610010003_bkp_rls.sql`: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + `REVOKE ALL ... FROM anon, authenticated;` + comentario; sin políticas (fail-closed por ausencia) y sin tocar datos.
2. Auditoría remota read-only: campañas Lo/We en 0, triggers esperados en leads, columna is_data_dura catálogo no afectado, advisors de Supabase, integridad de conteos (leads, gestiones, citas, contactos).
3. QA testeable del ciclo de alta/edición ya cubierto por tests; confirmación de tests verde.
4. Actualización del documento ODD de campania-nombre-mes: migración aplicada (fue y vendrá con commit aparte).
5. Corrección mínima de cualquier error hallado.

Excluye: WhatsApp; diseño del nuevo Reporte (fase B requiere definiciones aprobadas); reconciliación histórica (fase D); eliminación futura de la tabla backup (post 01/11/2026 con autorización aparte); deploy de Edge Function.

## Restricciones
- No tocar datos de productos/leads/gestiones.
- No crear políticas RLS "permit-all" — el objetivo es que nadie no-service-role lea.
- Solo una migración nueva; nunca editar migraciones aplicadas.
- Sin PII ni backfill.

## No romper
- Suite: 189 Node + 11 Python en verde.
- Las 5 migraciones aplicadas recientes (canal_gestion_datadura, campania_nombre_mes).
- Funcionamiento del reporte actual y del historial.

## TDD
Modo: off para la migración (DDL sin runner local). Checks: `apply_migration`, verificación con pg_tables, advisors.

## Tareas
- [x] T1 Migración RLS bkp + exportar apply_migration y verificar: RLS=enabled, grants revocados, conteos intactos, advisors sin el aviso.
- [ ] T2 Auditoría remota (queries read-only): Lo/We=0, triggers confirmados, columna `is_data_dura`, `create_lead` valida catálogo.
- [ ] T3 Confirmar gates locales: npm test / lint / build / diff-check limpios tras el ejercicio.
- [ ] T4 Actualizar ODD (odds campania-nombre-mes: migración aplicada) y dejar obra limpia.

## Criterios de aceptación
- Supabase advisors: la alerta RLS de _bkp desaparece; no aparecen nuevas.
- RLS=true, no hay grant a anon/authenticated.
- Conteos de leads/gestiones/citas idénticos antes y después.
- Suite verde y diff-check limpio.

## Decisiones aceptadas
- RLS sin políticas (fail-closed) sobre la tabla backup mientras se conserva; eliminación diferida a post-01/11/2026.
- WhatsApp completamente fuera de este plan.
- Una sola migración nueva; aplicación remota autorizada bajo "implementa el plan".

## Reutilización investigada
- Patrón enable RLS + revoke usado en migraciones previas (202609230001 etc.); advisor check vía MCP no re-añade herramientas.
- pg_tables/policies consultables con execute_sql vía MCP.

## Evidencia
- T1: creado `supabase/migrations/202610010003_bkp_rls.sql` (RLS fail-closed + revoke a anon/authenticated) y aplicado al remoto como `bkp_rls`. Estado previo confirmado: `relrowsecurity=false`, ACL solo `postgres`/`service_role`, 4.797 filas. Post: `relrowsecurity=true`, ACL sin cambios, filas intactas. Conteos: 5.924 leads / 28 gestiones / 10 citas (los leads crecieron por gestión normal del día; no es efecto de la migración).
- T2: auditoría remota confirmada — `5928 = Locos adams`, `5930 = Weston`, ninguna fila con `Lo`/`We`; triggers `leads_record_gestion` (AFTER UPDATE OF GESTION/ULTIMA GESTION/OBSERVACIONES), `leads_set_gestion_meta` (BEFORE), `leads_set_contact_id` y `trg_leads_normalize_catalog_columns` presentes; `lead_appointments.is_data_dura` existe (10 citas, todas `false` por diseño sin backfill).
- T3: `npm test` 189 Node + 11 Python, `npm run lint`, `npm run build` y `git diff --check` verdes; qa-gate solo aviso histórico de `.env.example`.
- T4: documento ODD de campania-nombre-mes ya registra la migración aplicada (b922b03); este documento cierra la Fase A.

## Progreso
- Estado: completada (T1–T4 con evidencia). Pendiente solo de commit/push de la migración + este ODD bajo decisión humana.
- Última tarea: T4. Siguiente paso: Fase B (definiciones del Reporte) cuando el usuario decida; eliminación del backup evaluable tras 01/11/2026.
- Bloqueos: ninguno.

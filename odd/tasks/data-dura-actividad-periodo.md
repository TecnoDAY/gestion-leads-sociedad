# Feature: consistencia Data Dura (citas) + Actividad del período + diario separado gestión/agenda

## Objetivo
Tres entregas aprobadas por el usuario tras la auditoría de reportes:
1. Corregir y prevenir la inconsistencia `leads.GESTION = Agendado Data Dura` vs `lead_appointments.is_data_dura` en citas PROGRAMADA (1 caso real detectado: cita 17/10 marcada normal).
2. Reporte por período: conservar los 4 cuadros de cohorte (fecha de entrada) y añadir bloque “Actividad realizada en el período” (gestiones del rango + citas por fecha programada), calculado por UNA RPC agregada nueva (sin descargar historial crudo al navegador).
3. Reporte diario: métricas aditivas que separen “Pasados a Agendado (hoy, por gestiones)” de “Citas programadas para hoy (por scheduled_at)”.

## Problema y por qué
- Decisión del usuario: “Ambas, separadas” (gestión hecha vs cita programada) y “Conservar cohorte + añadir actividad”.
- Evidencia auditada (agregada, sin PII): 3 leads activos AGENDADO DATA DURA (1 ago, 2 sep); 6 eventos AGENDADO DATA DURA en oct; citas PROGRAMADA de esos leads: 10/10 dd=true, 13/10 dd=true, 17/10 dd=false (inconsistente); totales actuales PROGRAMADA dd=2/normal=6 → tras corrección dd=3/normal=5. Realtime solo publica `leads` (sin lead_gestiones/lead_appointments confirmado), por lo que cambios entre sesiones en actividad se reflejan al Actualizar/reentrar (documentado).

## Alcance
Incluye:
1. Migración `202610090001_data_dura_appointment_sync.sql`:
   - Trigger AFTER UPDATE OF "GESTION" en `leads`: si OLD y NEW empiezan por AGENDAD% y cambia la clasificación Data Dura (normalizar DATADURA y DATA DURA), actualiza `lead_appointments.is_data_dura` de citas con status='PROGRAMADA' del lead. Solo eso.
   - Corrección guardada idempotente: cuenta discrepancias esperadas (esperado: 1 a true, 0 a false), aplica UPDATE y aborta con excepción si antes/después no coinciden.
   - RPC nueva `management_period_summary(p_desde date, p_hasta date) returns jsonb` stable security definer, is_active_user+is_crm_user, revoke/​grant como el diario; rango validado (period_range_required/invalid); solo conteos agregados.
   - Ampliación ADITIVA de `daily_management_report` (misma firma, mismas claves existentes, añade en `citas`: `agendados_gestionados_dia`, `agendados_gestionados_data_dura` = leads distintos con gestion_nueva AGENDADO / AGENDADO%DATA%DURA ese día).
2. Frontend período (`index.html`): bloque “Actividad realizada en el período” con gestiones/canales/citas; carga tras la cohorte con guarda generación+rango propia; fallo de actividad NO borra los 4 cuadros (error local); CSV añade secciones Cohorte/Actividad/Agenda y solo exporta cuando actividad cargó; auto-recarga de actividad en las mutaciones ya cubiertas por `markPeriodoReportDirty` (debounce existente) entrando vía loadReportePeriodo; cross-sesión: reentrar o Actualizar (texto informativo con hora de generación).
3. Frontend diario: etiquetas explícitas “Pasados a Agendado hoy”, “Pasados a Agendado Data Dura hoy”, “Citas normales programadas hoy”, “Citas Data Dura programadas hoy”; CSV diario con 2 columnas nuevas.
4. Tests: patrones SQL de la migración (trigger limitado a PROGRAMADA, guardas, permisos), VM del bloque actividad (render, fallo aislado, CSV bloqueado hasta actividad, respuesta obsoleta por rango), filas/CSV diario nuevas; suite íntegra verde.

Excluye: polling, ampliar Realtime, tablas nuevas, backfill histórico de citas cerradas, cambiar significado de las claves existentes del diario, mezclar leads DD antiguos en la cohorte.

## Restricciones
- No modificar citas con estado distinto de PROGRAMADA.
- Migración aborta si el estado remoto no coincide con lo esperado (no corregir a ciegas).
- RPCs solo conteos; jamás nombres/teléfonos/notas en respuesta ni logs.
- Cohorte: sigue `buildPeriodSummary` sin cambios de semántica; lead único por id; totales = 4 secciones.
- Actividad gestiones: leads únicos por estado (distinct lead_id por gestion_nueva) + total de eventos aparte.
- Canales: prioridad marca manual is_data_dura; NULL históricos con la regla mes/fecha del diario (reutilizar la lógica de `_daily_report_data_dura` con la fecha del rango).
- Diario: extensión aditiva; no renombrar claves RPC (solo etiquetas UI).

## No romper
- 234 Node + 11 Python verde hoy; lint; build; diff --check.
- Cohorte/período y sus tests; auto-refresh por revisión (T7) intacto.
- `create_lead*`/`update_lead*` y triggers existentes: el trigger nuevo solo añade sincronía, convive con los actuales.
- CSV diario existente + 2 columnas al final.

## TDD
Modo: off (default). Checks funcionales obligatorios; fixtures sintéticos sin PII.

## Tareas
- [x] T1 Migración SQL (trigger + corrección guardada + RPC actividad + extensión RPC diario): `202610090001_data_dura_appointment_sync.sql`, verificada con test de patrones SQL.
- [x] T2 Frontend período: bloque Actividad (carga, error aislado, CSV seccionado y bloqueado sin actividad, hook a debounce existente).
- [x] T3 Frontend diario: etiquetas gestión vs agenda + 2 columnas CSV.
- [x] T4 Tests íntegros + lint + build + diff-check: **235 Node pass / 0 fail + 11 Python OK**; lint y build OK.
- [x] T5 Aplicación remota guardada (2026-10-08, supabase MCP): pre-flight confirmó versión previa sin claves nuevas y exactamente 1 discrepancia; `apply_migration` en 2 partes OK; verificación post: discrepancias dd=0/0, trigger registrado en `leads`, `daily_management_report` extendida, `management_period_summary(date,date)` registrada y con barrera `crm_access_forbidden` sin sesión (comportamiento esperado desde MCP), entradas en `supabase_migrations.schema_migrations` 20261008184939 y 20261008185215.

## Criterios de aceptación
- Normal→DD y DD→normal actualizan citas PROGRAMADA; resto de estados/citas intactos; un solo caso pendiente corregido.
- Período: cohorte intacta + actividad visibles a la vez; fallo RPC no tumba cohorte; CSV nunca sin actividad; cambio de rango invalida ambos.
- Diario: muestra ambas métricas separadas sin romper las actuales (todas las claves viejas intactas).
- Post-remoto: discrepancias agendado/cita = 0; conteos verificados; gestiones DD de octubre (6) presentes en actividad.

## Decisiones aceptadas
- Dos conceptos separados: gestión realizada (fecha_gestion) vs cita programada (scheduled_at). Confirmado por el usuario.
- Actividad vía RPC agregada (no descarga cruda al cliente), confirmado vs alternativa de fetch+paginación.
- Cross-sesión sin Realtime para gestiones/citas: Actualizar/reentrar (Realtime no publica esas tablas; verificado).
- Reconciliación guardada exacta al hallazgo (1 esperada).

## Evidencia
- Auditoría 2026-10-08 (solo conteos/categorías, sin PII): gestiones oct total 327; llamadas dd 30, normales 79, L+WA 84; inscritos eventos 4; eventos AGENDADO DATA DURA 6. Citas oct: programadas 7 (dd 2), asistieron 5, no_asistio 1. Leads actuales: agendados 237, dd 3, inscritos 179, inscritos dd 0. Discrepancia real: 1 cita PROGRAMADA dd=false con lead DD (17/10); inversa 0.
- Realtime: pg_publication_tables vacío → solo leads publicado… (lista vacía incluye leads? NO: la consulta filtró 3 tablas y devolvió vacío → leads tampoco publicado en esta consulta; pendiente reinterpretación — el front sí subscriba leads con éxito en producción; registrar duda menor, sin impacto en diseño: plan no depende de Realtime).

## Progreso
- Estado: T1–T5 completadas y verificadas. La app ya tiene el código local (sin commitear/pushear — pendiente de petición explícita).
- Evidencia remota post-fix: citas de leads activos PROGRAMADA: dd=3, normal=6 (la cita del 17/10 pasó a dd; el conteo global cambió además por citas nuevas creadas por usuarios entre medias — consistente con uso en vivo). Cero discrepancias restantes agendado↔is_data_dura.
- Siguiente: revisión visual en navegador (período: cohorte + Actividad; diario: nuevas filas) y, si el humano lo pide, commit/push del código local.

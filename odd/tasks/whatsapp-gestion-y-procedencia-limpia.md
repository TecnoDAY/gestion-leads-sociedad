# Feature: WhatsApp gestión (nuevos vs gestionados) + canal inicial + Procedencia limpia

## Objetivo
- Reporte diario: cuadro nuevo **WhatsApp** con `nuevos hoy` (gestión inicial), `gestionados hoy` (seguimiento) y `total`.
- Nuevo Lead: campo **Tipo de gestión inicial** (canal real de atención); preselección WhatsApp si Medio es Whatsapp/WhatsApp Nuevo; editable.
- Procedencia en pantalla: ocultar filas **CogniTalking** y **Otros** (poco uso; 3 y 2 gestiones históricas), mantenidas en CSV y total para no romper el cuadre.
- Sin tabla nueva; solo extensión aditiva RPC diaria + formulario + UI + CSV.

## Reglas acordadas
- Procedencia = origen del lead (`Medio`); NO cambia cuando se atiende por otro canal.
- Canal de gestión = `lead_gestiones.canal` (de `ULTIMA GESTION` en create/update); fecha del evento en servidor (Miami).
- `gestion_anterior IS NULL` → nueva; `IS NOT NULL` → seguimiento.
- `Llamada y WhatsApp` sigue como categoría propia (no duplica).

## Tareas
- [x] T1 Migración `202610090002_whatsapp_gestion_report.sql` (extensión aditiva de `daily_management_report`: `gestion_anterior` en gest, contadores `wa_nuevos`/`wa_gestionados`, bloque `whatsapp {nuevos, gestionados, total}`).
- [x] T2 Frontend: select `newUltimaGestion` en Nuevo Lead + `syncNewUltimaGestion()` (preselección WhatsApp si Medio whatsapp*) + payload `ULTIMA GESTION`.
- [x] T3 UI diario: cuadro WhatsApp (3 filas), Procedencia sin CogniTalking/Otros (CSV conserva ambas columnas).
- [x] T4 CSV diario: +3 columnas (WhatsApp nuevos hoy, gestionados hoy, Total WhatsApp) → 32 cabeceras/29 numéricas.
- [x] T5 Tests: fixture `whatsapp` en CSV test (29 numéricas × 32 cabeceras), preselección/sync, patrones SQL, ausencia de CogniTalking en pantalla. Suite 236 Node + 11 Python OK; lint, build, diff-check OK.
- [x] T6 Fix preexistente detectado por lint: `finally` mal anidado en `deleteLeadAppointment` (corrección de 1 carácter: cierre de `catch` antes de `finally`).
- [x] T7 Remoto: `apply_migration whatsapp_gestion_report_diario` OK; verificación: definición contiene `wa_nuevos`+`gestion_anterior`; barrera `crm_access_forbidden` activa sin sesión.

## No romper
- RPC diaria: mismas claves previas (procedencia/llamadas/citas/inscritos/gestionados intactos).
- `Llamada y WhatsApp` no se duplica en Llamadas ni WhatsApp.
- Reporte por período y su bloque Actividad sin cambios.
- CSV anterior + 3 columnas al final (antes de Problemas/Observaciones).

## Evidencia
- npm test: 236 pass / 0 fail; Python 11/11.
- lint (`check-app`) OK, build OK, `git diff --check` limpio.
- Remoto: migración aplicada; RPC con bloque whatsapp; 42501 sin sesión (esperado).

## Ampliación aprobada (contabilidad cerrada) — 202610090003
Captura del usuario: Procedencia 45 ≠ Llamadas 17 + WhatsApp 22. Causa real: 2 gestiones por Instagram no mostradas + 4 iniciales WhatsApp con canal NULL (create_lead no enviaba `ULTIMA GESTION`; 65 históricos 02–08 oct). Y el encabezado por asesora mostraba "0 leads" (clave rota).

- [x] Migración `202610090003_canal_cierre_contable_reporte.sql`:
  - Reconciliación guardada: solo iniciales (gestion_anterior IS NULL) sin canal con Medio WhatsApp* → canal 'WhatsApp'; aborta si remanente ≠ 0. Remoto: aplicada, pendientes=0.
  - Fallback en `_create_lead_with_gestion`: canal vacío + Medio WhatsApp* → 'WhatsApp' (navegadores antiguos).
  - RPC diaria aditiva: bloque `canales` excluyente (llamada, data_dura, llamada_whatsapp, whatsapp, instagram, visita, sin_clasificar, total). Contrato viejo intacto.
- [x] UI diario: cuadro **Canales** (7 categorías + Total) + **Detalle WhatsApp** (nuevos/gestionados/total); KPI renombrado "Gestiones realizadas"; encabezado de asesora usa total del bloque (`pt`) con palabra "gestiones".
- [x] CSV: "Gestiones realizadas" + 4 columnas nuevas (Canal Instagram, Canal Visita Conservatorio, Sin clasificar, Total canales) → 36 cabeceras / 33 numéricas.
- [x] Tests: 237 Node pass / 0 fail; 11 Python; lint, build, diff-check OK.
- [x] Verificación remota: 0 gestiones sin clasificar en octubre; fallback presente; RPC con bloque canales.

## Regla de contabilidad vigente
Total Procedencia = Total Canales = Gestiones realizadas (cada evento cuenta 1 vez en cada distribución). Citas e inscripciones son resultados, no canales.

## Progreso
- Estado: implementado y aplicado en remoto. Pendiente verificación visual por el humano en el panel.

## Reconciliación frontend 2026-10-08
- Problema observado: backend/migraciones y tests conservaban los contratos aprobados, pero `index.html` había perdido actividad del período, canal inicial, cuadros Canales/Detalle WhatsApp y columnas CSV; esto produjo 7 fallos directos y 79 fallos en cascada del arnés por `loadPeriodoActividad` ausente.
- Base reversible: `/tmp/opencode/gestion-leads-pre-reconcile.patch`.
- [x] R1 Restaurado estado, carga, validación, render y CSV de Actividad del período con guardas de sesión/rango/generación.
- [x] R2 Restaurado Tipo de gestión inicial, preselección WhatsApp y payload `ULTIMA GESTION`.
- [x] R3 Restaurados Canales, Detalle WhatsApp, Gestiones realizadas, conteo correcto por asesora y CSV 36/33.
- [x] R4 Corregida una expectativa inconsistente del fixture: declaraba `gestionados: 1` pero esperaba 5 por sumar procedencias sintéticas; el encabezado usa la métrica canónica `b.gestionados`.
- Evidencia: focalizados 99/99 y session-isolation 79/79; suite completa 237/237 Node + 11/11 Python; lint, build y `git diff --check` OK.
- QA strict: no pudo aprobar por `.env.example` sensible ya rastreado y sin cambios staged; no se detectaron hallazgos nuevos de fiabilidad (los `waitForQuery` son sincronización explícita del arnés; `Date.now()` pertenece al control de inactividad preexistente).

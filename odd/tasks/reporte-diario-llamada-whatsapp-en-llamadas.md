# Llamada WhatsApp dentro del bloque de llamadas (reporte diario)

## Aplicacion remota 003 autorizada — 2026-10-19T22:34:17Z
- Autorizacion explicita del usuario: "Sí, aplica la migración y reconstruye el bundle". Sustituye la prohibicion remota previa SOLO para `supabase/migrations/202610200003_daily_report_llamada_whatsapp_grupo.sql`. No otras migraciones, DML de datos de usuario, commit/push ni subdelegacion.
- Preflight (solo lectura): cuerpo remoto normalizado (md5 sin comentarios ni espacios) `ef3de1a6e4e9019d6bf2667a073dcbbd` = cuerpo local de 009 `ef3de1a6e4e9019d6bf2667a073dcbbd` -> sin drift (el remoto no conserva comentarios; 214 chars de diferencia solo por comentarios/espacios). SECURITY DEFINER=true, search_path=public, owner postgres, ACL `{postgres,authenticated,service_role}` con anon=false. Recuentos: leads 6314, lead_gestiones 1468, lead_appointments 50, user_access 5.
- Aplicacion: `apply_migration(name=202610200003_daily_report_llamada_whatsapp_grupo, query=contenido exacto del archivo)` -> `success:true`; `list_migrations` confirma version **20261019223417** (ultima de 55). El SQL se sirvio por HTTP loopback en 127.0.0.1 (solo ese fichero, sin credenciales) y se paso byte-exacto; servidor cerrado despues.
- Postflight: `md5(prosrc sin saltos de linea) = 90a7f9825e9b57b2ea71b37f27a5df8e` = md5 del cuerpo local **exactamente igual**; md5 normalizado `997664d26a3df1ac04f8329a8d36a650` identico al local. SECURITY DEFINER, search_path=public, owner postgres y ACL sin cambios (anon:false, authenticated/postgres/service_role:true). Recuentos de datos identicos antes/despues: 6314/1468/50/5 (sin DML). Comentario de la funcion actualizado. Reversible restaurando el cuerpo anterior mediante migracion compensatoria; no se ejecuto rollback.
- Verificacion funcional con el SQL real del remoto (CTEs + JSON extraidos de `prosrc`, sin llamar a la RPC autenticada): 2026-10-19 -> 5 bloques, 88 gestiones, WhatsApp 28 (11 nuevos + 17 gestionados), llamadas 60 (0 + 60), combinada 16, canales 88; 2026-10-15 -> 167 gestiones, WhatsApp 83 (34 + 49), llamadas 84 (0 + 84), combinada 8, canales 167. Invariantes por bloque (nuevos+gestionados=total en ambos grupos, WhatsApp+llamadas=gestionados=canales.total) **true** en los 10 bloques de las 2 fechas. Coincide exactamente con la vista previa previa a la migracion.
- La guardia de la RPC sigue activa: `select public.daily_management_report('2026-10-19', null)` sin sesion CRM devuelve `42501 crm_access_forbidden` (no se suplantaron identidades).
- Limites: sin smoke HTTP/RPC autenticado ni navegador en sesion del usuario (no hay sesion autorizada disponible); la verificacion es SQL real de solo lectura sobre los CTE/JSON de la funcion, no un recorrido autenticado. Sin commit/push ni despliegue del frontend.

## Objetivo
La opcion de ultima gestion "Llamada WhatsApp" (canal almacenado `llamada y whatsapp`) debe sumar en el grupo de **llamadas** del reporte diario, no en el grupo de WhatsApp. El bloque de llamadas muestra las tres categorias juntas (Llamadas del dia, Llamadas Data Dura, Llamada WhatsApp) y el total debajo.

## Problema y por que
El equipo no ve el total real de llamadas: la llamada combinada vive en el grupo de WhatsApp y el KPI "Total llamadas" la excluia. El 2026-10-19 ya se alineo el KPI con el detalle excluyendo la combinada, pero la combinacion sigue clasificada en WhatsApp, que es la excepcion que el equipo quiere corregir. Sin separar el canal no se puede mostrar "llamada + data dura + llamada whatsapp" y su total sin duplicar.

## Alcance
Incluye:
- RPC `public.daily_management_report`: la llamada combinada pasa al grupo de llamadas (nuevos, gestionados y total).
- Frontend `src/legacy/reportes.js`: helper de detalle, KPI "Total llamadas", columna CSV "Total llamadas" y detalle por asesora.
- Ayuda (`src/legacy/help.js`) y pruebas.

Excluye:
- Formularios y opciones de ultima gestion (el canal sigue siendo el mismo).
- Reporte de periodo, KPIs de campanas y demas consumidores de `canales`.
- Datos historicos almacenados.
- Aplicacion remota de la migracion, commit, push y deploy (requieren autorizacion aparte).

## Restricciones
- No tocar migraciones ya aplicadas (005 a 009): la nueva copia el cuerpo vigente.
- No cambiar el contrato JSON: solo cambian los valores de `whatsapp.*` y `llamadas.*`.
- La particion de canales (`canales.*`) y su `total` no cambian.
- El CSV diario conserva sus 36 columnas y su cabecera.

## No romper
- Invariante por bloque: `whatsapp.total + llamadas.total_gestion = gestured = canales.total`.
- `llamadas.nuevos + llamadas.gestionados = llamadas.total_gestion`.
- `canales` sigue siendo una particion excluyente (un evento, un canal).
- Procedencia, citas, inscripciones, filtros de asesora/fecha y permisos intactos.
- `totalCanalesVisibles` (Total canales) no cambia.
- Tests existentes siguen pasando salvo los que fijan la semantica antigua de la combinada.

## TDD
- Modo: off
- Fuente: default
- Runner: `npm test`; focalizado `node --test scripts/tests/daily-report-arrival-sql.test.mjs` y `node --test scripts/tests/reporte-diario-detalle.test.mjs`.

## Tareas
- [x] T1 Inspeccionar canonica (RPC 009 + `src/legacy/reportes.js`) y/tests afectados.
- [x] T2 Migracion local nueva con la llamada combinada en el grupo de llamadas.
- [x] T3 Frontend: helper de detalle, KPI, columna CSV y detalle por asesora.
- [x] T4 Ayuda: "Llamada WhatsApp" suma en el bloque de llamadas.
- [x] T5 Pruebas: suite SQL (SQLite) con la nueva migracion y cobertura frontend de la nueva agrupacion.
- [x] T6 Suite completa, lint y QA; evidencia y limites.
- [x] T7 Revision independiente del diff (riesgo de contrato y datos).

## Criterios de aceptacion
- [x] "Llamada WhatsApp" no suma en WhatsApp nuevos/gestionados/total.
- [x] "Llamada WhatsApp" suma en el grupo de llamadas (nuevos, gestionados y total).
- [x] Pantalla: detalle por asesora con Llamadas del dia, Llamadas Data Dura, Llamada WhatsApp y Total llamadas debajo.
- [x] KPI "Total llamadas" y columna CSV "Total llamadas" = del_dia + data_dura + llamada_whatsapp.
- [x] CSV "Total WhatsApp" = whatsapp + instagram + otros; "Total llamadas de gestion" = total de llamadas.
- [x] Todo lo demas de WhatsApp igual (nuevos, gestionados, Instagram, otros).
- [x] `whatsapp.total + llamadas.total_gestion = gestured = canales.total` por bloque.
- [x] Sin cambios en formularios, opciones de canal ni datos historicos.
- [x] `npm test` y `npm run lint` en verde.
- [x] `gestionadosHoy` renombrado a `totalGrupoWhatsapp`: el nombre anterior quedaba engañoso tras el cambio de grupo.

## Decisiones aceptadas
- La clasificacion por canal no cambia: `canales.llamada_whatsapp` sigue siendo el bucket propio. Lo que cambia es a que grupo (WhatsApp o llamadas) pertenece cada evento para el desglose de nuevos/gestionados y el total.
- El grupo de llamadas queda compuesto por `llamada`, `data_dura` y `llamada_whatsapp`; el de WhatsApp por `whatsapp`, `instagram`, `visita` y `sin_clasificar`. Ambos particionan el dia.
- `llamadas.total` legado ya incluia la combinada: se conserva. Se corrigen `llamadas.gestionados` y `llamadas.total_gestion` para que incluyan la combinada y cuadren con `nuevos`.
- La columna CSV "Llamada WhatsApp" ya existia: no se anaden columnas ni se renombra ninguna.

## Reutilizacion investigada
- Canonica SQL: `supabase/migrations/202610160009_appointment_results_actor.sql` (cuerpo vigente de la RPC). La nueva migracion parte de ese cuerpo y solo altera los predicados de `llam_nuevos`, `wa_nuevos`, `wa_gestionados` y las dos sumas de `llamadas`.
- Canonica frontend: `detalleGestionHoy(b, grupo)` ya parametriza los buckets por grupo; el cambio es el contenido de `keys` por grupo. `totalDiario` y `diarioCsvLines` ya suman los mismos contadores, asi que no hay un segundo calculo que mantener.
- Harness SQL reutilizado: `scripts/tests/test_daily_report_whatsapp.py` (adaptador SQLite) y `scripts/tests/test_daily_report_arrival.py` (suite de particiones), que ejecutan el SQL real de la migracion, no una reimplementacion en JS.
- Sin dependencia nueva, sin tabla nueva, sin endpoint nuevo.

## Revision independiente (T7)
Veredicto: PASS CON OBSERVACIONES. Confirmado: la 003 solo cambia los 4 puntos previstos (mismas 38 claves JSON, misma guarda, mismos permisos/revoke-grant, search_path y security definer intactos); SQL y frontend clasifican los canales igual; ningun consumidor de produccion conserva la semantica antigua; invariante whatsapp + llamadas = gestured = canales.total comprobada en SQL, pantalla y CSV; CSV con 36 columnas y cabecera intacta; la cobertura es real (revertir el agrupamiento rompe las pruebas, no solo调整 expectativas).

Observaciones atendidas:
- `gestionadosHoy` (nombre engañoso tras el cambio) renombrado a `totalGrupoWhatsapp` y actualizados sus usos en tests.
- `scripts/tests/test_daily_report_whatsapp.py` documenta que es la suite historica de la migracion 006 (no la vigente) para que nadie la reoriente por error.

Observaciones informativas (no tocadas, fuera de alcance):
- `opencode.json.bak` sin trackear en la raiz: `.gitignore` cubre `opencode.json` pero no `*.bak`; conviene ignorarlo o borrarlo (no es parte de este cambio).
- Las columnas CSV "Total llamadas" y "Total llamadas de gestion" coinciden en valor; se conserva la cabecera por contrato con el equipo.
- `dist/` (ignorado por git) se reconstruyo con el bundle nuevo; hay que reconstruir antes de publicar.

## Evidencia
- T1 passed: lectura de `src/legacy/reportes.js` (helper, KPI, CSV, detalle) y de la RPC vigente en `supabase/migrations/202610160009_appointment_results_actor.sql`.
- T2 passed: `supabase/migrations/202610200003_daily_report_llamada_whatsapp_grupo.sql` creada con el cuerpo vigente y los cuatro cambios de predicado/suma; `diff` contra 009 muestra solo esos cambios (mas el comentario de cabecera y el `comment on function`).
- T3 passed: helper, KPI, CSV y detalle actualizados; pruebas frontend en verde.
- T4 passed: `src/legacy/help.js` actualizado y verificado por `scripts/tests/t5-frontend-edge.test.mjs`.
- T5 passed: suite SQL (SQLite) con la migracion nueva (6 tests, incluido `test_combined_channel_belongs_to_calls_and_not_to_whatsapp`) y cobertura frontend de la agrupacion en 5 ficheros.
- T6 passed: `npm test` -> 714 Node + 11 Python, 0 fallos; `npm run lint` (tsc + check-app) OK; `npm run build` OK; `git diff --check` limpio; `bash ~/.config/opencode/scripts/qa-gate.sh --strict` exit 0 (sin staged: solo rastreadas, no audita los ficheros nuevos).
- T7 passed: revision independiente del diff (verificador read-only), veredicto PASS CON OBSERVACIONES, observaciones atendidas.
- Vista previa con datos reales (SELECT read-only al remoto, sin aplicar la migracion): 2026-10-19 -> 88 gestos, llamadas 40 del dia + 4 data dura + 16 llamada WhatsApp = 60, grupo WhatsApp 28 (11 nuevos / 17 gestionados); 2026-10-15 -> 167 gestos, llamadas 36 + 40 + 8 = 84, grupo WhatsApp 83 (34 / 49). En ambos dias llamadas + WhatsApp = gestos.

## Progreso
- Estado: implementado, verificado LOCAL y **migracion 003 APLICADA en remoto** (version 20261019223417) con verificacion funcional. Bundle reconstruido en `dist/` (ignorado por git).
- Siguiente paso: publicar el frontend (bundle) para que la pantalla y el CSV usen el nuevo agrupamiento; no se ha desplegado.
- Sin commit ni push.
- ORDEN DE DESPLIEGUE (obligatorio): migracion y bundle salen juntos, migracion primero.
  - Frontend antes que la migracion: la RPC vieja mete la combinada en `whatsapp.nuevos` y el grupo WhatsApp nuevo la excluye del total -> "nuevos" puede superar el total (panel con aviso y CSV bloqueado) y los nuevos de la combinada aparecen como gestionados en llamadas.
  - Migracion antes que el frontend: el frontend viejo suma la combinada en el grupo WhatsApp -> "WhatsApp gestionados" inflado y el KPI de llamadas sin la combinada.
  - Ventana segura: migracion aplicada + bundle reconstruido y publicado.

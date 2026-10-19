# Detalle de gestion del reporte diario

## Aplicacion remota 008 autorizada — 2026-10-16T20:02:50Z
- Autorizacion posterior explicita del usuario «aplica la migracion a ver como se ve en local», limitada por el padre a SOLO `supabase/migrations/202610160008_daily_report_event_new.sql`; revision independiente PASS informada por el padre. Sustituye la prohibicion remota de T17-T19 exclusivamente para 008. No otras migraciones, DML usuario, frontend deploy, commit/push ni subdelegacion.
- Proyecto `hkkuyomlcqyxtzblowle`; herramientas MCP `list_migrations`, `list_tables(public, verbose=true)`, `execute_sql` SELECT, `apply_migration`, `get_project_url`. Preflight 20:01:42Z: ultima 007 version `20261016194251`; `pg_get_functiondef`/MD5 prosrc `aed441afb09206394484f3306fb253a7` igual al archivo 007, sin drift. Avisada reversibilidad mediante compensatoria que restaure 007; no se ejecuto rollback.
- Unico `apply_migration(name=202610160008_daily_report_event_new, query=contenido del archivo)` resultado `success:true`; `list_migrations` confirma **20261016200241**. Postflight: MD5 prosrc **4d6e7d450194d0af5305ae5c73159a86**, igualdad exacta con cuerpo local=true, comentario coincide. Owner postgres, SECURITY DEFINER, search_path=public y ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` identicos antes/despues; sin PUBLIC/anon. Cuerpo exacto conserva guardias, DD legado y contrato JSON; no cambios de politicas/tablas.
- Recuentos exactos antes/despues: leads **6253/6253**, gestiones **1228/1228**, citas **46/46**, eventos citas **63/63**, notas reporte **1/1**. Sin DML ni alteracion observada de recuentos.
- PostgreSQL real SELECT directo de clasificacion por asesora/fecha Miami calculada con `now() AT TIME ZONE 'America/New_York'`: **2026-10-16**, Jessica **47** eventos, WA **22 nuevos / 11 gestionados / 33 total**, llamadas **0 nuevas / 14 gestionadas / 14 total**. Coincide con muestra anterior; no se hardcodearon cifras.
- Segundo SELECT ejecuta CTE/JSON completo extraido del archivo 008 cuyo cuerpo coincide exactamente con remoto, reemplazando solo parametros por fecha Miami actual y UUID NULL; no ejecuta ni omite guardias dentro de una llamada RPC ni suplanta identidades. Resultado **5 bloques**, total.gestionados **47**: Jessica WA 22/11/33, llamadas 0/14/14, normales **10**, DD **4**, combinado **8**; llamadas.total legado **22 = 14 + 8**. Ana/Loli/Miguel/Tecnologia todos 0. Suma exclusiva WA+llamadas=47. Extraccion servida temporalmente por HTTP loopback limitado al SQL 008 y servidor cerrado al terminar; sin credenciales.
- Limite: no HTTP/RPC autenticada ni navegador en sesion del usuario disponible; no se leyeron secretos ni se gestionaron identidades. El SELECT verifica agregacion y JSON PostgreSQL real, no transporte HTTP ni recorrido autenticado completo. API confirmada `https://hkkuyomlcqyxtzblowle.supabase.co`. Sin frontend deploy. Estado: 008 aplicada y verificada dentro de estos limites; parrafos previos de no aplicacion se conservan como historial.

## Decision FINAL vigente T17-T19 — 2026-10-16
- Alcance aprobado: exclusivamente LOCAL, sin subdelegar, commit/push/deploy ni escrituras remotas. Esta decision sustituye todas las reglas de llegada de T14-T16; aquellas quedan como historial.
- Regla: `g.fecha_gestion = p_fecha`; `es_nuevo = g.gestion_anterior IS NULL` SOLO. Alta atrasada llegada ayer registrada hoy es nueva hoy. Seguimiento del mismo dia y previo vacio no NULL son gestionados. Identidad del autor del evento, no del propietario del lead.
- [x] T17 Nueva `202610160008_daily_report_event_new.sql`, sin editar 007 aplicada. Retirados los tres CTE de parseo de llegada y su JOIN; se conserva Fecha/Mes para `_daily_report_data_dura` legado. Bloques/JSON/canales/citas/ACL intactos.
- [x] T18 Ayuda y tests actualizados; sin modificar calculos UI/CSV ni presentacion existente de tres filas WA y tres llamadas. WA puro/combinado/Instagram/residual incluida visita; llamadas normal/DD, combinado solo WA en detalle. `llamadas.total` legado sigue incluyendo combinado por compatibilidad.
- [x] T19 `npm test`: 661/661 Node (incluye 5 SQL Python actuales y suite SQL historica), 11/11 Python adicionales. `npm run lint`: tsc/check-app OK. `git diff --check` y whitespace de 008 OK. QA gate sin hallazgos en rutas rastreadas, staged no aplicable; no audita archivos nuevos ni sustituye revision independiente. Log efimero `/tmp/opencode/daily-event-tests.log`. Autoauditoria de codigo realizada; pruebas deterministas sin reloj/red/mocks nuevos. Entrega al padre para revision independiente.
- Incidencias locales corregidas antes de cierre: sustitucion mecanica inicial no encontro el predicado por indentacion (tests SQL lo detectaron); luego asercion textual detecto `created_at` solo en comentario, retirado del comentario. Suite final completa PASS; sin ajustes al comportamiento para sortear pruebas.
- Contraste remoto SOLO SELECT metadatos: MD5 cuerpo `aed441afb09206394484f3306fb253a7`, coincide con 007 aplicada version `20261016194251`; SECURITY DEFINER, search_path=public, guardias activo/campaign editor presentes; ACL postgres/authenticated/service_role, sin PUBLIC/anon. Ninguna escritura ni lectura de credenciales.
- Pruebas reutilizan CTE/JSON real en SQLite: altas atrasadas y fechas ausentes/invalidas/futuras nuevas en WA y llamadas; seguimiento mismo dia; DD true/false/null/literal; previo vacio; canales exhaustivos sin duplicacion; autor/fecha/sin ID; created_at contradictorio y fronteras Miami de citas. Ejemplo observado 22/11/33 WA y 0/14 llamadas no hardcodeado.
- Limites: no PostgreSQL local ni compilacion PL/pgSQL, HTTP autenticado o navegador real. Revision independiente pendiente del padre; 008 NO aplicada y remoto sigue regla 007 hasta autorizacion separada.

## Aplicacion remota 007 - 2026-10-16
- Autorizacion posterior explicita: usuario «si autorizo para verlo como quedo». Sustituye exclusivamente la prohibicion remota anterior para aplicar 007; no autoriza datos, otras migraciones, commit/push ni deploy frontend.
- Proyecto: `hkkuyomlcqyxtzblowle`. Herramientas MCP Supabase `list_migrations`, `list_tables(public, verbose=true)`, `execute_sql` SELECT y `apply_migration`.
- Preflight: ultima version `20261016182810`, migracion 006. `md5(pg_proc.prosrc)` remoto = local 006 `e103c602f8a068067f7a81255610f541`; sin drift. ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, SECURITY DEFINER, owner postgres, search_path=public.
- Aplicada SOLO `supabase/migrations/202610160007_daily_report_arrival_partitions.sql` mediante `apply_migration(name=202610160007_daily_report_arrival_partitions, query=contenido exacto del archivo)`; resultado `success:true`. Version registrada `20261016194251`. Reversible restaurando 006 mediante compensatoria autorizada; no se ejecuto rollback.
- Postflight: cuerpo exacto local/remoto MD5 `aed441afb09206394484f3306fb253a7`; comentario coincide; ACL, owner, SECURITY DEFINER y search_path sin cambios, sin EXECUTE PUBLIC/anon. No politicas/tablas alteradas.
- Recuentos exactos antes/despues: leads 6253/6253, lead_gestiones 1228/1228, lead_appointments 46/46, user_access 5/5. Sin DML de usuario.
- PostgreSQL real: SELECT CTE extraido literalmente de 007, sustituyendo solo parametros, sin suplantacion JWT/usuario. Las 20 fechas con gestiones (2026-02-05 a 2026-10-16) pasan por asesora `gestionados = llamadas_total_gestion + wa_nuevos + wa_gestionados` y `llamadas_nuevos <= llamadas_total_gestion`.
- 2026-10-16: 5 asesoras, 47 gestionados, llamadas total_gestion 14/nuevos 0; combinado 8; WA nuevos 18/gestionados 15. SELECT JSON completo extraido: 5 asesoras, total.gestionados=47 y contrato legado llamadas.total=total_gestion+combinado PASS.
- Parser PostgreSQL con 12 fixtures VALUES, sin insertar: 3 formatos del dia aceptados, 6 invalidos/null rechazados sin excepcion (incluidos febrero imposible, mes 13, ano desbordado y 2100 no bisiesto), bisiesto 2000 valido; anterior/futura no son el dia.
- Incidencias de verificacion sin escrituras: reconstruccion inicial del SQL no coincidio con MD5 y se detuvo ANTES de apply; se cargo luego archivo exacto por HTTP loopback temporal. Un SELECT de comprobacion JSON tuvo delimitador de extraccion incorrecto (42601); corregido solo el SELECT, PASS. No se modifico la migracion ni la RPC para solventarlo.
- Limite: no smoke HTTP autenticado ni comprobacion visual en sesion del usuario, por no disponer de sesion autenticada autorizada; no se leyeron credenciales. La prueba ejecuta SQL agregado/JSON real, no la barrera de autenticacion de la RPC. No frontend deploy, commit/push ni subdelegacion.

## Objetivo
Decision FINAL T17-T19: fecha_gestion decide el dia; solo gestion_anterior NULL decide nuevo, sin Fecha llegada ni created_at. Particiones N/G/T para WhatsApp ampliado y llamadas normales/DD, combinado solo WhatsApp. Historial previo sustituido donde contradiga esta regla.

## Problema y por que
La RPC contaba solo WhatsApp puro en el detalle y reutilizaba esos contadores en Canales. Ampliarlos sin separar canales duplicaria el combinado en el total.

## Alcance
Decision FINAL LOCAL aprobada T17-T19: nueva migracion 008 basada en 007 aplicada, ayuda y pruebas. Fecha llegada no afecta nuevo. UI/CSV intactos. Preservar procedencia, canales, general, citas, permisos y trabajo ajeno. Fuera: aplicar remoto, datos historicos, commit/push/deploy y subdelegacion. Historial anterior conservado.

## Restricciones
No commit/push/deploy ni SQL remoto mutador. No subdelegar. Preservar trabajo ajeno de campanas y endurecimiento.

## No romper
- Canales WhatsApp solo puro, llamada_whatsapp solo combinado, total sin duplicados.
- Procedencia, Fecha llegada y created_at no determinan nuevos. Nuevo = gestion_anterior NULL; todos los canales del grupo usan la misma regla. Visita/sin_clasificar siguen como Otros visible. Llamada Data Dura literal legacy pertenece a llamadas, nunca al grupo WhatsApp.
- Conservar permisos vigentes CRM/campaign editor y validacion de usuario activo.
- Conservar citas, inscripciones, filtros de asesora/fecha y claves del JSON.

## TDD
- Modo: off
- Fuente: default
- Runner: `npm test`; focalizado `node --test scripts/tests/daily-report-whatsapp-sql.test.mjs` (invoca 4 unittest SQL Python).

## Tareas
- [x] T1 Inspeccionar canonica y RPC remota en solo lectura.
- [x] T2 Preparar migracion con contadores separados.
- [x] T3 Probar combinadas nuevas/seguimientos, puras, no WhatsApp, medio independiente y aislamiento asesora/fecha.
- [x] T4 Ejecutar suite, lint y QA; registrar limitaciones.
- [x] T5 Inspeccionar clasificacion y preparar migracion siguiente sin tocar la aplicada.
- [x] T6 Actualizar etiquetas UI/CSV, ayuda y cobertura SQL de nuevos canales, altas/seguimientos y aislamiento.
- [x] T7 Ejecutar suite/lint/QA del ajuste y devolver al padre para revision independiente.
- [x] T8 Reutilizar canales para Gestionados hoy en UI/CSV y quitar Total detalle de gestion.
- [x] T9 Probar ejemplo 29/18, total general 39, CSV individual/TOTAL, null/vacio y no duplicados.
- [x] T10 Ejecutar suite/lint/diff/QA y documentar limites del ajuste final.
- [x] T11 Aplicar particion N/T-N/T compartida UI/CSV y actualizar ayuda.
- [x] T12 Validar conteos y N<=T; aviso UI y bloqueo CSV claro; cubrir bordes y totalizacion.
- [x] T13 Ejecutar tests/lint/QA y devolver evidencia al padre sin subdelegar.
- [x] T14 Preparar migracion local con parser seguro canonico y particiones WA/llamadas por llegada y alta.
- [x] T15 Adaptar helper UI/CSV, ayuda y pruebas de fechas/canales/autor/Miami/seleccion invalida.
- [x] T16 Ejecutar suite/lint/QA y devolver limites al padre para revision independiente.

## Criterios finales T14-T16
- [x] Alta con llegada hoy nueva; alta atrasada y seguimiento incluso llegada hoy gestionados; fecha automatica irrelevante.
- [x] Llegadas legacy invalidas/null/futuras gestionadas sin fallo; parser admite ISO y D/M/AA o AAAA como canonico campanas.
- [x] WA puro/combinado/Instagram/Otros (visita+sin_clasificar); llamadas normal/DD separadas, combinado solo WA.
- [x] UI tres filas WA y subseccion llamadas N/G/T; CSV individual/TOTAL coherente con helper compartido y validacion.
- [x] Canales/procedencia/general 100%, permisos/citas/filtros intactos; tests y lint pasan; ninguna aplicacion remota.

## Criterios de aceptacion
### Historicos (T11-T13, sustituidos por T14-T16)
- [x] UI exactamente tres filas WhatsApp nuevos hoy N, WhatsApp gestionados hoy T-N y Total T; ejemplo 20/15/35.
- [x] T suma whatsapp + llamada_whatsapp + instagram + visita + sin_clasificar; no usa contadores historicos de seguimiento ni total backend.
- [x] CSV individual y TOTAL con las tres columnas del detalle; categorias, procedencia y total general intactos.
- [x] Ausentes/null siguen siendo cero; strings de digitos se aceptan. Negativos, fracciones, booleanos, vacios, no numericos, infinitos e inseguros se rechazan; sumas fuera del rango seguro tambien.
- [x] N>T o conteo invalido produce aviso/no disponible UI y error CSV con toast, sin descarga ni clamp ni mutacion de entrada.
- [x] Sin nueva migracion ni escrituras remotas; revision independiente pendiente del padre.

### Historicos (T8-T10, sustituidos)
- [x] Gestionados hoy = canales.whatsapp + llamada_whatsapp + instagram + visita + sin_clasificar; los dos ultimos son exactamente Otros o sin canal visible.
- [x] UI: Gestionados hoy 29 y De ellos, WhatsApp nuevos 18; exactamente dos filas, sin Total detalle.
- [x] CSV individual/TOTAL suma gestionados desde canales; nuevos separado, sin sumarlo ni duplicar combinado.
- [x] Total general 39, categorias y contrato backend intactos; sin nueva migracion.
- [x] Nulls/datos vacios, numericos serializados, ausencia de fallback a whatsapp.gestionados y no mutacion cubiertos.

### Historicos (sustituidos por los finales anteriores)
- [x] Nuevos mantiene WhatsApp puro/combinado y no depende de Medio.
- [x] Seguimientos incluye Instagram y residual otros/vacio/NULL; excluye llamadas normales/Data Dura y visitas.
- [x] UI/CSV usa Detalle de gestion, Gestionados hoy y Total detalle de gestion (acentos normales en UI).
- [x] Canales y total general no duplican eventos.
- [x] Pruebas funcionales ejecutadas localmente.
- [x] No se modifica el remoto ni trabajo ajeno.

## Decisiones aceptadas
Decision vigente T14-T16: `202610160007_daily_report_arrival_partitions.sql` conserva cuerpo 006 salvo parser/particiones y normalizacion del literal legacy llamada Data Dura (antes residual, ahora llamadas DD). Fecha_gestion conserva filtro de dia; es_nuevo = gestion_anterior NULL y capture_date igual p_fecha; coalesce falso evita inventar nuevos ante Fecha desconocida, invalida, anterior o futura. Parser inline canonico de campanas 202609300004: regex acotadas, ISO/D-M-AA/AAAA, rango 2000..2100 y validacion de dia real antes de make_date; solo leads con gestiones del dia. No cast directo de texto a date, sin dependencia nueva. Nuevo aplica a todos los canales del grupo, no a Medio ni created_at.

`detalleGestionHoy(b, grupo='whatsapp')` valida grupo y N/T seguros, calcula G=T-N para ambos consumidores. Total WA desde cinco buckets, llamadas desde llamada+data_dura, sin combinado. CSV 36 columnas (33 numericas), Total WhatsApp y tres columnas llamadas de gestion; TOTAL validado para ambos grupos. UI conserva cuatro cards; anade subseccion h6 Llamadas bajo tres filas WA y desglose normal/DD. Ausentes/null mantienen cero legado. UI avisa, CSV falla con toast y sin descarga ante conteos invalidos. Se conserva `llamadas.total` legado (incluye combinado, resumen previo) y se anaden `nuevos`, `gestionados`, `total_gestion` (normal/DD exclusivamente) para no romper consumidores; el detalle usa el grupo exclusivo. No se ha aplicado la migracion: frontend requiere coordinacion con backend actualizado, la RPC antigua no puede producir la nueva semantica.

Historial T11-T13: `detalleGestionHoy(b)` calculaba y validaba N, T-N, T. CSV 33 columnas. Sustituido donde contradiga la decision vigente.

Historial:
Decision final T8-T10: `gestionadosHoy(canales)` reutiliza `numCanalesOtros`; nuevos conserva `whatsapp.nuevos`. No usar `whatsapp.gestionados` ni `whatsapp.total`: su semantica historica no representa todas las altas. CSV pasa de 33 a 32 columnas al quitar el total redundante, ordenando Gestionados y luego De ellos. No migracion ni cambio del JSON backend; no modificar migraciones aplicadas.

Historial:
Contador `c_whatsapp` exclusivo para Canales; `wa_nuevos` y `wa_gestionados` amplian solo Detalle WhatsApp. Nueva migracion `202610160005`, no editar historia.

Ampliacion actual: conservar claves y contadores internos `whatsapp`/`wa_*`; modificar solo predicado de `wa_gestionados` y etiquetas. Total detalle = nuevos + gestionados. `202610160006_daily_report_management_detail.sql` copia cuerpo aplicado con ese unico cambio funcional. No aplicar.

## Reutilizacion investigada
T14-T16: no existe helper SQL independiente de parseo Fecha. Se reutiliza inline el parser seguro `lead_date_parts/lead_date_numbers/dated_leads` de `202609300004_campaign_monthly_rollup_year.sql`, restringiendo candidatos al dia y sin tocar campanas. Se conserva 006 aplicada SHA256 `566c6dfb79cd52558176e29a1019cc5860705d6c40ddb53986e0b2456bf58f07`. Harness SQLite compartido extraido de prueba historica, conservando sus seis casos; adaptadores traducen arrays/regex/make_date/ultimo dia y fechas Miami con zoneinfo. No sustituyen la compilacion PostgreSQL. Contraste remoto unico SELECT de metadatos RPC/ACL confirma MD5 006 `e103c602f8a068067f7a81255610f541`, campaign_guard true, SECURITY DEFINER/search_path public y ACL sin anon/PUBLIC, authenticated/service_role/postgres con EXECUTE. Ninguna escritura remota.

Final: claves reales de Canales y agrupacion existente comprobadas en `detallesBloqueHtml`, `numCanalesOtros`, `diarioCsvLines`. El export TOTAL acumula `DIARIO_KEYS` desde los valores de cada bloque; se adapta el mismo vector al helper canonico, no existe otro total separado que deba leer whatsapp.gestionados. El resto de contadores y estadisticas permanece intacto. No hay docs/agent-context local ni entrada en query_context list (comprobado nuevamente).

Historial:
Canonica: `202610100002_daily_report_new_vs_rescheduled.sql`. `pg_get_functiondef` remoto conserva ese cuerpo salvo guardia que tambien admite `is_campaign_editor()`; se conserva esa guardia vigente. Frontend `src/legacy/reportes.js` consume las claves existentes tanto en pantalla como CSV; no requiere edicion. Alternativa descartada: ampliar wa_* sin separar canales (duplica). No hay `docs/agent-context/` local ni entrada del proyecto en query_context list. No hay binarios PostgreSQL locales.

Para el ajuste actual se reutiliza `202610160005` aplicada y el harness SQLite existente. Clasificacion inspeccionada: `c_visita` tiene categoria propia y `c_sin_clasificar` es residual (incluye canales desconocidos, vacio y NULL normalizado por CTE). `202610050001_fix_atomic_appointment_creation.sql:48` normaliza llamada Data Dura a llamada + indicador; el detalle excluye tambien el literal defensivamente. Canales conserva su clasificacion anterior, incluida la agrupacion visual de visita y sin clasificar bajo Otros o sin canal: esa agrupacion de presentacion NO define el detalle. Sin consultas remotas necesarias.

## Evidencia
- T1 passed: `select pg_get_functiondef('public.daily_management_report(date,uuid)'::regprocedure)` por MCP, lectura unica sin datos personales.
- T2 passed: migracion local preparada; permisos y resto de logica conservados.
- T3 passed: `node --test scripts/tests/daily-report-whatsapp-sql.test.mjs`: 3/3; ejecuta 4/4 unittest Python con todos los CTEs y JSON de la migracion en SQLite en memoria, adaptando solo funciones/sintaxis PostgreSQL. Casos: combinadas nuevas/seguimientos; puras; previo vacio NOT NULL; Medio ajeno/NULL y origen WhatsApp con canal no WhatsApp; mayusculas/espacios; autor/fecha, autor NULL por nombre, dia vacio. Checks adicionales de cuerpo canonico conservado y pantalla/CSV con detalle 4, canal puro 2 y total 7.
- T4 passed: `npm test`: 651/651 Node (incluye los 4 SQL Python) + 11/11 Python preexistentes; `npm run lint`: tsc y check-app OK.
- T4 passed con alcance limitado: `bash ~/.config/opencode/scripts/qa-gate.sh --strict` exit 0; staged no aplicable (no hay staged), rutas rastreadas comprobadas. No audita archivos nuevos sin stage. Barrido manual sobre los cuatro archivos propios: sin patrones de fiabilidad/seguridad ni whitespace; no es SAST. `git diff --check` limpio en tracked.
- Comprobacion auxiliar inicial `git diff --no-index --check /dev/null <archivo>` fue interpretada como fallo por retorno 1 (diferencias nuevas), sin diagnostico de whitespace; corregida la comprobacion para aceptar 0/1 solo con stdout/stderr vacios; los cuatro archivos pasan. No hubo fallo funcional.
- Limitaciones: no PostgreSQL local disponible; SQLite verifica agregacion y filtros, no compilacion PL/pgSQL, permisos efectivos ni zona horaria de citas (fuera del cambio). Migracion NO aplicada, build no ejecutado (sin cambios de frontend). Revision independiente pendiente en padre antes de aplicacion; no se subdelego.

## Progreso
### Regla FINAL llegada y alta LOCAL — T14-T16 — 2026-10-16
- Estado: implementado/verificado LOCAL; siguiente paso revision independiente por sesion padre. Sin subdelegar, commit, push, deploy ni escrituras remotas. No se modificaron migraciones aplicadas ni trabajo ajeno de campanas.
- T14 passed: nueva migracion 007, basada en 006; parser seguro canonico y particiones exhaustivas WA/llamadas. SHA256 006 intacto. SELECT remoto limitado a metadatos RPC/guardia/ACL confirma base 006 vigente y permisos conservados; ningun dato personal consultado.
- T15 passed: helper UI/CSV compartido para ambos grupos; tres filas WA/Total WhatsApp y subseccion llamadas con N/G/T y desglose normal/DD. CSV individual/TOTAL de 36 columnas. Pruebas SQL nuevas 5/5 y antiguas 6/6, ejecutadas desde Node: todos los canales alta/atrasada/seguimiento/previo vacio, DD true/false/null/literal, combinado exclusivo, Fecha legacy/null/imposible/futura, ISO y AA, bisiesto, autor/dia/nombres sin ID, created_at contradictorio y fronteras Miami 04:00 UTC. Pruebas helper con serializados, grupo invalido, invalidos ambos grupos y overflow TOTAL; wrapper UI/CSV sin descarga con toast en errores WA y llamadas.
- T16 passed: `npm test` 661/661 Node y 11/11 Python adicionales; log efimero `/tmp/opencode/daily-arrival-tests.log`. `npm run lint` tsc/check-app OK. `git diff --check` limpio y whitespace de los tres archivos nuevos comprobado. QA strict exit 0 con staged no aplicable (solo rutas rastreadas comprobadas); no audita unstaged/nuevos ni es SAST. Revision manual de cambios propios sin secretos/debug/catch vacios; lentes fiabilidad/seguridad/legibilidad sin hallazgos nuevos, sin reloj real/red/mocks nuevos en pruebas. Autoauditoria de codigo realizada.
- Primer run completo encontro cinco expectativas historicas de CSV 33 columnas/etiqueta retirada; ajustadas a 36/Total WhatsApp y suite completa repetida PASS. No fallo funcional SQL ni lint.
- Limites: sin PostgreSQL local, compilacion PL/pgSQL, RPC HTTP autenticada, navegador real, build ni despliegue. Adaptador SQLite verifica CTE/JSON y aplica zoneinfo para citas, no sustituye PostgreSQL. Migracion 007 NO aplicada; backend antiguo no implementa la nueva regla de llegada ni nuevos llamadas, por lo que cualquier aplicacion remota requiere aprobacion separada y coordinar frontend. `llamadas.total` legado conserva combinado por compatibilidad; `total_gestion` y detalle N/G/T son exclusivamente normal/DD, combinado solo en grupo WA del detalle.

### Particion LOCAL aprobada T11-T13 — 2026-10-16
- Estado: implementado y verificado LOCAL; siguiente revision independiente del padre. Sin subdelegacion, commit/push/deploy, SQL ni acceso remoto. Trabajo ajeno preservado mediante ediciones puntuales.
- T11/T12 passed: helper puro, tres filas y tres columnas, ayuda y toast; pruebas 20/15/35, 29/11/29 con general 39, bloques multiples/TOTAL, vacio/null/strings, nuevos=total, entrada no mutada, invalidos y UI/CSV bloqueado sin descarga. No fallback a whatsapp.gestionados/total.
- T13 passed: npm test 657/657 Node + 11/11 Python adicionales (log efimero `/tmp/opencode/detalle-particion-test.log`), npm run lint (tsc/check-app) y git diff --check. QA strict exit 0: staged no aplicable, solo rutas rastreadas comprobadas; no equivale a SAST ni revision independiente. Primer test run encontro una asercion historica que prohibia la nueva etiqueta; ajustada y suite repetida PASS. Reliability lens: sin hallazgos nuevos; coincidencias de reloj/esperas pertenecen al codigo preexistente fuera del ajuste.
- Limites: sin navegador real, build, PostgreSQL ni HTTP autenticado/remoto. Pruebas frontend con harness determinista y SQL preexistente en SQLite; no se modificaron migraciones. Autoauditoria de codigo realizada; pruebas nuevas sin reloj/red/mocks adicionales.

### Decision final LOCAL aprobada — 2026-10-16 (T8-T10)
- Estado: implementado y verificado LOCAL; siguiente: revision independiente por padre. Sin subdelegacion, commit/push/deploy ni llamadas remotas. Migraciones existentes intactas; NO requiere migracion.
- T8 passed: helper compartido en UI/CSV, dos filas exactas, ayuda coherente; trabajo ajeno de campanas preservado.
- T9 passed: `scripts/tests/reporte-diario-detalle.test.mjs` agrega 3 casos deterministas (29/18/39, suma de varios bloques, null/vacio/strings, contrato historico discordante y no mutacion). Ajustadas expectativas historicas UI/CSV y parsing de cabecera con coma entre comillas. TDD off mantenido.
- T10 passed: `npm test` 654/654 Node + 11/11 Python adicionales; incluye 6/6 SQL Python preexistentes. Log efimero `/tmp/opencode/management-detail-final-test.log`. `npm run lint` tsc/check-app OK; `git diff --check` limpio.
- QA strict passed con staged no aplicable (solo rutas rastreadas comprobadas); revision manual del codigo nuevo: sin secretos, debug, catch vacios, red, tiempos ni aleatoriedad nuevos. No es SAST. Limitaciones: sin smoke navegador, build, PostgreSQL ni remoto; revision independiente pendiente en padre. Cambios SQL historicos no requeridos ni modificados por este ajuste.

### Ajuste LOCAL aprobado — 2026-10-16
- T5 passed: migracion nueva, aplicada previa intacta; test compara cuerpo completo y solo admite cambio del predicado de seguimiento (ignorando comentarios).
- T6 passed: 3/3 Node focalizados y 6/6 SQL Python. Matriz de canales con alta, seguimiento y previo vacio; llamadas con indicador true/false/NULL; literal llamada Data Dura; visitas; autoria/dia y autores sin ID. UI/CSV conserva total canales/general independiente del detalle ampliado.
- T7 passed: `npm test` 651/651 Node (incluye 6/6 SQL Python) y 11/11 Python adicionales; `npm run lint` tsc/check-app OK; `git diff --check` limpio. Log efimero `/tmp/opencode/management-detail-npm-test.log`. Primera suite completa detecto expectativas viejas de etiquetas; actualizadas solo las aserciones afectadas y aclarada fixture historica CSV cuyo detalle coincide con canal puro. Reejecucion completa exitosa.
- QA strict passed con staged no aplicable (solo rutas rastreadas comprobadas); barrido manual read-only de migracion nueva, harness, UI/ayuda y tests afectados sin patrones de secretos, debug ni catch vacios; harness determinista, sin relojes aleatorios ni mocks nuevos. Whitespace tambien comprobado en archivos nuevos. No es SAST ni aprobacion QA de codigo unstaged.
- SHA256 de `202610160005` sigue `a4135d949c6c9330aa43bfe439d131e05cfa8762cc3799daac52af8b6a02aabe`, igual a evidencia de aplicacion. Sin cambios a la migracion aplicada ni al resto del trabajo ajeno.
- Estado: implementado y verificado LOCAL. Ultima tarea T7; siguiente revision independiente del padre. Ninguna aplicacion remota autorizada para este nuevo ajuste.
- Limitaciones: SQL ejecutado en SQLite, no PostgreSQL; no smoke navegador ni remoto. Revision independiente a cargo del padre; este worker no subdelega. Sin commit/push ni escrituras remotas.

### Actualizacion remota autorizada — 2026-10-16
Usuario autorizo explicitamente aplicar SOLO `202610160005_daily_report_whatsapp_detail.sql`; padre informa revision independiente PASS. Esto amplia el alcance local anterior. Estado actual: aplicada y verificada; el parrafo previo de cierre local que sigue se conserva como historial.

- Proyecto `hkkuyomlcqyxtzblowle`. Preflight MCP `list_migrations`, `list_tables`, SELECT `pg_get_functiondef` y ACL: sin drift adicional en la RPC; guardia `is_campaign_editor()` conservada. Migraciones ajenas de citas no tocadas.
- Contraste previo del cuerpo propuesto con local: MD5 `80dd9c081a3132470309ebad6e7e7646`, igualdad true; unicamente cambios aprobados en contadores y referencias de canales. SHA256 archivo local: `a4135d949c6c9330aa43bfe439d131e05cfa8762cc3799daac52af8b6a02aabe`.
- Unico `apply_migration(name='202610160005_daily_report_whatsapp_detail', query=SQL aprobado)`: success=true. Version remota **20261016180333**. Reversible restaurando cuerpo anterior mediante migracion compensatoria; no ejecutada.
- SELECT posterior: cuerpo MD5 identico al local, SECURITY DEFINER=true, search_path=public, campaign_guard=true. ACL `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; anon_execute=false, authenticated_execute=true; sin grant PUBLIC.
- Recuentos exactos antes/despues: leads 6251, gestiones 1219, citas 46, user_access 5; iguales. No escrituras de datos de usuarios ni simulacion de gestiones.
- SELECT de los CTEs extraidos del cuerpo aplicado para `2026-10-16`, todas las autoras: 5 bloques; WhatsApp nuevos 17 y gestionados 8; puro 20 y combinado 5; canales total 38 = gestionados 38. Invariantes por bloque PASS: detalle=puro+combinado; canales total=gestionados.
- Limites: prueba PostgreSQL read-only de agregados, no llamada HTTP/RPC autenticada ni smoke UI/CSV. No se suplantaron usuarios. Parseo inicial de envoltura MCP fallo antes de cualquier escritura; primer SELECT de agregados fallo 42601 por extraccion incompleta, corregido y repetido PASS. Ningun fallo modifico datos. Sin CLI, credenciales, commit/push ni subdelegacion.

### Cierre local previo (historial)
Estado: implementado y verificado localmente; pendiente revision independiente y autorizacion explicita para aplicar remoto. Ultima tarea: T4. Siguiente: revision por la sesion padre; este worker no subdelega. Sin commit/push/deploy ni cambios remotos. Evidencia completa de suite: `/tmp/opencode/whatsapp-detail-npm-test.log` (efimera).

### Aplicacion del ajuste autorizada — 2026-10-16T18:28:36Z
- Autorizacion explicita del usuario: «aplicala a ver como se ve», limitada a `202610160006_daily_report_management_detail.sql`; padre informa revision independiente PASS. Esta autorizacion sustituye las restricciones locales previas SOLO para esta migracion. No frontend deploy, otras migraciones, datos de usuarios, commit/push ni subdelegacion.
- Proyecto `hkkuyomlcqyxtzblowle`, API `https://hkkuyomlcqyxtzblowle.supabase.co`. Preflight MCP `list_migrations` + `list_tables(public, verbose=true)` y SELECT de RPC/ACL/recuentos. Ultima previa `20261016180333`; cuerpo remoto MD5 `80dd9c081a3132470309ebad6e7e7646` identico al cuerpo local de `202610160005`: sin drift no explicado. No se sobrescribieron correcciones ajenas.
- Aviso previo: reversible restaurando cuerpo anterior mediante migracion compensatoria. Unico `apply_migration(name='202610160006_daily_report_management_detail', query=SQL local aprobado)`: `success=true`. `list_migrations` confirma version remota **20261016182810**. Archivo local SHA256 `566c6dfb79cd52558176e29a1019cc5860705d6c40ddb53986e0b2456bf58f07`.
- SELECT posterior de `pg_proc`: MD5 `e103c602f8a068067f7a81255610f541`, igualdad exacta con cuerpo local=true (incluye comentarios/espacios). SECURITY DEFINER=true; search_path=public; guardia campaign editor conservada; comentario actualizado conforme al archivo.
- ACL anterior/posterior identica: `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`; anon_execute=false; authenticated_execute=true; sin PUBLIC. Firma y retorno jsonb intactos; no cambios de politicas RLS.
- Recuentos exactos antes/despues: leads **6251/6251**, lead_gestiones **1219/1219**, lead_appointments **46/46**, user_access **5/5**. Ningun DML de datos de usuarios.
- PostgreSQL read-only: extraccion de CTEs/JSON del `prosrc` verificado, reemplazando solo parametros por fecha `2026-10-16` y filtro UUID NULL, sin ejecutar guardia ni suplantar usuarios. Resultado agregado: 5 bloques, nuevos **17**, gestionados detalle **8**, total detalle **25**, canal puro **20**, combinado **5**, total canales **38**, total gestiones **38**. Invariantes por bloque detalle=nuevos+gestionados y canales total=gestionados: ambas true. La muestra actual no tiene seguimientos adicionales Instagram/otros; la ampliacion de esos casos esta cubierta por pruebas locales previas, no se insertaron fixtures remotas.
- SELECT previo directo de clasificacion: 2026-10-15 total 167/nuevos 32/seguimientos previos 57/ampliados 57; 2026-10-16 total 38/nuevos 17/seguimientos previos 8/ampliados 8. Cambio limitado a predicado de seguimientos; nuevos, canales, JSON y permisos preservados por igualdad del cuerpo esperado.
- Limites: sin smoke HTTP/RPC autenticado ni navegador: no hay sesion autorizada disponible sin gestionar secretos; no se leyeron credenciales ni .env, ni se simularon identidades. La prueba PostgreSQL verifica agregacion/JSON, no transporte HTTP ni recorrido autenticado completo. Etiquetas frontend ya locales en localhost:3002, sin desplegarlas. `git diff --check` limpio. Estado: aplicada y verificada dentro de estos limites.

## Aplicacion remota 009 — 2026-10-16 (atribucion por actor de resultados)
- Autorizacion explicita: aplicar SOLO `supabase/migrations/202610160009_appointment_results_actor.sql`.
- Preflight read-only: 008 remota version `20261016200241`, cuerpo extraido por `pg_get_functiondef` conforme a 008 local (visits/resolved pattern previo sin drift).
- Aplicada SOLO 009 con `apply_migration(name=202610160009_appointment_results_actor, query=contenido exacto)`: `success:true`. `list_migrations` confirma version `20261016201439`.
- Postflight: funcion `daily_management_report(date,uuid)` contiene CTE `result_events` y atribucion `visits/absent/cancelled/rescheduled` por `action_user_id`/`action_name` de `lead_appointment_events`, filtrado a status nuevos `ASISTIO/NO_ASISTIO/CANCELADA/REPROGRAMADA` por fecha Miami. `booked/rebooked` siguen creados por `coalesce(created_by_user_id, advisor_user_id)`. ACL intacta: `authenticated`,`postgres`,`service_role`; sin `public`/`anon`.
- Evidencia de datos: `lead_appointments` 46/46 y todos con eventos; `lead_appointment_events` 63; resultado events por Miami: Jessica (2026-10-16 cancelada 1, reprogramada 1; totales historicos movidos al actor; 2026-09-30 atribuido a actor Tecnologia cancelada 1/no-asistio 1). Consulta agregada de eventos confirma recuento por actor/fecha/status.
- Sin DML, sin otras migraciones, sin commit/push/deploy/frontend. Prueba directa de RPC autenticada no disponible en este contexto; verificacion por SQL read-only y body exacto.

## Correccion de coherencia del resumen (2026-10-19)
- Sintoma reportado por el equipo: "el reporte diario no suma". Diagnostico con
  datos reales (2026-10-15, 167 gestiones): la capa de datos SI cuadra
  (particion de canales = 167 = suma de asesorias = fila TOTAL del CSV), pero
  la pantalla mostraba dos cifras distintas con la MISMA etiqueta "Total
  llamadas": el KPI del resumen (84 = 36+40+8,includes la llamada combinada) y
  el detalle por asesora (76 = 36+40, solo llamadas puras). La llamada
  combinada pertenece al grupo de WhatsApp por decision vigente, asi que el
  KPI era la unica cifra que cruzaba los dos grupos.
- Fix (solo frontend, sin migracion ni cambio de RPC): el KPI y la columna CSV
  "Total llamadas" usan ahora el grupo Llamadas (del_dia + data_dura), el
  mismo que muestra el detalle. Invariante en pantalla: llamadas + grupo
  WhatsApp = gestiones (76 + 91 = 167). Etiqueta del detalle renombrada a
  "Total grupo WhatsApp" para distinguirla del canal "WhatsApp" de la tabla
  Canales; la cabecera del CSV no cambia (contrato con el equipo).
- Se conserva `llamadas.total` legado en la RPC (incluye combinado) para no
  romper otros consumidores.
- Verificacion: `npm test` 699 Node (697 pasan; 2 fallos preexistentes y
  ajenos) + 22 Python OK; `check-app` y `build` OK; render en Chromium con los
  datos reales de 2026-10-15: resumen, detalles y CSV cuadran.
- Limitacion: el reporte cuenta GESTIONES (actos registrados), no personas:
  2026-10-15 son 167 gestiones sobre 94 personas distintas. Si el equipo
  necesita "personas gestionadas" es una metrica nueva y requiere RPC
  (autorizacion de migracion remota) y no se ha anadido.

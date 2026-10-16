# Detalle de gestion del reporte diario

## Objetivo
Mostrar Detalle de gestion con tres filas: WhatsApp nuevos hoy N, WhatsApp gestionados hoy T-N y Total T. T suma las cuatro categorias visibles WhatsApp, combinado, Instagram y Otros o sin canal. La decision T11-T13 sustituye criterios previos; la evidencia anterior se conserva como historial.

## Problema y por que
La RPC contaba solo WhatsApp puro en el detalle y reutilizaba esos contadores en Canales. Ampliarlos sin separar canales duplicaria el combinado en el total.

## Alcance
Decision final LOCAL aprobada T11-T13: helper canonico UI/CSV en `src/legacy/reportes.js`, etiquetas, ayuda coherente, validacion proporcional, pruebas y verificacion local. Sin migracion: canales ya incluye altas y seguimientos. Conservar contrato JSON backend `whatsapp`, categorias y total general. Fuera: SQL, datos historicos, commit/push/deploy y escrituras remotas. Los criterios anteriores se conservan como historial.

## Restricciones
No commit/push/deploy ni SQL remoto mutador. No subdelegar. Preservar trabajo ajeno de campanas y endurecimiento.

## No romper
- Canales WhatsApp solo puro, llamada_whatsapp solo combinado, total sin duplicados.
- Procedencia no determina el detalle; nuevos conserva whatsapp.nuevos. Resto = T-N sin predicado gestion_anterior NOT NULL: incluye tambien altas de otros canales. Excluir llamada y llamada Data Dura; incluir visita y sin_clasificar como Otros visible.
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

## Criterios de aceptacion
### Finales vigentes (T11-T13)
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
Decision vigente T11-T13: `detalleGestionHoy(b)` calcula y valida N, T-N, T una sola vez por consumidor. Ausencia/null mantienen cero legado, sin coercion de booleanos ni texto vacio a cero. UI captura error solo del detalle y deja el resto visible. CSV falla entero con mensaje claro y wrapper muestra toast sin descargar; valida cada bloque antes de TOTAL y tambien el total acumulado seguro. CSV vuelve a 33 columnas (30 numericas); Total detalle de gestion distingue su cabecera del total general y Total canales. `gestionadosHoy` se conserva por compatibilidad pero UI/CSV usan el nuevo helper validado. Sin dependencia nueva.

Historial:
Decision final T8-T10: `gestionadosHoy(canales)` reutiliza `numCanalesOtros`; nuevos conserva `whatsapp.nuevos`. No usar `whatsapp.gestionados` ni `whatsapp.total`: su semantica historica no representa todas las altas. CSV pasa de 33 a 32 columnas al quitar el total redundante, ordenando Gestionados y luego De ellos. No migracion ni cambio del JSON backend; no modificar migraciones aplicadas.

Historial:
Contador `c_whatsapp` exclusivo para Canales; `wa_nuevos` y `wa_gestionados` amplian solo Detalle WhatsApp. Nueva migracion `202610160005`, no editar historia.

Ampliacion actual: conservar claves y contadores internos `whatsapp`/`wa_*`; modificar solo predicado de `wa_gestionados` y etiquetas. Total detalle = nuevos + gestionados. `202610160006_daily_report_management_detail.sql` copia cuerpo aplicado con ese unico cambio funcional. No aplicar.

## Reutilizacion investigada
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

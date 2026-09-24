# Carga completa de leads

## Objetivo

Hacer que el dashboard cargue y procese todos los registros de `public.leads`, superando el limite de 1.000 filas por respuesta de Supabase.

## Problema y por que

Supabase devuelve como maximo 1.000 filas por consulta. Aunque el conteo total muestra 5.810, KPIs, filtros, matriz, graficos, tabla y exportacion solo usan las primeras 1.000 filas.

## Alcance

- Cargar registros en bloques de hasta 1.000 filas.
- Consolidar todos los bloques sin duplicados y mantener orden descendente por `id`.
- Usar la coleccion completa en las funciones existentes.
- Mantener sincronizados el conteo y los datos ante eventos Realtime.
- Corregir duplicados o inconsistencias directamente relacionados con inserciones, actualizaciones y eliminaciones.

## Restricciones

- No cambiar autenticacion, RLS ni esquema de Supabase.
- No migrar el dashboard a React.
- No agregar backend ni dependencias.
- Mantener URL y publishable key actuales; nunca usar una secret key.

## No romper

- Lectura, insercion, actualizacion y suscripcion Realtime existentes.
- IDs HTML, filtros, graficos, exportacion y funciones globales.
- Build de Vite.
- El contador exacto implementado previamente.

## TDD

Modo: off
Fuente: default
Runner: no disponible; checks funcionales, build y verificacion independiente obligatorios.

## Tareas

- [x] T1. Implementar carga completa paginada y consolidacion segura.
- [x] T2. Corregir consistencia de conteo y deduplicacion en Realtime y operaciones locales.
- [x] T3. Verificar API, build, diff y criterios de aceptacion.
- [x] T4. Ejecutar verificacion independiente y cerrar evidencia.

## Criterios de aceptacion

- [x] La carga solicita bloques con `.range()` hasta completar el conteo.
- [x] Los 5.810 registros pueden quedar disponibles en `allLeads`.
- [x] No hay IDs duplicados tras carga, insercion local o evento Realtime.
- [x] INSERT y DELETE actualizan el conteo total de forma coherente.
- [x] UPDATE conserva o incorpora el registro correspondiente.
- [x] Un fallo parcial no presenta una coleccion incompleta como carga correcta.
- [x] `npm run build` termina correctamente.
- [x] La API confirma el conteo esperado y el diff queda dentro del alcance.
- [x] No se agregan secretos.

## Decisiones aceptadas

- Para el volumen actual se cargaran todos los registros en el navegador por bloques de 1.000.
- Se reutilizara el estado y renderizado actuales; paginacion remota y React quedan fuera.
- Se prioriza una carga secuencial acotada para reducir picos y simplificar manejo de errores.
- La paginacion usa cursor estable `id < ultimo_id` en orden descendente; una segunda pasada de IDs y un conteo exacto final reconcilian el snapshot.
- Ante mutaciones durante la carga se permite un unico reintento completo; una segunda inestabilidad falla cerrada.
- Las llamadas concurrentes a `loadLeadsData()` comparten una unica promesa en curso.
- `setupRealtimeListener()` crea como maximo un canal/listener y comparte una promesa que espera `SUBSCRIBED` durante un maximo de 3 segundos; REST continua tambien ante error, cierre o timeout.

## Reutilizacion investigada

- La consulta de conteo exacto, `allLeads`, `applyFilters()` y `handleRealtimeEvent()` son los puntos canonicos existentes.
- Se ampliaron esos puntos en lugar de crear una segunda capa de datos.
- La consolidacion canonica por `id` se comparte entre carga, Realtime e insercion/actualizacion local; no se agregaron dependencias.

## Evidencia

- T1 — Estado: passed tras reapertura. El verificador detecto que los offsets podian omitir filas ante INSERT concurrente. `index.html` usa ahora cursor descendente por `id`, bloques `.range(0, 999)`, segunda pasada de IDs, conteo exacto inicial/final y un reintento acotado antes de fallar cerrado.
- T2 — Estado: passed tras reapertura. El verificador detecto que dos cargas podian competir por el estado global. `loadLeadsData()` comparte una sola promesa; INSERT/UPDATE usan upsert consolidado, DELETE elimina solo una vez y Realtime se encola durante la carga.
- Estado: passed. Simulacion Node extraida de `index.html` — `load-races: ok (cursor reconciliation + shared promise)`; un INSERT despues del primer bloque fue detectado por la reconciliacion, recuperado en el unico reintento y dos llamadas simultaneas compartieron promesa/consultas.
- Estado: passed tras segundo ajuste del verificador. La inicializacion espera la promesa idempotente de `setupRealtimeListener()` y siempre inicia REST cuando esta resuelve, tanto con `SUBSCRIBED` como con `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` o timeout local.
- Estado: passed. Simulacion Node extraida de `index.html` — `realtime-setup-states: ok (idempotent + terminal states + timeout)`; dos llamadas compartieron promesa, canal y listener, `SUBSCRIBED` resolvio `true` y todos los fallos/timeout resolvieron `false`.
- Estado: passed. `node` (prueba directa de los helpers extraidos de `index.html`) — `helpers-state: ok` para consolidacion, orden, INSERT, UPDATE y DELETE.
- Estado: passed. `npm run build` — Vite 8.3.0 genero `dist/index.html`; solo mostro el aviso preexistente sobre `configLoader: native` y `__dirname`.
- Estado: passed. `npm run lint` — `tsc --noEmit`, exit 0.
- Estado: passed. `git diff --check`, exit 0.
- Estado: passed. Escaneo de secretos en lineas agregadas — `added-secret-scan: ok`.
- Estado: failed (no atribuible al diff). `bash ~/.config/opencode/scripts/qa-gate.sh --strict` marca el archivo ya rastreado `.env.example`; no detecto secretos en las lineas agregadas.
- T3 — Estado: passed. La API real devolvio 5.810 filas y 5.810 IDs unicos en seis bloques `[1000,1000,1000,1000,1000,810]`; `npm run build`, `npm run lint` y `git diff --check` finalizaron correctamente.
- T4 — Estado: passed. El verificador independiente confirmo paginacion estable, reconciliacion, carga unica concurrente y configuracion Realtime idempotente con espera maxima de tres segundos; REST continua ante cualquier fallo de Realtime.

## Progreso

Estado: complete
Ultima tarea: T4 verificada de forma independiente.
Siguiente paso: revision humana y, si se autoriza, commit y push.
Bloqueos: ninguno; qa-gate estricto conserva un fallo basal por `.env.example` rastreado.

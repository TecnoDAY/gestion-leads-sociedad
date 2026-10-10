# Ventana movil de leads

## Objetivo

Reducir la carga inicial del CRM mostrando los 2.000 leads activos mas recientes, permitir cargar bloques anteriores bajo demanda y conservar datos completos en historicos y reportes.

## Problema y por que

El inicio descarga los 6.000+ leads actuales, vuelve a recorrer sus IDs para reconciliar el snapshot y carga tambien 4.348 registros historicos. Esto aumenta solicitudes, transferencia y trabajo en el navegador aunque la operacion diaria se concentra en los leads recientes.

## Alcance

- Cargar inicialmente una ventana movil de hasta 2.000 leads activos ordenados por `id` descendente.
- Permitir añadir bloques anteriores de hasta 2.000 y volver a la ventana inicial.
- Mantener el conteo global como consulta liviana independiente.
- Adaptar INSERT, UPDATE, DELETE y archivado Realtime a una ventana acotada, incluyendo reposicion tras bajas visibles.
- Cargar `leads_historico` y la coleccion actual completa solo cuando una vista global los necesite.
- Separar la fuente completa de reportes/historicos del estado operativo para no alterar el panel.
- Simplificar los contadores repetidos y explicar el alcance visible.
- Añadir pruebas de regresion para ventana, bloques, Realtime, carga diferida y reportes completos.

## Restricciones

- Sin migraciones ni dependencias nuevas.
- Mantener Vanilla JS en `index.html` y los patrones de sesion/RLS existentes.
- No hacer commit, push ni despliegue.
- No mostrar resultados parciales como si fueran globales.

## No romper

- Autenticacion, roles, RLS, aislamiento entre sesiones y Realtime.
- CRUD, archivado, filtros, matriz, ficha de lead, citas y catalogos.
- Reporte por periodo, graficos historicos y exportaciones con el alcance indicado.
- Reconciliacion por IDs y proteccion ante mutaciones durante la carga.
- `npm test`, `npm run lint`, `npm run build` y `git diff --check`.

## TDD

Modo: off
Fuente: default
Runner: `npm test`

## Tareas

- [x] T1. Implementar carga inicial acotada, bloques anteriores y estado de alcance.
- [x] T2. Adaptar Realtime, conteo global y reposicion de la ventana.
- [x] T3. Implementar carga completa e historica bajo demanda sin contaminar el panel operativo.
- [x] T4. Ajustar interfaz, etiquetas y estados de carga.
- [x] T5. Añadir/actualizar pruebas y ejecutar verificacion completa.

## Criterios de aceptacion

- [x] El inicio descarga como maximo 2.000 leads actuales completos y no consulta `leads_historico`.
- [x] Los leads iniciales son los IDs activos mas altos, sin duplicados y en orden descendente.
- [x] Cada accion "Mostrar 2.000 anteriores" agrega el siguiente bloque sin huecos ni duplicados.
- [x] "Volver a los ultimos 2.000" recupera la ventana inicial.
- [x] INSERT mantiene el limite inicial; UPDATE antiguo no entra en la ventana; DELETE/archivado visible repone el limite cuando hay registros disponibles.
- [x] El conteo global no se deriva del numero cargado.
- [x] Historicos y reporte por periodo usan colecciones completas cargadas bajo demanda.
- [x] La interfaz distingue total de BD, visibles y filtros sin repetir el total global.
- [x] Todos los checks definidos finalizan correctamente o quedan documentados con evidencia honesta.

## Decisiones aceptadas

- Ventana por `id` descendente: representa el orden de ingreso y evita depender de fechas de texto inconsistentes.
- Tamano de bloque: 2.000; Supabase lo entrega internamente en paginas de hasta 1.000.
- Los registros que salen de la ventana nunca se eliminan de Supabase.
- Los bloques anteriores se cargan incrementalmente, no todos de golpe.
- Reportes e historicos completos se mantienen en caches separadas y bajo demanda.

## Reutilizacion investigada

- Se reutilizan `fetchRowsByIdCursor`, `consolidateLeadsById`, `haveSameLeadIds`, la cola Realtime y las guardas `sessionGeneration`.
- Se reutilizan `loadHistoricoData` y `fetchHistoricoByIdCursor`, moviendo su activacion fuera del arranque.
- Se conserva el patron de promesa compartida de los loaders.
- Se descarta paginacion remota completa por su mayor impacto sobre filtros, KPIs, graficos y exportaciones.
- Se descarta filtrar por fecha porque `Fecha` es texto y `created_at` refleja importacion, no llegada real.

## Evidencia

- T1 — Estado: passed. Tests sinteticos: ventana inicial devuelve IDs 6062..4063 en dos paginas; bloque anterior amplia 2.000→4.000 y retorno recorta a los 2.000 mas recientes.
- T2 — Estado: passed. Tests sinteticos: INSERT desplaza el limite, UPDATE antiguo no entra, edicion antigua no altera total y reposicion recupera el siguiente ID tras una baja visible.
- T3 — Estado: passed. `performLoadLeadsData` no invoca historico; el reporte por periodo espera `loadCompleteCurrentData`; historicos y origen Todos fallan cerrados si una coleccion completa no carga.
- T4 — Estado: passed. UI muestra un unico total BD, `Leads visibles`, alcance cargado y controles de bloques; la conexion ya no repite el total.
- T5 — Estado: passed. `npm test`: 248 Node pass / 0 fail y 11 Python OK. `npm run lint`: TypeScript + check-app OK. `npm run build`: Vite OK, `dist/index.html` 435.43 kB (gzip 94.38 kB). `git diff --check`: limpio.
- QA — Estado: passed con aviso basal. `qa-gate.sh` no encontro problemas en cambios; conserva aviso por `.env.example` ya rastreado.
- Lentes — Estado: sin hallazgos concretos nuevos de riesgo o flakiness; los `Date.now` y `waitForQuery` señalados pertenecen a mecanismos preexistentes/deterministas.

## Progreso

Estado: complete
Ultima tarea: T5 verificada.
Siguiente paso: prueba manual autenticada de tiempos y comportamiento visual; commit/push solo si se autoriza.
Bloqueos: ninguno.

---

## Fix: rango de gestión consulta global (2026-10-09)

### Problema

Con la ventana de 2.000, el filtro "Rango de gestión" (ej. 01/01/2026–31/01/2026) cruzaba las gestiones del período solo contra los leads visibles: las gestiones de enero referencian leads fuera de la ventana y el panel mostraba cero resultados.

### Solución mínima

- Nuevo `loadLeadsByGestionRange(desde, hasta)`: consulta `lead_gestiones` global por `fecha_gestion`, recoge `lead_id` únicos y descarga solo esos leads de `leads` (no archivados, lotes de 200 vía `fetchRowsByIds` con nueva opción `excludeArchived`).
- `applyFilters` usa ese conjunto como base temporal mientras el rango está activo; `allLeads` (ventana) y el histórico no se tocan. Al limpiar el rango vuelve `getVisibleBaseLeads()`.
- Caché por `desde|hasta|leadDataRevision`: cambiar otros filtros no repite peticiones; cualquier mutación de leads la invalida.
- Señal de alcance: insignia `dashRangeScope` ("Global por gestión · N leads") y subtítulo del KPI total ("Resultados globales por gestión").
- Guardas de sesión propias + `dashRangeGen`: sesión caduca o rango cambia → nada parcial.
- Se elimina el cruce por `gestionIds` (redundante: la base ya es el conjunto global).

### Evidencia

- Estado: passed. `npm test`: 253 Node pass / 0 fail y 11 Python OK. `npm run lint`: OK. `npm run build`: OK, `dist/index.html` 438.24 kB (gzip 95.05 kB). `git diff --check`: limpio.
- Tests nuevos/actualizados en `scripts/tests/t5-frontend-edge.test.mjs`: rango trae 1.205 leads globales con ventana de 100 (y avisa en origen histórico/todos); caché sin peticiones repetidas; limpiar rango vuelve a la ventana; error al descargar leads avisa sin parcial; sesión obsoleta descarta resultados; período sin gestiones devuelve cero sin tocar la ventana.

---

## Fix: filtro Mes consulta global (2026-10-09)

### Problema

Con la ventana de 2.000, el filtro **Mes** (ej. Enero) solo buscaba entre los leads visibles: los leads de enero fuera de la ventana no aparecían, aunque antes (con los 6.000 cargados) sí.

### Solución mínima

- Nuevo `loadLeadsByMonth(mes)`: consulta `leads` globalmente con `.eq('Mes', mes)` y `archived_at IS NULL`, paginado por `id` vía `fetchRowsByIdCursor`. Verificado en la base real: los valores de `Mes` están limpios (sin espacios), el `eq` exacto es seguro.
- `applyFilters` usa ese conjunto como base temporal cuando hay Mes y el origen es **Actuales** o **Todos**; `allLeads` (ventana) no se toca. Al quitar el Mes vuelve la ventana móvil.
- En origen **Histórico 2025** filtra localmente (la colección ya es completa); en **Todos** combina global actual + histórico.
- Si también está activo el **Rango de gestión**, el rango gana y el Mes se aplica localmente sobre ese conjunto (una sola descarga).
- Caché única por `mes|leadDataRevision`: cambiar otros filtros no repite peticiones.
- Fail-closed: sin Supabase o con error → toast de error, nada parcial presentado como global.
- Subtítulo del KPI total: «Resultados globales del mes».

### Evidencia

- Estado: passed. `npm test`: 262 Node pass / 0 fail y 11 Python OK. `npm run lint`: OK. `npm run build`: OK. `git diff --check`: limpio.
- Tests nuevos en `t5-frontend-edge.test.mjs`: mes consulta global con ventana ajena (1.205 enero vs 100 octubre); caché sin peticiones repetidas; mes+rango de gestión con una sola descarga; limpiar mes vuelve a la ventana; sin Supabase/error no pinta parcial; sesión obsoleta descarta; histórico filtra local sin consulta; Todos combina global actual + histórico.
- Verificación en DB (2026-10-09): `Mes` activo no archivado solo contiene valores limpios (Enero 1122, Mayo 1006, Agosto 865, Abril 654, Febrero 633, Julio 623, Marzo 540, Septiembre 466, Octubre 158).

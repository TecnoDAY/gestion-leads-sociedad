# Formato visual de los menús de catálogo (Title Case) sin tocar datos

## Objetivo
Que todas las opciones de los menús de Catálogo (Mes, Campaña, Medio, Gestión, Agente) se muestren con una sola forma de letra: primera letra en mayúscula y el resto en minúsculas. **Solo presentación**: ni `leads`, ni `lead_catalogs`, ni la vista de análisis guardan valores distintos.

## Problema y por qué
El dominio convive en tres formas en los menús: `ENERO`/`INSCRITO`/`CASTING BOOTCAMP` junto a `Agendado`, `Información`, `Whatsapp nuevo`. El usuario pedía "un solo tipo de letra". La revisión previa descubrió que normalizar los **datos** (UPDATE en bloque) obligaba a tocar `lead_catalogs` y `leads` a la vez, con riesgo de colisiones y de desajuste catálogo↔datos. Se eligió la forma barata y reversible: formatear solo la **etiqueta** de los `<option>`, dejando `option.value` crudo. Filtros, guardados y RPC siguen funcionando con los valores originales.

## Alcance
Incluye (todo en `index.html`):
- **T1** Helper `catalogLabel(v)`: primera letra mayúscula, resto minúsculas, recorta y colapsa espacios.
- **T2** Cuatro rellenadores dinámicos que ahora etiquetan con `catalogLabel`: `populateSelect` (filtros Mes/Campaña/Medio/Gestión), `fillSelectFromCatalog` (newMes/newMedio/newGestion/editGestion), `fillCitasSelect` (citasCampana/citasMedio/citasAsesor) y `populateHistoricalFilterOptions` (histFilterCampana/Agente/Mes).
- **T3** Dos bloques estáticos: se añaden atributos `value` explícitos a `<option>` de `citasResultado` (PROGRAMADA→"Programada", ASISTIO→"Asistió", etc.) y etiquetas en minúscula a los 12 meses del fallback `newMes` (value sigue siendo `ENERO`...).
- **T4** Verificación: `node --check` de los scripts inline, `npm run build`, `npm run lint`, `git diff --check`, y prueba del helper sobre 16 casos.

Excluye (con motivo):
- **Datalists** (`campanaList`, `mesList`, `medioList`, `campanaEditList`): sus `<option>` solo tienen `value`; elegir una sugerencia escribe el valor en el input y **se guarda en la BD**. Formatearlas cambiaría los datos escritos. Quedan crudas. *(El datalist `agenteList` sí se actualizó en T6 porque es cosmético —sugerencias del datalist y placeholder— y el cambio de Jessi a Jessica lo pedía el humano.)*
- **Editor admin de catálogos** (`renderCatalogList`): ahí el texto mostrado ES el dato (sirve para renombrar/desactivar); formatearlo falsearía el valor al administrar.
- Badges/tabla/KPIs: no son menús; los KPIs de citas listan `PROGRAMADA`/`ASISTIO` sin etiqueta amigable.
- La columna `"Interesado en "` y los índices siguen pendientes: tras T5 el servidor MCP les tiene reglas ask; no se tocan.

**Ampliación posterior (registrada aquí, mismo documento):** tras la verificación visual del primer tramo, el humano autorizo `T5`/`T6`: normalizar los datos con migración y canonizar `Jessi` como `Jessica`.

## Restricciones
- Solo `index.html`; sin dependencias; vanilla JS.
- `option.value` siempre = valor crudo del catálogo o del dato.
- Nunca commit/push sin petición explícita.

## No romper
- `applyFilters`/`getUniqueValues`/`renderCitas`/`renderHistoricalAnalytics`, que comparan `select.value` con valores en crudo.
- `set_lead_appointment_status` y las comprobaciones `r.status===result`: el filtro de citas usa `PROGRAMADA`/`ASISTIO`...; los `<option>` llevan ahora `value` explícito para que el texto amigable no se convierta en valor.
- Fallback estático de meses en `modalNewLead`: etiquetas amigables, `value` en mayúsculas, sin tocar `normalizeLeadMonth`.
- Datalists y editor de catálogos, sin cambios.

## TDD
Modo: off | Fuente: default | Runner: no disponible (sin runner de tests; `npm run build`, `npm run lint`, `git diff --check` y checks funcionales).

## Tareas
- [x] T1 helper `catalogLabel`
- [x] T2 cuatro rellenadores dinámicos
- [x] T3 bloques estáticos (citas + fallback de meses)
- [x] T4 verificación
- [x] T5 migración `202609260001_normalize_catalog_values.sql`: trim + Title Case en los datos de `leads`, `leads_historico` y `lead_catalogs`; canon `Jessi`→`Jessica` en todas las superficies de agente; dedupe del catálogo; triggers de guarda
- [x] T6 cosmética de agente en la app: placeholder y datalist `agenteList` con el roster actual (Ana, Jessica, Loli)

## Criterios de aceptación (T5-T6)
- [x] Menús de Mes/Campaña/Medio/Gestión/Agente muestran Title Case y siguen filtrando.
- [x] Los filtros devuelven resultados (los valores crudos no cambian).
- [x] Datalists intactas: valores que se escriben en la BD no se modifican.
- [x] Editor de catálogos intacto.
- [x] `node --check` 3/3, `npm run build` OK, `npm run lint` OK, `git diff --check` limpio.

## Decisiones aceptadas
- Cambio de alcance: de "normalizar datos en la BD" a "formatear solo la etiqueta visible" (T1-T4). Motivo: menor riesgo, misma experiencia de usuario inmediata, reversible.
- Cambio de alcance 2: tras la verificación visual, normalizar también los valores guardados (T5) y canonizar `Jessi` → `Jessica`. Motivo: los selects de filtro que venía la BD base (`upper_case`) ya se mostraban distinto de las divs reales; y el usuario fijo que el nombre del agente es Jessica.
- El primer intento de T5 abortó limpio por `23505: duplicate key (kind, value)=(agente, Jessica)` — se descubrió el UNIQUE que ningún lint lo marcaba. Reorden: dedupe antes de normalizar y borrar la fila inactiva `Jessica` antes de renombrar `Jessi`.
- Trigger `trg_leads_normalize_catalog_columns` y `trg_catalogs_normalize_value` como guarda para impedir que vuelva una variante.
- Nina sigue con sus 518 leads e inactiva. `AGENTE`/`Na`/`Tecnologia` inactivos; las 70 filas pertenecientes a ellos (`Agente` 19, `Na` 8, `Tecnologia` 1) quedan para revisión manual del humano.
- En la app, los datalists estáticos se mantienen crudos pero con el roster real (Ana, Jessica, Loli); placehelders reformulados a `Ej: Ana, Jessica, Loli`.

## Reutilización investigada
- `getField`/`normalizeGestion`/`normalizeLeadMonth` ya normalizan a mayúsculas en la lógica; el display no las toca.
- `fillSelectFromCatalog`/`fillCitasSelect`/`populateSelect`/`populateHistoricalFilterOptions` ya existían como los puntos únicos de relleno de menús; se reutilizan.
- No se creó ningún nuevo select-filler.

## Evidencia
- `node --check` en los 3 scripts inline extraídos: 0 errores.
- `npm run build` OK (dist/index.html 268.17 kB, gzip 56.19 kB).
- `npm run lint` (tsc --noEmit) OK.
- `git diff --check` limpio.
- Mini-test del helper en `/tmp` (spike, no queda en repo): 16/16 casos, incluidos `Ágosto`, `Ópción`, `ñandú`, `null`, `undefined`, `'   '` y valores reales (`INSCRITO` → `Inscrito`, `PROXIMAS INSCRIPCIONES` → `Proximas inscripciones`...).

## Evidencia (T5-T6)
- **Primer intento falló limpio**: `apply_migration` devolvió `23505: duplicate key value violates unique constraint "lead_catalogs_kind_value_key"` con `(agente, Jessica)`. El UNIQUE no aparecía en los lints de Supabase. Comprobado el rollback total antes de reintentar (0 funciones, 0 triggers).
- **Post-aplicacion**:
  - `leads.GESTION` 20 valores en Title Case (`Inscrito`, `Agendado data dura`, `No contesta`...)
  - `leads.AGENTE` = `Agente | Ana | Jessica | Loli | Na | Nina | Tecnologia`; **0 ocurrencias de Jessi** en ninguna tabla (leads, historico, appointments, gestiones, notes, catalogs).
  - `leads.Mes` = 8 valores (`Abril | Agosto | Enero | Febrero | Julio | Marzo | Mayo | Septiembre`).
  - `lead_catalogs`: 61 filas dedupes; todas las de `mes` en Title Case (`Agosto...`); `agente.Jessica` activo y unico; comprobacion pre-rename (`Jessica` idle 60 borrada, `Jessi` renombrada).
  - Triggers `trg_leads_normalize_catalog_columns` y `trg_catalogs_normalize_value` existentes: cualquier inserción futura de `jessi` o de un valor en mayúsculas se normaliza al canon antes de tocar la tabla.
  - `npm run build` tras el cambio de T6 OK.

## Progreso
- Estado: implementado y verificado en local y en la BD (T1-T6).
- Última tarea: T6.
- Siguiente paso: commit cuando el humano lo pida.
- Bloqueos: ninguno.

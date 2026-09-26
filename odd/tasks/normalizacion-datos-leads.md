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
- **Datalists** (`campanaList`, `mesList`, `medioList`, `campanaEditList`): sus `<option>` solo tienen `value`; elegir una sugerencia escribe el valor en el input y **se guarda en la BD**. Formatearlas cambiaría los datos escritos. Quedan crudas.
- **Editor admin de catálogos** (`renderCatalogList`): ahí el texto mostrado ES el dato (sirve para renombrar/desactivar); formatearlo falsearía el valor al administrar.
- Badges/tabla/KPIs que muestran `GESTION` o estados en celdas: no son menús. Por ejemplo, los KPIs de citas listan `PROGRAMADA`/`ASISTIO` sin etiqueta amigable. Si se quiere, misma técnica en otra tarea.
- **Cualquier cambio de datos**: la normalización física de valores, los índices, la vista `v_contactos`, `telefono_normalizado` y la columna muerta `"Interesado en "` se aparcan para un documento aparte si se quieren. (Antes eran T1 de este documento; descartado al validar el alcance conservador.)

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

## Criterios de aceptación
- [x] Menús de Mes/Campaña/Medio/Gestión/Agente muestran Title Case y siguen filtrando.
- [x] Los filtros devuelven resultados (los valores crudos no cambian).
- [x] Datalists intactas: valores que se escriben en la BD no se modifican.
- [x] Editor de catálogos intacto.
- [x] `node --check` 3/3, `npm run build` OK, `npm run lint` OK, `git diff --check` limpio.

## Decisiones aceptadas
- Cambio de alcance: de "normalizar datos en la BD" a "formatear solo la etiqueta visible". Motivo: menor riesgo, misma experiencia de usuario inmediata, reversible. Grabado el 2026-09-26 tras la pregunta "¿es esta la mejor forma?".
- Valores/campanas/medi/gestion/agente guardados permanecen sin tocar; sin lista de excepciones (el humano no la pidió).
- `citasResultado` usa etiquetas en español correcto ("Asistió") sin cambiar valores; son constantes de UI, no valores de catálogo, por eso no aplicaba la regla "sin ortografía".
- El roster de agentes con Nina intacta e inactiva queda fuera: no había dato para reasignar sus 518 leads y el humano lo resolvió así.

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

## Progreso
- Estado: implementado, verificado en local y revisado por el humano (los menús filtran bien). Reglas `ask` de Supabase movidas a `opencode.json` (aplican a todos los agentes del proyecto).
- Última tarea: T4.
- Siguiente paso: commit cuando el humano lo pida.
- Bloqueos: ninguno.

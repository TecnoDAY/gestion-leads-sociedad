# Feature: Orden alfabético de menús, listas y cuadros de categorías

## Objetivo
Todos los desplegables, catálogos, matrices y cuadros de categorías se presentan ordenados alfabéticamente (A–Z, español, insensible a mayúsculas/acentos), salvo excepciones de orden natural.

## Problema y por qué
Las campañas, medios, gestiones y asesoras aparecen en orden arbitrario (orden de catálogo, de datos o de volumen), lo que dificulta localizar valores en menús y reportes.

## Alcance
- Comparador comun `compareAlphaEs` (localeCompare 'es', sensitivity base, numeric true).
- Panel operacional: filtros Campaña/Medio/Gestión/Asesora A–Z; Matriz Gestión x Campaña filas y columnas A–Z.
- Histórico: menús de campaña y asesor A–Z (mes y año conservan orden natural).
- Citas: menús de campaña, medio, asesor, resultado y sede A–Z.
- Formularios Nuevo/Editar: gestión, medio, última gestión, asesores A–Z.
- Reporte por período: resumen Medio, campañas, gestión actual, matriz, actividad y gestión por estado A–Z; CSV con el mismo orden que pantalla.
- Otros desplegables categóricos estáticos (roles, tipos de catálogo, estado de campaña) A–Z.

## Restricciones
- Solo presentación: no cambian `value`, ids, consultas, RPCs ni datos.
- Excepciones de orden natural: meses cronológicos, años numéricos, tamaños de página, registros por fecha, rankings de gráficos.
- Placeholders (Todos/Todas/Seleccione) fijos arriba; filas TOTAL al final.
- Sin dependencias nuevas; sin cambios en Supabase.

## No romper
- `option.value` exactos (incluidos espacios finales); filtros y guardados coinciden con los datos.
- Selección activa de cada select se conserva al reordenar.
- Coherencia de matrices: cada conteo sigue unido a su campaña/gestión (validatePeriodoSummary).
- Suite `npm test`, `npm run lint`, `npm run build`, `git diff --check`.

## TDD
Modo: off. Fuente: default. Runner: `npm test` (Node + Python). Checks funcionales obligatorios.

## Tareas
- [x] T1 Comparador comun + selects dinamicos (catalogOptions, populateFilterOptions, fillCitasSelect, populateHistoricalFilterOptions, renderAppointmentAdvisorSelect)
- [x] T2 Estaticos: medio/gestion/ultima gestion en Nuevo y Editar, citas resultado/sede, authorizeRole, catalogKind, dataSourceFilter, estadoOptions de campanas
- [x] T3 Matrices: renderMatrix y buildPeriodSummary (lista) A–Z
- [x] T4 Actividad del período (render + CSV) A–Z
- [x] T5 Tests adaptados + nueva cobertura de orden; suite verde

## Criterios de aceptación
- [x] Todos los menús de categorías A–Z sin cambiar valores internos (`option.value` intactos, incluidos espacios finales).
- [x] Meses cronológicos, años/tamaños numéricos, registros por fecha; placeholders y TOTAL en su posicion.
- [x] `npm test` / `lint` / `build` / `git diff --check` verdes.

## Decisiones aceptadas
- Orden alfabético en español insensible a mayúsculas/acentos; comparador único.
- 'Sin definir' se ordena alfabéticamente igual que el resto de categorías.
- Actividad del período: se ordena en cliente tras recibir la RPC; cero cambios remotos.

## Reutilización investigada
- `catalogLabel`/`catalogOptions`/`populateSelect`/`fillSelectFromCatalog` (index.html ~2401-2957) como puntos canónicos de construcción de opciones.
- `localeCompare(a, b, 'es')` ya usado en reporteAsesora (linea ~6032) y histórico.

## Errores encontrados y corrección
1. **ReferenceError: compareAlphaEs is not defined (28 tests)** — causa: los arneses VM de `t5-frontend-edge.test.mjs` y `session-isolation.test.mjs` extraen funciones reales por nombre y faltaban los helpers nuevos. Corrección: añadidos `compareAlphaEs`, `sortAlphaEs`, `sortMonthCatalog` a las listas de extracción de ambos arneses.
2. **deepStrictEqual "same structure but not reference-equal"** — los arrays devueltos por funciones extraidas viven en el realm de `vm`; las aserciones directas fallaban aun con contenido identico. Corrección: envolver con `plain()` (mismo criterio que el resto de la suite).
3. **Expectativa `medios` sin 'Sin definir'** — mi test nuevo esperaba `['aMedio','zMedio']` y la función (correctamente) siempre incluye 'Sin definir' con count 0. Corrección: expectativa ajustada; confirmado que es comportamiento preexistente, no regresión.
Todos corregidos; estado final de la suite: verde.

## Evidencia
- T1: `compareAlphaEs`/`sortAlphaEs`/`sortMonthCatalog` (tras `catalogLabel`); `catalogOptions` ordena todo alfabético salvo kind `mes` (cronológico); `fillCitasSelect` ordena conservando selección; `populateHistoricalFilterOptions` campañas/asesores A–Z (meses y años naturales); `renderAppointmentAdvisorSelect` ordena copia por nombre.
- T2: reorden estático con valores byte-identicos y `selected` preservando el default: `newMedio` (Whatsapp), `newUltimaGestion` (WhatsApp), `newGestion` (Información), `editGestion`, `editUltimaGestion`, `citasResultado`, `citasSede`, `authorizeRole` (Agente), `catalogKind` (Mes), `dataSourceFilter` (Leads actuales), `estadoOptions` (Activa, Finalizada, Pausada). `reporteVista` ya era alfabético; `newMes` y `pageSizeSelect` conservan orden natural.
- T3: `renderMatrix` filas/columnas con `compareAlphaEs` (eliminado el orden prioritario); `buildPeriodSummary.lista()` ordena catálogo+extras junto alfabéticamente; matriz derive de esas listas, `validatePeriodoSummary` intacto (conteos unidos a su categoría).
- T4: `renderPeriodoActividad` (Gestiones, Canales, Citas y tabla por_estado) y `exportReportePeriodoCSV` con el mismo orden; cero cambios en RPC/Supabase.
- T5: tests existentes del período actualizados al nuevo orden; test nuevo 'orden alfabético canónico' (comparador con acentos/mayúsculas/números, meses cronológicos, catalogOptions, coherencia matriz-listas). **244 tests Node pass / 0 fail + 11 Python OK**; `npm run lint` OK (tsc + check-app, tema claro OK, 3 bloques); `npm run build` OK (dist/index.html 413.38 kB); `git diff --check` OK.

## Progreso
- Estado: implementado y verificado localmente.
- Última tarea: T5.
- Siguiente paso: revisión visual humana en navegador (dashboard, histórico, citas, reporte por período, campañas); commit solo si se pide explícitamente.
- Bloqueos: ninguno.

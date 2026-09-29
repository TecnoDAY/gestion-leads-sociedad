# Filtro de Rango de Fechas de Gestión en Panel Operativo

## Objetivo
Añadir al Panel Operativo un selector de rango de fechas de gestión (`Desde` / `Hasta`) para poder filtrar y consultar qué se hizo (gestiones registradas) durante ese periodo (por ejemplo, del 1 al 7 de septiembre), combinándolo opcionalmente con los filtros existentes (campaña, agente, medio, estado/gestión, mes).

## Problema y por qué
Actualmente el panel operativo filtra leads por el mes asignado en la columna `Mes`, pero no permite acotar la consulta a un rango exacto de días (ej. 1 al 7 de septiembre) basado en la **fecha real en que se registró la gestión** (`lead_gestiones.fecha_gestion`), lo cual es indispensable para auditar el trabajo diario o semanal dentro de un mes.

## Alcance
- **T1**: Modificar la interfaz del Panel Operativo (en `index.html`) para incluir los inputs de fecha de gestión (`dashDesde` / `dashHasta`) junto a los filtros actuales.
- **T2**: Ajustar la lógica de carga y filtrado en el frontend de `index.html` para que, cuando se active el rango de fechas de gestión, se consulten las gestiones en `lead_gestiones` dentro de ese rango y se filtren los leads correspondientes, unificando cada lead una sola vez.
- **T3**: Verificación local (build, lint, git diff, checks funcionales).

## Restricciones
- Sin nuevas dependencias ni cambios en esquema de base de datos (se usa la tabla existente `lead_gestiones`).
- Vanilla JS en `index.html`.
- Nunca commit/push sin petición explícita.

## No romper
- Demás pestañas (`Gráficos Históricos`, `Reporte`, `Citas`).
- Filtros actuales del Panel Operativo (mes, campaña, agente, medio, estatus, búsqueda).
- `npm run build`, `npm run lint`, `git diff --check`.

## TDD
Modo: off | Fuente: default | Runner: no disponible (checks funcionales obligatorios).

## Tareas
- [x] T1: Mover controles HTML de rango de fechas (`dashDesde` / `dashHasta`) a su propia fila dentro de los filtros.
- [x] T2: Implementar la consulta a `lead_gestiones` por rango con protección contra condiciones de carrera, validación y manejo de errores.
- [x] T3: Verificación final (build, lint, git diff, qa-gate) — completada.

## Criterios de aceptación
- [ ] El panel operativo cuenta con selector de rango de fechas (Desde / Hasta).
- [ ] Al seleccionar un rango, la tabla e indicadores reflejan únicamente los leads que tuvieron gestiones registradas en ese periodo de fechas.
- [ ] Los filtros existentes (mes, campaña, agente, estatus) siguen funcionando combinados con el rango.
- [ ] `npm run build` y `npm run lint` pasan sin errores.

## Decisiones aceptadas
- Se consulta `lead_gestiones` por `fecha_gestion` en el rango especificado para determinar qué leads tuvieron actividad.
- Si no hay fechas seleccionadas en el rango, el panel operativo se comporta exactamente como antes (filtrando por mes u otros criterios).

## Reutilización investigada
- Patrón de consulta a `lead_gestiones` y manejo de rangos de fechas ya usado en `loadCitas()` y `loadReporteDiario()`.
- Estilos de inputs de fecha del panel de Citas o Histórico reutilizados para coherencia visual.

## Evidencia
- T1: fila propia del rango insertada bajo los filtros con borde indigo, inputs `dashDesde` / `dashHasta` con `onchange="applyFilters()"`, botón "Limpiar rango" y aviso de error `dashRangeError`.
- T2: `applyFilters` protegida con generador `dashRangeGen` (ignora respuestas obsoletas), validación `Desde ≤ Hasta`, consulta segura a `lead_gestiones` con `.gte/.lt` por fecha, manejo de errores y aviso visible en caso de fallo.
- `clearDashRange()` añadida y usada desde el botón y desde `resetAllFilters()`.
- Corrección Citas: `loadCitas` ahora incluye `archived_at` en la consulta de leads, excluye citas de leads archivados o sin lead, muestra aviso de citas omitidas y limpia resultados si falla la carga de leads. Eliminado `|| null` del map que causaba filas sin datos.
- `npm run build`: OK (274.99 kB).
- `npm run lint`: OK (3 bloques, 2 reglas).
- `git diff --check`: OK.
- `qa-gate`: sin hallazgos nuevos (solo aviso preexistente de `.env.example`).

## Progreso
- Estado: implementado y verificado (T1-T3 passed; corrección Citas aplicada).
- Última tarea: T3 verificación.
- Siguiente paso: prueba manual en navegador — seleccionar rango válido, probar rango inválido (Desde > Hasta), probar con filtro de estado (ej. Agendado), limpiar rango y verificar que vuelve al comportamiento original; revisar que el icono `calendar-range` se renderiza; en Citas verificar que no aparezcan filas con datos vacíos al archivar un lead.
- Bloqueos: prueba manual del humano; commit/push pendiente de petición explícita.

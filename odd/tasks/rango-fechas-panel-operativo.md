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

## Revisión posterior (integración en Filtros Dinámicos)
- El rango de gestión se movió a la tarjeta "Filtros Dinámicos en Tiempo Real" (fila separada tras Origen), con layout responsive y sin tarjeta propia. Botón "Limpiar rango" sigue presente dentro de esa fila.
- Correcciones aplicadas:
  1. **Fechas iguales a cadenas**: la consulta a `lead_gestiones` ahora compara `gte/lte` con `YYYY-MM-DD` directamente, sin `new Date`/`toISOString` que podían desviar un día por la zona horaria.
  2. **Generación en todos los caminos**: el token `dashRangeGen` se incrementa al entrar a `applyFilters`, no solo si hay rango, para invalidar consultas en vuelo aunque luego se limpie el rango.
  3. **`resetAllFilters` evita doble llamada**: limpia el rango manualmente y llama `applyFilters` una sola vez (ya no llama a `clearDashRange` además).
  4. **Conteo de filtros**: el rango desde-hasta cuenta como un filtro, no dos.

- 5. **Layout compacto v1.2**: Origen y Rango de gestión ahora comparten una fila dentro de la tarjeta (flex-wrap entre la rejilla de filtros y el final de la tarjeta); los inputs de fecha son compactos (`w-[120px]`), "Limpiar" queda in-line, y en móvil se ordenan verticalmente. "Origen" dejó de ocupar una celda de la rejilla para que esta quede equilibrada.

## Progreso
- Estado: implementado y verificado (T1-T3 passed; corrección Citas aplicada; revisión integrada en Filtros Dinámicos v1.1).
- Última tarea: v1.1 integración.
- Siguiente paso: prueba manual en navegador — mover el rango a la tarjeta, validar que los filtros siguen combinados, limpiar rango y verificar que regresa al comportamiento original.

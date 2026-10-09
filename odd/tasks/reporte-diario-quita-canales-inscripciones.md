# Reporte diario: retirar canales en desuso e inscripciones

## Objetivo
Quitar del **Reporte Diario** las métricas que el equipo no usa, sin tocar el resto de la aplicación ni los datos ya recopilados.

## Problema y por qué
El reporte diario muestra en la columna Canales dos categorías sin uso (`Visita Conservatorio`, `Sin clasificar`) y, debajo, una tabla entera de Inscripciones con su KPI `Total inscritos`. El humano confirmó que el reporte diario no las va a usar y solo añaden ruido.

## Alcance
Incluye (solo `index.html` + tests):
- Pantalla: quitar `Visita Conservatorio` y `Sin clasificar` de la tabla Canales.
- Pantalla: quitar la tabla `Inscripciones` del detalle por asesora.
- Pantalla: quitar el KPI `Total inscritos`; el resumen pasa de 5 a 4 celdas.
- Pantalla: `Total canales` recalculado como suma de las categorías visibles, para que cuadre con sus filas.
- CSV: quitar `Canal Visita Conservatorio`, `Sin clasificar`, `Inscritos del día`, `Inscritos Data Dura` y `Total inscritos`; la matriz pasa de 36 a 31 columnas (28 numéricas).

Excluye:
- Selectores de `Tipo de Última Gestión` de los leads (siguen ofreciendo Visita Conservatorio).
- RPC `daily_management_report` y su JSON: los datos se siguen calculando y conservando.
- Campañas, histórico y reporte por periodo.
- Gráfico `Inscripciones Logradas` del histórico (línea 5536 de `index.html`).

## Restricciones
- Sin migraciones ni cambios en base de datos.
- `Data Dura` es una categoría válida y se mantiene (`Llamada Data Dura`, `Agendados Data Dura`): no confundir con `Visita Conservatorio`.
- Pantalla y CSV deben contar la misma historia: un total que no cuadre con sus filas se considera fallo.

## Decisiones aceptadas
- Eliminar de la vista en vez de ocultar con CSS: el CSV deja de llevar columnas que nadie usa.
- `totalCanalesVisibles(canales)` recalcula desde las partes en lugar de usar `canales.total`, porque ese valor del RPC incluía las dos categorías retiradas.
- No tocar el backend: los datos siguen disponibles si el equipo los necesita en el futuro.

## Evidencia
- `node scripts/check-app.mjs` OK, `npm run lint` OK, `npm run build` OK.
- `npm test`: 243/243 JS + 11/11 Python.
- `git diff --check` limpio.
- Fixture con `canales:{llamada:1,data_dura:1,llamada_whatsapp:1,whatsapp:2,instagram:0,visita:3,sin_clasificar:4}` → `totalCanalesVisibles` = 5 y el panel muestra `Total` 5 con 5 filas.

## Progreso
- Estado: completado y verificado en local.
- Pendiente del humano: revisión visual del reporte diario y del CSV exportado.

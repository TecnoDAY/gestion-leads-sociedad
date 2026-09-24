# Fase 1: Históricos mensuales con filtros, KPIs, gráficos y exportación

## Objetivo

Convertir la pestaña "Gráficos Históricos" en un panel mensual de rendimiento: filtrar por mes, campaña y asesor; KPIs completos; gráficos de estados y campañas por mes más embudo de conversión; y tabla mensual exportable a CSV.

## Problema y por qué

Hoy los históricos solo agregan por campaña y asesor, sin filtro de mes, sin estados por mes, sin campañas por mes, sin embudo y sin exportación de la tabla resumen. La dirección necesita ver la evolución mensual como en el Excel de seguimiento.

## Alcance

- Filtro de Mes en la cabecera de históricos (además de campaña y asesor existentes).
- Normalización de mes (`Mes` principal, `Fecha` respaldo d/m/aaaa) y de estados (`GESTION` con trim/colapso de espacios/mayúsculas).
- KPIs: Total leads, Agendados, Inscritos, No contesta, Tasa de conversión, Mes récord (rejilla ampliada).
- Gráficos nuevos: Estados por mes (barras apiladas), Campañas por mes (barras apiladas, top 5), Embudo de conversión (recibidos → gestionados → agendados → inscritos).
- Conservar los 5 gráficos existentes.
- Tabla mensual: añadir columna "No contesta" y botón de exportación CSV del resumen mensual.

## Restricciones

- Sin React, sin nuevas dependencias: solo Chart.js ya incluido.
- Sin migraciones SQL ni cambios en Supabase/RPCs.
- Todo en `index.html` (y este documento).
- Trabajo con 5.810 leads en máquina de 8 GB: agregación en memoria, un solo recorrido por lead donde sea posible.

## No romper

- Pestaña Leads, filtros, CRUD, roles (agente/admin), archivado, login por contraseña, Realtime.
- `exportCurrentLeadsCSV()` y su botón existentes.
- Filtros y gráficos existentes de históricos (`histFilterCampana`, `histFilterAgente`, los 5 canvases).
- Contrato de `getField()`, `MONTH_CHRONO`, `histCharts`, `renderHistoricalAnalytics()`.
- `npm run build` y `npm run lint` deben seguir pasando.

## TDD

- Modo: off
- Fuente: proyecto (no hay runner de tests; solo build y lint)
- Runner: no disponible (`npm test` no existe)

## Tareas

- [x] T1: Normalización de mes/estado, filtro de Mes y KPIs ampliados (HTML + JS).
- [x] T2: Gráficos nuevos: estados por mes, campañas por mes y embudo de conversión.
- [x] T3: Tabla mensual con columna "No contesta" y exportación CSV del resumen.
- [x] T4: Verificación global (build, lint, diff check, qa-gate) y cierre.

## Criterios de aceptación

- [ ] El filtro de Mes lista solo los meses con datos y filtra KPIs, gráficos y tabla.
- [ ] Meses mal escritos o vacíos en `Mes` caen a `Fecha` (d/m/aaaa); si no hay mes, van a "OTRO".
- [ ] KPIs muestran Total, Agendados, Inscritos, No contesta, Conversión y Mes récord.
- [ ] Existe gráfico de estados por mes, campañas por mes y embudo.
- [ ] La tabla mensual incluye "No contesta" y un botón que descarga CSV del resumen.
- [ ] Los 5 gráficos y filtros existentes siguen funcionando igual.
- [ ] `npm run build`, `npm run lint`, `git diff --check` y qa-gate pasan.

## Decisiones aceptadas

- Fase 1 solo con datos de `leads`; la tabla `campaign_metrics` (gasto, alcance, pagos) queda para Fase 2.
- El filtro de Mes aplica a todo el panel de históricos de forma uniforme (drill-down); "Todos los Meses" restaura la vista completa.
- Formato de fecha de respaldo d/m/aaaa (confirmado con datos reales: "13/8/2026").
- "Gestionado" en el embudo = `GESTION` distinto de vacío, "Información" o "Interesado" (estados iniciales).
- Sin nuevas librerías ni tablas SQL.

## Reutilización investigada

- `renderHistoricalAnalytics()`, `populateHistoricalFilterOptions()`, `MONTH_CHRONO`, `getField()` y `exportCurrentLeadsCSV()` ya existen en `index.html`; se reutilizan y extienden.
- Patrón de export CSV ya canónico en el proyecto (data URI + BOM) se reutiliza para la tabla mensual.
- Chart.js ya cargado por CDN; se destruyen instancias previas en `histCharts` antes de recrear.

## Evidencia

- T1: passed — worker ses_f2e76ad48ffe9stpX0ifUWCSYd + verificador odd-verifier; checks: npm run build OK, npm run lint OK, git diff --check OK (ambos subagentes)
- T2: passed — worker ses_f2e728701ffem2xaCbRhrBatW1 + verificador odd-verifier; checks: npm run build OK, npm run lint OK, git diff --check OK (ambos subagentes)
- T3: passed — worker ses_f2e68fc3effe4A9UN4DdsnkNhh + verificador odd-verifier; checks: npm run build OK, npm run lint OK, git diff --check OK (ambos subagentes). Observación no bloqueante del verificador: exportHistoricalSummaryCSV() duplica ~40 líneas de agregación de renderHistoricalAnalytics(); no expande alcance.
- T4: passed — comando `npm run build && npm run lint && git diff --check && qa-gate` → exit 0 (build 153.14 kB, lint sin errores, qa-gate solo aviso preexistente de .env.example plantilla)

## Observaciones futuras

- Unificar la agregación mensual duplicada: exportHistoricalSummaryCSV() repite ~40 líneas del bloque de agregación de renderHistoricalAnalytics(). Extraer una función común que calcule monthlyStats/activeMonths y reutilizarla en ambos sitios. Registrado por el verificador de T3; no bloquea.

## Progreso

- Estado: Fase 1 completa (T1-T4 passed); pendiente de prueba manual en navegador y de commit/push cuando el humano lo pida
- Última tarea: T4 verificada
- Siguiente paso: prueba manual con datos reales (rol agente y admin); Fase 2 (campaign_metrics) pendiente de autorización
- Bloqueos: ninguno

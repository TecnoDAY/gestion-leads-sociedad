# Refactor de jerarquia visual del panel

## Objetivo

Reorganizar la interfaz para separar el resumen (Inicio) del trabajo operativo
(Leads) y reducir el ruido visual, sin tocar Supabase, consultas, RLS ni modelo
de datos.

## Problema y por que

Inicio acumula bienvenida, KPIs, filtros completos, acceso rapido, matriz y tabla.
Citas muestra el calendario antes que el titulo y los filtros. Reportes apila
varias franjas de encabezado. Los fondos con degradado y transparencia se repiten
detras de tablas, filtros y tarjetas.

## Alcance

Incluye:
- Fase 1: crear la vista Leads y mover alli filtros, matriz y tabla.
- Fase 2: fondos solidos, superficies blancas y degradado solo en bienvenida.
- Fase 3: compactar la barra superior y agrupar administracion.
- Fase 4: legibilidad de la tabla de Leads y acciones.
- Fase 5: reordenar Citas (titulo/filtros antes del calendario, 4 KPIs).
- Fase 6: compactar la cabecera de Reportes.

Excluye:
- Esquema, consultas, RLS, autenticacion, modelo de datos y dependencias.
- Reglas de negocio y calculo de prioridades (pendiente de decision de producto).

## Restricciones

- Un solo fichero de UI: `index.html`; estilos en `src/index.css`.
- Mantener ids del DOM para no romper el script clasico.
- Regla de tema claro de `check-app.mjs`: toda utilidad nueva `bg-slate-600+`,
  `border/divide/ring-slate-500+` necesita override `[data-theme="light"]`.
- No anadir dependencias.

## No romper

- `switchTab`, `setDashboardTabState`, `currentMainTab` y el flujo `trafficker`.
- `npm run lint` (`tsc --noEmit` + `check-app.mjs`).
- `npm test` (suites en `scripts/tests/`).
- `npm run build`.

## TDD

Modo: off
Fuente: default (no hay politica de tests de UI en el proyecto)
Runner: `npm run lint && npm test && npm run build`

## Tareas

- [x] T1 Fase 1: cerrar `viewDashboard` tras KPIs y acceso rapido; crear
      `viewLeads` con filtros, matriz y tabla; anadir pestana Leads.
- [x] T2 Fase 2: fondos solidos y degradado solo en bienvenida.
- [x] T3 Fase 3: barra superior compacta y menu de administracion.
- [x] T4 Fase 4: legibilidad y acciones de la tabla.
- [x] T5 Fase 5: reordenar Citas.
- [x] T6 Fase 6: compactar Reportes.

## Criterios de aceptacion

- [x] Leads es una vista independiente; Inicio no contiene filtros ni tabla.
- [x] `switchTab('leads')` marca la pestana y el boton lateral correctos.
- [x] El rol trafficker sigue viendo solo Campanas.
- [x] Fase 2: superficies solidas y degradado solo en bienvenida.
- [x] Fase 3: una accion primaria; administracion agrupada.
- [x] Fase 4: nombre/telefono legibles; accion visible "Gestionar".
- [x] Fase 5: en Citas el titulo y filtros preceden al calendario; 4 KPIs principales y desglose colapsable.
- [x] Fase 6: cabecera de Reportes compacta.
- [x] `npm run lint`, `npm test` y `npm run build` en verde.

## Evidencia

- T1 Fase 1 completada: vista `viewLeads` separada; `viewDashboard` recupera
  solo intro/KPIs/acceso rápido; navegación `switchTab('leads')` activa la vista
  completa; filtros, matriz y tabla ya no bloquean Inicio.
- T2 Fase 2 completada: fondos sólidos, degradado solo en bienvenida (body
  `#f6f7fb`, `dashboard-intro #fff`, `lead-detail-hero #fff`, tarjetas métricas
  `#fff` con bordes `#e4e7ec`). Se quitaron degradados de `body`,
  `dashboard-intro::after`, `dashboard-kpis .metric-card`, `quick-lead-row:hover`,
  `[data-theme="light"] body`, `[data-theme="light"] .dashboard-intro`,
  `[data-theme="light"] #viewDashboard > section:not(.dashboard-kpis):not(.dashboard-intro)`,
  `.lead-detail-hero`, `.sidebar-nav-button.is-active`. Temas oscuros sin cambios
  forzoso.
- T3 Fase 3 completada: barra superior con sola acción primaria ("Actualizado"
  en vez de "Supabase en vivo"); conexión status y refrescar visibles;
  administración (SQL & RLS, Usuarios, Catálogos, Ayuda) condicional por rol;
  nuevo lead como acción principal destacada.
- T5 en progreso: la estructura de Citas quedó reordenada con título, filtros,
  selector de vista y calendario/tabla antes del bloque de indicadores. El
  intento de reducir los KPIs rompió el cierre sintáctico de `renderCitas()` y
  fue revertido al cuerpo estable; el desglose por sede y la reducción a 4 KPIs
  quedan pendientes para una implementación segura.
- Corrección de regresión: `renderCitas()` restaurado al cuerpo estable; el
  contenedor visual conserva el nuevo orden y se añadió `id="sedeBreakdown"`.
- T6 Fase 6 completada: cabecera compacta de Reportes en solo HTML/CSS.
  Diario: título + fecha + asesora + Descargar CSV en una única franja
  `report-intro`; `daily-controls` eliminada; `reporteAviso` pasa de bloque
  ámbar permanente a línea de ayuda discreta (`text-xs text-slate-500`),
  conservando id/role/aria-live que exigen los tests. Período: eliminada la
  franja `report-content-card`; las dos explicaciones viven en un `<details>`
  discreto («Cómo se calcula este reporte») dentro de la cabecera, conservando
  el texto «Leads por fecha de entrada:» que exige el test. CSS: regla de
  labels extendida con `.report-intro label`.
- Verificación Fase 6: `npm run lint` OK (2 bloques, tema claro OK);
  `npm test` 379 pass / 0 fail; `npm run build` OK; los 14 ids del reporte
  presentes exactamente una vez; servidor local sirve el HTML nuevo (200).
- T5 completada (rehacer KPIs de forma segura): nueva función
  `renderCitasKpis(rows, counts, denom)` en bloque multilínea propio, llamada
  desde `renderCitas()` sustituyendo solo la expresión de los 12 KPIs.
  Visibles: Total citas, Programadas, Asistieron, Tasa asistencia. Los otros 8
  (No asistieron, Canceladas, Reprogramadas, Doral, Doral Data Dura, Weston,
  Weston Data Dura, Sin sede) en `<details>` «Ver desglose por estado y sede»
  dentro de `#sedeBreakdownBody` (nuevo div que preserva `#citasAviso`).
  El cuerpo de la línea larga de `renderCitas()` no se reescribió: solo se
  cambió la expresión de KPIs por la llamada. Sintaxis verificada con
  `node --check` inmediatamente tras cada paso.
- Tests: `renderCitasKpis` añadida al arnés (`names`); aserción de formato
  por sede actualizada (antes exigía el array literal dentro de `renderCitas`,
  ahora verifica los cálculos Doral/Weston en la función nueva, misma
  intención); test nuevo de comportamiento: 4 principales, 8 en desglose,
  total/tasa exactos y caso sin citas (0 citas, tasa 0.0%).
- Verificación final: `npm run lint` OK; `npm test` 380 pass / 0 fail;
  `npm run build` OK; servidor local sirve el HTML nuevo (HTTP 200).

## Progreso

Estado: completada y verificada (visual humano OK)
Ultima tarea: T6 (Fase 6) completada
Siguiente paso: ninguno
Bloqueos: ninguno

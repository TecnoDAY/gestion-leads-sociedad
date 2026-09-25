# Barra de pestañas (segmented) + tema claro

## Objetivo
Barra de navegación con píldoras de grupo limpio, meta de estado a la derecha, y modo claro alternable persistente, sin tocar datos ni lógica.

## Problema y por qué
La barra actual solo resalta la pestaña activa con fondo suelto (el resto no se lee como grupo), la meta (`2026`, `TOTAL BD: 5812`) compite con la navegación, y la app solo tiene tema oscuro (decisión de usabilidad pedida por el humano; el layout comprimido sobre los KPIs).

## Alcance
- **T1 Barra (6 puntos):** segmented control para las 3 píldoras (activa con fondo, inactivas fantasma); badges micro tenues dentro de su píldora; `TOTAL BD` movido a la derecha junto a `Histórico Sociedad Actoral` con divisor; más aire vertical; `overflow-x-auto` en móvil; pestañas a la izquierda (aceptado).
- **T2 Tema claro:** atributo `data-theme` en raíz + bloque `<style>` que remapea SOLO la paleta slate/indigo usada (inventario previo por grep, sin tocar el marcado); botón sol/luna en cabecera con persistencia `localStorage` (oscuro por defecto); repintado de Chart.js al cambiar; vista imprimible del reporte fuera del remapeo.

## Restricciones
- Solo `index.html`; sin dependencias; vanilla JS.
- Sin cambios en datos, RPCs, agregados, migraciones ni permisos.
- Nunca commit/push sin petición explícita.

## No romper
- `switchTab`/`setDashboardTabState` (reset de sesión, reglas del ODD reporte-diario).
- Paleta de gráficos en modo oscuro (los charts existentes deben seguir idénticos).
- Vista imprimible del reporte diario (debe seguir clara).
- Permisos y visibilidad de pestañas (Reporte sigue visible solo donde corresponde).

## TDD
Modo: off | Fuente: default | Runner: no disponible (sin runner; checks funcionales obligatorios + revisión visual del humano en ambos temas).

## Tareas
- [x] T1 barra segmented + meta derecha + móvil
- [x] T2 tema claro con toggle + Chart.js + persistencia
- [x] T3 verificación e informe

## Criterios de aceptación
- [ ] Las 3 píldoras se leen como un grupo; badges sutiles; meta de estado a la derecha con divisor.
- [ ] En móvil la barra desliza sin romper el layout.
- [ ] Toggle claro/oscuro persiste tras recarga; oscuro por defecto en navegador nuevo.
- [ ] Gráficos legibles en ambos temas (Chart.js repintado).
- [ ] Vista imprimible del reporte sigue clara.
- [ ] build/lint/diff-check/node-check/qa-gate verdes + revisión visual del humano.

## Decisiones aceptadas
- Pestañas a la izquierda (derecha descartada por convención F y posición de estado); pestaña derecha queda para estado/meta.
- Capa `data-theme` + remapeo de paleta sobre variables fijas de Tailwind (descartado: clase por clase con `dark:`, migración a variables CSS, hoja externa, `filter: invert`, preferencia en BD).
- `localStorage` para persistencia (descartado: BD + migración para un gusto visual).
- Tema oscuro sigue siendo defecto; claro solo manual.

## Reutilización investigada
- `switchTab`/`setDashboardTabState` (index.html ~1456-1500) como contrato de pestañas a no romper.
- Patrón de botones cabecera (`btnAdminUsers`, `btnCatalogs`) para el botón tema.
- Chart.js charts en `histCharts` (destroy/repaint) como punto de repintado al cambiar tema.
- Inventario de paleta: grep de `slate-|indigo-|emerald-|amber-` en index.html para acotar el remapeo.

## Evidencia
- T1 implementada en `index.html`: grupo segmented con estado activo/inactivo, meta separada a la derecha, badges micro, aire vertical y desplazamiento horizontal móvil.
- Verificación: `npm run build`, `npm run lint`, `git diff --check`, `node --check` de scripts inline y `bash ~/.config/opencode/scripts/qa-gate.sh` ejecutados correctamente.

## Progreso
- Estado: implementación completa y verificada en local (T1-T3 passed).
- Última tarea: T3.
- Siguiente paso: revisión visual del humano en ambos temas (toggle, captura del reporte, móvil); commit cuando lo pida.
- Bloqueos: revisión visual; commit/push pendiente de petición explícita.

## Evidencia T2
- `index.html`: remapeo claro acotado al inventario Tailwind ejecutado, toggle persistente `tema-dashboard`, y repintado de charts activos mediante `updateChartTheme`; se eliminó la variable muerta de `switchTab`.
- Reapertura: el verificador detectó que `.glass-card` y superficies oscuras con opacidades (`bg-slate-950/*`, `bg-slate-900/50`) conservaban fondos oscuros con texto claro; se añadieron remapeos claros y se sincronizó el icono persistido del tema antes de crear Lucide.
- Contraste WCAG calculado (fondo claro / texto remapeado):
  - `#ffffff` (glass-card efectivo): `#0f172a` 17.85:1, `#334155` 10.35:1, `#475569` 7.58:1, `#4338ca` 7.90:1, `#047857` 5.48:1, `#b45309` 5.02:1, `#be123c` 6.29:1.
  - `#f1f5f9` (tfoot y tarjetas detalle): `#0f172a` 16.30:1, `#334155` 9.45:1, `#475569` 6.92:1, `#4338ca` 7.21:1, `#047857` 5.01:1, `#b45309` 4.58:1, `#be123c` 5.74:1.
  - `rgba(255,255,255,.92)` (overlays; sobre fondo claro, conservadoramente evaluado como blanco): mismos mínimos superiores a 4.5:1; el mínimo medido fue `#047857` 5.48:1.
- Verificación ejecutada: `npm run build` OK, `npm run lint` OK, `git diff --check` OK, `node --check` de los 7 scripts inline OK. `bash ~/.config/opencode/scripts/qa-gate.sh` bloqueado por el hallazgo preexistente `.env.example` como fichero sensible.
- 2ª reapertura T2: se completó el remapeo sistemático de superficies slate, hovers, `text-white` y fondos indigo/emerald/amber usados; los primarios light usan `#4338ca` con texto blanco (7.90:1).
- Script `/tmp/check_t2.py`: `inventario diferencia: vacía`; ratios: thead leads 6.92:1, paginación 8.40:1, badge 6.97:1, botón Cancelar 12.02:1, píldora activa 7.90:1, hover de fila 9.45:1 (todos OK).
- Verificación 2ª reapertura: build OK, lint OK, diff-check OK, 7 scripts inline OK; qa-gate bloqueado únicamente por `.env.example` preexistente.
- 3ª y 4ª reaperturas (verificador, ratios propios): compuestos `bg-amber-600.text-white` (5.02:1), variantes alfa `text-*/80` y `text-amber-300/90` (≥4.64:1), `text-indigo-200` (6.41:1), 7/7 `hover:text-*` cubiertos; luego badges `text-blue-300`/`text-purple-300` (1.51/1.54:1 → 5.44/5.66:1), `text-blue-400` de conexión (2.43:1 → ≥4.5) y badges pequeños en modal (3.72-4.27 → ≥4.5).
- 5ª ronda del verificador no respondió (rate-limit); cierre con verificación propia del padre: inventario integral de 35 clases `text-<color>-<nn>` + `hover:text-*` usadas vs reglas `[data-theme="light"]` → 0 sin cubrir (6 justificadas: 3 chips de toast con fondo `-950` no remapeado ≥9.9:1, `text-amber-800`/`text-indigo-900` en la hoja blanca excluida del reporte, `text-purple-400` icono decorativo con rótulo).
- T3 suite final: build 208.30 kB OK, lint OK, `git diff --check` OK, `node --check` 3/3 OK, 0 `getElementById` sin id, qa-gate sin hallazgos nuevos. Único fichero modificado: `index.html`.

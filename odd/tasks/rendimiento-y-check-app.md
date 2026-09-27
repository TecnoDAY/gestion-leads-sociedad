# Rendimiento de filtros + check de la app (A+B)

Fecha: 2026-09-26 · Estado: implementando · Origen: plan A+B aprobado por el humano tras Plan mode.

## Objetivo
Reducir el trabajo por tecla del buscador de leads (A) y añadir una guarda automatica de sintaxis/regresion del monolito (B).

## Problema y por que
- A: `oninput="applyFilters()"` dispara por cada tecla: filtro de 5.815 leads + `updateKpis()` + `renderMatrix()` + `renderTable()` (dos rebuilds de innerHTML). Cero debounce.
- B: `npm run lint` es `tsc --noEmit` sobre la plantilla React y no revisa `index.html`; `vite build` tampoco parsea el script en linea. Un error de sintaxis en el monolito llegaria a produccion (ya ocurrio una llave huerfana en esta sesion, cazada a mano).

## Alcance
- A: `index.html` L329 (`oninput` -> `scheduleApplyFilters()`), funcion `scheduleApplyFilters` + cancelacion del timer pendiente al inicio de `applyFilters`.
- B: `scripts/check-app.mjs` nuevo (sin dependencias): `node --check` de los 3 bloques `<script>` en linea (cada uno por separado) + greps anti-regresion (`onclick="filterFromMatrix(`, catch vacio) + ruta opcional por argumento para autotest.
- `package.json`: anadir `check:app` y encadenarlo en `lint`.

## Restricciones
- Sin dependencias nuevas; B usa solo Node stdlib.
- Los 4 selects `onchange` y las ~10 llamadas internas a `applyFilters()` siguen inmediatas.
- No tocar el trabajo del humano sin commitear (`odd/tasks/citas-asistencia.md`, `supabase/migrations/202609250004_*`).

## No romper
- Comportamiento visible identico: filtros, matriz con delegacion de clics, paginacion, KPIs.
- No saltar `renderMatrix` (riesgo de desfase tras recarga de datos: decision ya tomada).
- No escanear secretos en check-app (lo cubre qa-gate; escaneo generico = falsos positivos).

## TDD
- Modo: off · Fuente: default · Runner: no hay harness para el monolito; los checks funcionales obligatorios son `npm run check:app` (verde), autotest con copia rota (debe fallar), `npm run build`, `npm run lint`, `git diff --check`.

## Tareas
- [x] T1: debounce del buscador (A).
- [x] T2: `scripts/check-app.mjs` + wiring en `package.json` (B).
- [x] T3: verificacion completa (bateria acordada) y evidencia.

## Criterios de aceptacion
- [ ] Escribir en el buscador produce una sola actualizacion tras pausa de 200 ms; selects y clic de matriz siguen inmediatos. **(pendiente: prueba manual del humano en `npm run dev`)**
- [x] `npm run check:app` verde sobre el codigo actual.
- [x] Con copia rota en `/tmp/opencode/` (llave eliminada), `node scripts/check-app.mjs <copia>` falla con error de sintaxis claro.
- [x] `npm run build`, `npm run lint` y `git diff --check` en verde.

## Decisiones aceptadas
- Debounce 200 ms, timer global `filterDebounceTimer` (monolito ya maneja ~47 globales; legible > ingenioso).
- Cancelar el timer pendiente dentro de `applyFilters()` para que una llamada inmediata no repinte 200 ms despues.
- Los 3 bloques inline se comprueban por separado (concatenados darian falsos positivos por redeclaracion).

## Reutilizacion investigada
- `qa-gate` (~/.config/opencode/scripts) cubre secretos y patrones de riesgo en diff staged; no sintaxis del inline HTML.
- `npm run lint`/`build` no validan el script embebido. No hay de donde reutilizar: script propio minimo. Alternativas descartadas: eslint/htmlhint o plugin vite (dependencias nuevas, fuera de YAGNI).

## Evidencia
- T1: grep `scheduleApplyFilters` = 2 (handler L329 + definicion), `oninput="scheduleApplyFilters()"` = 1, `clearTimeout(filterDebounceTimer)` = 2 (schedule + cancelacion inmediata en applyFilters).
- T2: `npm run check:app` -> `bloque #1 OK (23 lineas)`, `#2 OK (6)`, `#3 OK (3233)`, `OK (3 bloques, 2 reglas)`, exit 0.
- Autotest: copia con la llave de `scheduleApplyFilters` borrada -> `check-app` detecta el error de sintaxis en el bloque #3 y sale con exit 1.
- T3: `npm run build` OK (211 ms), `npm run lint` OK (incluye ahora check-app), `git diff --check` limpio.
- Trabajo del humano intacto: `odd/tasks/citas-asistencia.md` y `supabase/migrations/202609250004_*` sin tocar ni commitear.

## Progreso
- Estado: implementado y verificado en automatico. Pendiente: prueba manual del humano en `npm run dev` (tecleo con pausa, selects, matriz) y decision sobre los 2 commits atomicos propuestos (`perf: debounce lead search filter`; `chore: check inline scripts syntax and regressions` incluyendo el doc ODD). Sin commit/push sin peticion explicita.

# Visual Refresh (tema claro/oscuro, legibilidad)

## Objetivo

Mejorar la visualización de la app: que el modo claro y el modo oscuro se vean
correctos y consistentes, y que la tipografía y los estados de foco sean más
legibles, sin rediseñar la marca ni añadir dependencias.

## Problema y por qué

El modo claro no se implementa reescribiendo Tailwind: añade ~50 sobrescrituras
puntuales bajo `[data-theme="light"]`. Ese diseño falla por **omisión**: toda
utilidad oscura añadida después sin su sobrescritura queda visible solo en modo
claro (borde/divisor/superficie oscuro sobre fondo blanco) y **sin ningún aviso**.

Verificado antes de tocar nada: se usaban 8 clases oscuras sin sobrescritura en
tablas y formularios reales (matriz, leads, histórico, citas, campañas).

Dos hallazgos adicionales verificados:
- 46 controles con `focus:outline-none` y **cero** `focus:ring` → foco de
  teclado invisible en 3 elementos (el resto sólo cambiaba el borde).
- 30 usos de `text-[10px]`, varios en etiquetas en mayúsculas (el peor caso de
  legibilidad).

Hallazgo que **no** era un fallo: `<html class="dark">` + `darkMode:'class'`
parecían una base de tema descincronizada. grep demostró que no existe ni una
sola clase `dark:` ni ningún selector `.dark` en el CSS → es código muerto sin
efecto visual. No se cambió (evitar churn).

## Alcance

Incluye:
- Completar las sobrescrituras que faltan del tema claro.
- Borde visible de los campos de formulario en modo claro.
- Anillo de foco visible al navegar con teclado.
- Subir `text-[10px]` → `text-[11px]` sólo donde el elemento no tiene tamaño fijo.
- Regla de regresión en `scripts/check-app.mjs` que convierta este fallo
  silencioso en error de build.

Excluye (decisión explícita):
- Cambio de fuente: se conserva Plus Jakarta Sans + JetBrains Mono (no hay
  evidencia de problema de lectura; sólo se redimensiona).
- Rediseño, nuevos colores de marca, dependencias nuevas.
- Cambiar el fondo blanco de `#reporteDiario` (es deliberado, con `!important`
  en ambos temas; probablemente por impresión).
- Cambiar el borde de tarjetas y botones (conservan el sutil actual). Sólo se
  tocan campos de formulario (ver "Decisiones aceptadas").
- Borrar el código muerto `class="dark"` / `darkMode:'class'`.

## Restricciones

- Sin commit, push, PR, merge ni deploy sin petición explícita.
- No tocar `odd/tasks/campanas.md` ni `supabase/migrations/202609290001_campaign_stats.sql`
  (cambios de documentación previos del usuario, sin commitear).
- No commitear `deno.lock` (untracked a propósito).
- Riesgo bajo-medio: cambio de UI, sin contrato público ni runtime crítico.

## No romper

- `npm run build` y `npm run lint` (`tsc --noEmit` + `check-app.mjs`) deben seguir en verde.
- Los 6 círculos `w-4 h-4` con `text-[10px]` deben seguir en 10px: subirlos
  desborda el número dentro de un contenedor de 16px.
- Los contrastes de texto ya válidos no deben empeorar (mínimo 4.5:1).
- `#reporteDiario` debe seguir forzado a blanco en ambos temas.
- Las sobrescrituras existentes del tema claro no deben eliminarse.

## TDD

- `Modo: off`
- `Fuente: default` (no hay política del proyecto ni instrucción del usuario ni valor previo)
- `Runner: npm run lint` (checks funcionales obligatorios) y `npm run build`
- Justificación: es CSS/HTML de un monolito sin framework de tests. La verificación
  funcional obligatoria es `check-app.mjs`, que incluye la regla nueva ejecutada
  en ambos sentidos (ver Evidencia).

## Tareas

### T1 — Verificar la base del tema
- **Estado: passed**
- Comando: `grep -n "\.dark" index.html` y `grep -n "dark:" index.html` → 0 resultados.
- Resultado: `darkMode:'class'` y `class="dark"` son código muerto, no un fallo
  visual. **Sin cambio.** La hipótesis inicial del plan era incorrecta y se corrigió.

### T2 — Auditoría de referencia
- **Estado: unavailable** (parte visual) / **passed** (parte programática)
- Comando visual: `browser.tabs.list()` → `[browser.disconnected]`. No hay
  navegador desktop conectado → no se pudieron tomar capturas ni medir en render.
- Comando programático: análisis de cobertura de clases (incrustado al final en
  `check-app.mjs`) → 8 clases oscuras sin sobrescritura en la versión previa.
- Resultado: diagnóstico por código, **no** por render. Pendiente de confirmación visual.

### T3 — Completar sobrescrituras del tema claro
- **Estado: passed**
- Cambios en `index.html` (bloque `[data-theme="light"]`):
  - `bg-slate-800/60`, `bg-slate-800/70` → `#e2e8f0` (tarjeta JS y fila total de campañas).
  - `border-slate-600`, `border-slate-600/60`, `border-slate-700/60` → `#cbd5e1` (filtros de Citas, badges, borde superior de filtros).
  - `divide-slate-800`, `divide-slate-800/80` → `#e2e8f0` con `!important` (5 `<tbody>`: matriz, leads, histórico, citas, campañas).
  - `hover:bg-slate-800/50` → `#f1f5f9` (fila de campaña al pasar el ratón).
- Comando: `node scripts/check-app.mjs` → `tema claro OK (74 sobrescrituras)`.

### T4 — Legibilidad tipográfica
- **Estado: passed**
- 24 de 30 usos de `text-[10px]` → `text-[11px]` (etiquetas en mayúsculas,
  badges, textos de ayuda). Los 6 con tamaño fijo `w-4 h-4` se conservaron.
- Comando: `grep -o 'text-\[10px\]' index.html | wc -l` → `6` (los fijos);
  `grep -o 'text-\[11px\]' index.html | wc -l` → `90` (66 previos + 24).

### T5 — Estados de foco de teclado
- **Estado: passed**
- Regla única añadida: `:focus-visible { outline: 2px solid #6366f1 !important; outline-offset: 2px !important; }`
- `!important` es necesario: gana al `focus:outline-none` de Tailwind
  (`.focus\:outline-none:focus` = especificidad 0,2,0 vs 0,1,0).
- No añade ruido: el único elemento con `focus:outline-none` sin indicador de
  borde que no es un control es `tabindex="-1"` (destino de salto), al que
  `:focus-visible` no aplica.
- Comando: contraste del anillo calculado → `4.47:1` sobre blanco (mín. no-texto 3:1).

### T6 — Regla de regresión en `check-app.mjs` *(tarea nueva por hallazgo)*
- **Estado: passed**
- Extrae las clases bajo `[data-theme="light"]` (desescapando `\:`, `\/` y
  descartando pseudoclases), escanea las utilidades usadas en HTML/JS y falla si
  falta una sobrescritura. Umbral: fondos neutros desde 600, bordes/divisores/anillos desde 500.
- Verificación en ambas direcciones (ver Evidencia).

### T7 — Verificación final *(tarea nueva por hallazgo)*
- **Estado: passed** salvo la comprobación visual, **unavailable**.

### T8 — Borde visible de campos de formulario *(tarea nueva: decisión del humano)*
- **Estado: passed**
- Origen: al medir contrastes salió que los campos en modo claro se distinguen
  casi sólo por un borde de **1.48:1** (WCAG 1.4.11 pide 3:1). El humano eligió
  "sólo campos de formulario" frente a oscurecer todos los bordes.
- Cambio: `[data-theme="light"] input, select, textarea { border-color: #94a3b8 !important; }`
  → **2.56:1** (un 73% más visible que las 1.48:1 originales).
- Verificado que **no hay** `<input type="button">` ni `<input type="submit">`
  (son `<button type=...>`), así que la regla no toca ningún botón.
- `!important` es necesario para ganar a `[data-theme="light"] .border-slate-600`
  (0,2,0). `#reporteDiario` conserva su `#cbd5e1` por su propia regla con
  `!important` y especificidad (1,1,1).
- Comando: `npm run build` → `308.03 kB`; `npm run lint` → exit 0.

## Criterios de aceptación

- [x] Ninguna utilidad oscura de fondo/borde/divisor sin sobrescritura en modo claro.
- [x] `check-app.mjs` falla si se reintroduce una (probado contra la versión previa).
- [x] Foco de teclado visible en todos los controles (regla global `:focus-visible`).
- [x] Ningún texto de etiqueta por debajo de 11px salvo los 6 contenedores fijos de 16px.
- [x] `npm run build` en verde.
- [x] `npm run lint` en verde.
- [x] `git diff --check` sin avisos.
- [x] Contrastes de texto verificados numéricamente en ambos modos (≥4.8:1).
- [x] Los campos de formulario en modo claro se distinguen del fondo (1.48:1 → 2.56:1).
- [x] Función de contraste validada contra valores de referencia (21.00, 4.54, 4.48, 1.00).
- [x] Que ningún botón haya cambiado de borde → análisis de los 46 `<input>`:
      0 con `type="button|submit"`, son todos `<button type=...>`.
- [ ] Confirmación visual en navegador de Panel, Histórico, Reporte y Campañas en
      ambos temas → **`unavailable`**: no hay navegador conectado.

## Decisiones aceptadas

- **Conservar Plus Jakarta Sans + JetBrains Mono.** No hay evidencia de un
  problema de lectura que justifique un cambio de fuente; sólo se redimensiona.
- **`!important` sólo en el override de `divide-*`.** Tailwind genera
  `.divide-x > :not([hidden]) ~ :not([hidden])` (0,3,0); mi selector da (0,4,0)
  y además se refuerza con `!important` porque no se pudo verificar en render.
  Los demás overrides ganan por especificidad normal, como los preexistentes.
- **Borde de campos de formulario a `#94a3b8`, sólo en modo claro; tarjetas y
  botones intactos.** Decisión del humano sobre el tradeoff (vs. oscurecer todos
  los bordes). Contraste medido con la función ya validada contra referencias
  (21.00, 4.54, 4.48): `#cbd5e1` = **1.48:1** → `#94a3b8` = **2.56:1**.
  - **Corrección de un dato erróneo:** al plantear la pregunta estimé `2.71:1` a
    mano; el valor real es **2.56:1**. También estimé `3.95:1` para `#64748b`
    cuando son **4.76:1**. Las dos cifras erróneas eran cálculos manuales, no
    salidos del script: todos los demás números del documento sí lo están.
  - **Queda pendiente:** `#94a3b8` (2.56:1) mejora mucho pero **no llega al 3:1**
    de WCAG 1.4.11. `#64748b` daría **4.76:1** y lo cumpliría de sobra, a cambio
    de un borde más marcado. Cambio de una línea si el humano lo prefiere.
  - En modo oscuro sigue en `#334155` sobre `#0f172a` = 1.68:1 (no tocado: el
    hallazgo se planteó para modo claro y no expande alcance por sí solo).
- **Umbral 600 para fondos, 500 para bordes/divisores.** `bg-slate-500` es un
  punto indicador de estado de 8px legítimo en ambos temas; marcarlo sería un
  falso positivo que bloquearía el build sin motivo.
- **Implementación inline, sin delegar a `odd-worker`.** Desviación del flujo
  ideal del punto 7 de la skill, asumida bajo la instrucción directa del usuario
  ("implementa el plan"). Se compensa encadenando verificación independiente.

## Reutilización investigada

- **`scripts/check-app.mjs` ya existía** con un bloque `REGRESSION_RULES` y con
  soporte de ruta argumento para autotest (`node scripts/check-app.mjs <ruta>`).
  → decisión: **añadir la regla ahí** en lugar de crear un script nuevo. Es donde
  ya corren los checks del repo (`npm run lint`) y el argumento de ruta permite
  probarla en rojo contra un fichero antiguo.
- Alternativas descartadas:
  - Script independiente en `scripts/` → duplicaría el runner y no se ejecutaría en `npm run lint`.
  - Pasar todo el theming a tokens CSS (`--surface`, `--border`…) → solución canónica
    y limpia, pero exige tocar cientos de usos en un monolito de 5115 líneas:
    fuera de alcance por YAGNI y por el riesgo de regresión sin verificación visual.
  - Parchear uno a uno los 3 focos invisibles → 3 soluciones inconsistentes frente
    a 1 regla global estándar.

## Evidencia

| Comando | Salida breve | Estado |
|---|---|---|
| `node scripts/check-app.mjs` (actual) | `tema claro OK (74 sobrescrituras, 1060 utilidades usadas)` / `OK (3 bloques, 2 reglas)` / exit 0 | passed |
| `node scripts/check-app.mjs /tmp/opencode/index-antes.html` (previa) | `regresion detectada -> tema claro sin sobrescritura para: bg-slate-800/60, bg-slate-800/70, border-slate-600, border-slate-600/60, border-slate-700/60, divide-slate-800, divide-slate-800/80, hover:bg-slate-800/50` / exit 1 | passed |
| `npm run build` | `dist/index.html 308.03 kB` / `built in 323ms` (con T8) | passed |
| `npm run lint` | `tsc --noEmit && check-app.mjs` exit 0 | passed |
| `git diff --check` | sin salida | passed |
| `grep -o 'text-\[10px\]' \| wc -l` | `6` (sólo los `w-4 h-4`) | passed |
| `grep -o 'text-\[11px\]' \| wc -l` | `90` | passed |
| `git diff index.html \| grep '^-.*10px'` / `'^+.*11px'` | `24` / `24` exactas; 0 líneas fuera de lo esperado | passed |
| balance de llaves del `<style>` | `60/60`, 0 reglas sin declaración | passed |
| validación de la función de contraste | 21.00 / 4.54 / 4.48 / 1.00 → todas exactas | passed |
| cálculo de contrastes | texto ≥4.8:1 en ambos modos; anillo foco 4.47:1 | passed |
| contraste de campo `#cbd5e1`→`#94a3b8` | `1.48:1` → `2.56:1` | passed |
| análisis de `<input type="button\|submit">` | `0` (son `<button>`) | passed |
| `browser.tabs.list()` | `[browser.disconnected]` | unavailable |

La prueba en rojo usa `/tmp/opencode/index-antes.html` (extraída con
`git show HEAD:index.html`), no reproducible tras confirmar. La comprobación
duradera es la propia regla de `check-app.mjs`.

## Progreso

- **Estado:** implementación completada y verificada por código (T1-T8).
- **Última tarea:** T8.
- **Siguiente paso:** (a) decisión sobre el borde de campo: ¿se queda `#94a3b8`
  (2.56:1, lo aplicado) o subir a `#64748b` (4.76:1, cumple WCAG 1.4.11)? — es un
  cambio de una línea; (b) confirmación visual en navegador, que es lo único que
  deja T2/T7 en `unavailable`.
- **Bloqueos:** sin navegador conectado → no hay verificación visual de render.
- **Pendiente fuera de este documento:** crear el usuario `trafficker` en
  `user_access` y decidir el push de los commits locales.

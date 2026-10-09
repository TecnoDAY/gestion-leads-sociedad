# Feature: ayudas contextuales (tooltips) y leyendas visibles en el Reporte por período

## Objetivo
Que cualquier persona entienda las dos cifras del cuadro "Gestiones por estado" y el
significado de cada bloque del Reporte por período, sin cambiar ningún cálculo ni
ningún endpoint.

## Problema y por que
- Evidencia: en el cuadro final aparecen dos columnas sin encabezado (81 / 134) y el
  usuario no sabía qué era cada cifra (conversación 2026-10-09).
- Segundo problema: los mensajes flotantes por sí solos no se descubren en móvil
  (no existe hover) ni con teclado, y un `title` del navegador se muestra tarde y sin
  estilo. Por eso la solución es **leyenda visible siempre + tooltip accesible**.
- Alcance mínimo: renombrar "Eventos" a "Total de gestiones" (pantalla y CSV), añadir
  una nota visible bajo "Gestiones por estado" y añadir iconos de información con
  explicación en los encabezados/bloques ambiguos.

## Alcance
Incluye (solo `index.html` + su suite de tests):
1. CSS de tooltip (`.periodo-tip*`) en el bloque `<style>` existente: puro CSS, sin
   dependencias ni JS nuevo de estado. Visible con `:hover`, `:focus-within` (teclado)
   y `:active` (toque móvil). Clampeado con `max-width: min(15rem, calc(100vw - 1.5rem))`
   para no salirse de la pantalla en móvil.
2. Helper `periodoTip(key)` en JS: devuelve el markup del botón + panel desde una tabla
   interna de textos; clave desconocida devuelve `''` (nunca rompe el render).
3. Cabecera estática: dos leyendas visibles ("Leads por fecha de entrada" vs
   "Actividad realizada en el período").
4. Tooltips en `renderReportePeriodo`: títulos de los 3 resúmenes y de la matriz, y en
   las columnas "Leads" y "%".
5. Tooltips en `renderPeriodoActividad`: títulos Gestiones / Canales / Citas, y en
   "Normal / DD". El cuadro final pasa a tener encabezado `Estado | Leads únicos ⓘ |
   Total de gestiones ⓘ` más nota visible.
6. CSV: `row(['Estado','Leads únicos','Eventos'])` → `['Estado','Leads únicos',
   'Total de gestiones']`.

Excluye: tocar SQL, RPCs, `buildPeriodSummary`, `validatePeriodo*`, conteos, cohorte,
diario, paleta de colores del tema, dependencias nuevas, modal de ayuda HELP_SECTIONS.

## Restricciones
- Cifras, fórmulas, orden y semántica de `por_estado`, `medios`, `campanas`,
  `gestiones`, `matriz`, `canales`, `citas` intactas.
- Sin `console.log` de depuración; sin TODO/FIXME; sin secretos.
- Colores nuevos limitados a clases ya cubiertas por `[data-theme="light"]` en el
  `<style>` (regla de `scripts/check-app.mjs`): `bg-slate-900`, `text-white`,
  `border-slate-600`. Los tonos del tooltip viven en CSS plano, no en utilidades.
- No introducir `<section>` extra dentro de `#periodoBody` (hay un test que cuenta 4).
- Textos en español con acento, coherentes con el resto del archivo.

## No romper
- `npm test` completo (Node + Python) y `npm run lint` (tsc --noEmit + check-app).
- `scripts/check-app.mjs`: sin `catch {}` vacío y sin utilidad de tema claro sin
  sobrescritura.
- Tests existentes de `periodoBody` (4 `<section>`), de `periodoAviso`, de CSV
  (cabecera `TOTAL` x4, `"AGENDADO","2","2"`, bloqueo de export sin actividad) y los
  de presets/invalidación.
- `escapeHtml` / `escapeAttr` siguen siendo la via de escape canónica.

## TDD
Modo: off (default). Checks funcionales obligatorios.
Runner: `npm test` (Node + Python) y `npm run lint`.
Fuente: default.

## Tareas
- [x] T1 Infra CSS del tooltip + helper `periodoTip` + leyendas en cabecera estática.
- [x] T2 Tooltips en la cohorte (`renderReportePeriodo`).
- [x] T3 Tooltips y encabezados en actividad (`renderPeriodoActividad`).
- [x] T4 CSV: "Eventos" → "Total de gestiones".
- [x] T5 Tests nuevos/actualizados + suite íntegra + lint + build + `diff --check`.
- [x] T6 Registro de incidencias y su resolución (ver sección Errores).

## Criterios de aceptacion
- [x] El cuadro final muestra `Estado | Leads únicos | Total de gestiones` con ⓘ en las
      dos últimas y una nota visible que explica que los leads únicos no se suman.
      (index.html:5989-5990)
- [x] Aparece ⓘ en cada uno de: 3 resúmenes de entrada, matriz, Gestiones, Canales,
      Citas y las dos cabeceras del cuadro final (más `actividad` en el h2 y `dd` en
      las filas de sede): 14 claves distintas, 9 tooltips en actividad, 6+ en cohorte.
- [x] El tooltip se abre con `:hover`, con foco de teclado (`Tab`) y con toque
      (index.html:136; `max-width: min(15rem, calc(100vw - 1.5rem))` para móvil).
- [x] `"Eventos"` deja de existir en pantalla y en CSV (`grep "Eventos"` → 0);
      `Total de gestiones` aparece en ambos; `Leads únicos` sigue en ambos.
- [x] Conteos idénticos: `"AGENDADO","2","2"`, 4 `TOTAL`, matrices y cohorte sin cambios.
- [x] `#periodoBody` sigue teniendo 4 `<section>` (el cuadro de actividad se renderiza
      en `#periodoActividad`, separado).
- [x] Suite completa verde + lint + build + `git diff --check` limpio.

## Decisiones aceptadas
- Híbrido: leyenda visible SIEMPRE + tooltip solo como ayuda (falla el enfoque
  "solo tooltip": invisible en móvil).
- Tooltip en CSS puro antes que `title` (nativo, tardío, no estilable) o modal de ayuda
  (sale del contexto, excesivo para una definición de línea).
- Un solo helper `periodoTip` con textos centralizados: añadir una ayuda nueva es una
  línea, no markup repetido en 6 sitios.
- Renombrar "Eventos" por "Total de gestiones" también en CSV: el CSV se abre en Sheets
  y sufre la misma ambigüedad.

## Reutilizacion investigada
- `escapeHtml` / `escapeAttr` (index.html ~5000/5010): reutilizados, son la via canónica.
- Patrón de botón `?` de ayuda existente (`openHelpModal`, cabecera del reporte diario
  y formularios): se reutiliza la forma visual (chip circular pequeño) pero NO el modal,
  porque abre un diálogo completo para una definición de línea.
- `renderReportePeriodo` / `renderPeriodoActividad`: se modifican in situ; no se crean
  renderers paralelos.
- Alternativas descartadas: `title` nativo; librería de tooltips (dependencia nueva);
  modal de ayuda; `<details>` inline (no funciona en encabezados de columna).
- `check-app.mjs` regla de tema claro: cumplida con clases ya cubiertas; los colores
  nuevos del tooltip viven en el bloque `<style>`.

## Errores
| # | Síntoma | Causa | Corrección | Estado |
|---|---------|-------|-----------|--------|
| 1 | Suite roja tras T2: 4 tests de `loadReportePeriodo` fallaban con `periodoLoadedKey` vacío y `periodoLoadedRevision` en `-1`; el aviso mostraba el mensaje genérico de error | `renderReportePeriodo` llama al helper nuevo `periodoTip`, pero los extractores de `t5-frontend-edge.test.mjs` y `session-isolation.test.mjs` solo cargan en la VM las funciones listadas en `names`: `periodoTip` no estaba, así que el render lanzaba `ReferenceError` y el `catch` de `loadReportePeriodo` vaciaba el reporte | Añadir `'periodoTip'` al array `names` de ambos ficheros de test | corregido: 106/106 pass |
| 2 | Tooltip `canales` decía "se contan aparte" (error de redacción/concordancia) | Texto escrito a mano en la tabla de `periodoTip` | Corregido a "se cuentan aparte" y a "realizadas por cada canal" | corregido |
| 3 | Diagnóstico incompleto del worker en T2 | El worker reportó el síntoma (fallo de aserción de invalidación) pero no la causa raíz; el registro inicial decía "fuera de alcance de T2" | Diagnóstico real obtenido leyendo la salida real de los tests y el `names` de los extractores | corregido |
| 4 | **Regresión de cifra introducida por el padre** (detectada por `odd-verifier`): la fila `Weston: programadas Data Dura` del CSV exportaba `ca.westona_placeholder` (identificador inexistente → `undefined` → celda vacía en el CSV en vez de `0`) | Al reindentar el bloque del CSV, el padre pegó una línea con un nombre de variable inventado en lugar de `ca.weston_data_dura`. La suite NO lo detectó porque ningún test afirmaba ese valor | Restaurado `ca.weston_data_dura`; añadidas aserciones explícitas sobre `"Weston: programadas normales","2"`, `"Weston: programadas Data Dura","0"` y contra la celda vacía | corregido y blindado |
| 5 | Aserción de control demasiado amplia (`doesNotMatch(csv, /,\s*"/)`) que fallaba en filas legítimas del CSV | Patrón genérico que casaba también con separadores de campo válidos | Acotada a `"Weston: programadas (normales|Data Dura)",""` | corregido |
| 6 | Desalineación de indentación (7 y 9 espacios) en bloques reescritos de `index.html` | Copiado/pegado de bloques largos de una línea | Reindentada para dejar el diff mínimo y legible | corregido |

Lecciones aplicadas:
1. Al añadir un helper nuevo al `<script>` hay que registrarlo en TODOS los extractores que lo usan antes de declarar verde la suite.
2. **Toda fila renombrada del CSV necesita una aserción con su cifra**, no solo con su etiqueta: la regresión de #4 era invisible con solo afirmar el texto.
3. Un rename/reescritura de línea larga exige releer el diff completo línea a línea: el depurador de tipo de `verifier` cazó lo que la suite (y el padre) no vieron.

## Evidencia
- T1: `node scripts/check-app.mjs index.html` → `check-app: OK (3 bloques, 2 reglas)`, `tema claro OK (76 sobrescrituras, 1239 utilidades usadas)`; `git diff --check` limpio.
- T2: `node scripts/check-app.mjs index.html` → OK; `git diff --check` → limpio; `node --test scripts/tests/t5-frontend-edge.test.mjs` → **106 pass / 0 fail** (tras corregir el error #1).
- Sin `console.log` ni TODO añadidos: `git diff` solo toca CSS, leyendas, `periodoTip`, `renderReportePeriodo`, `renderPeriodoActividad`, el CSV y los arrays `names`.
- T3: `node scripts/check-app.mjs index.html` → OK; `git diff --check` → limpio; `node --test scripts/tests/t5-frontend-edge.test.mjs` → 106 pass / 0 fail. Se modificó únicamente `renderPeriodoActividad` (tooltips, `rowTip`, encabezados y nota visible); sin cambios de cifras, cálculos ni orden.
- T4: `node scripts/check-app.mjs index.html` → OK; `git diff --check` → limpio; 106 pass / 0 fail. En `exportReportePeriodoCSV`: cabecera renombrada, nota explicativa añadida, etiquetas de agenda y canales aclaradas; claves y cifras intactas.
- T5: `node --test scripts/tests/t5-frontend-edge.test.mjs` → 107 pass / 0 fail; `npm test` → **245 Node pass / 0 fail + 11 Python OK**; `npm run lint` → `tsc --noEmit` limpio + `check-app: OK (3 bloques, 2 reglas)`; `npm run build` → `dist/index.html 419.14 kB`, built; `git diff --check` → limpio.
- Corrección de #4: `grep -n "placeholder" index.html` → 24 coincidencias, **todas** atributos `placeholder` de inputs/textarea y CSS legítimos; `grep "westona\|_placeholder"` → 0. Mutation check: reintroducida la regresión a propósito, el test nuevo falla (1 fail); restaurada la clave, vuelve a verde (107/107). Esto prueba que el test tiene dientes reales.
- Verificación independiente (`odd-verifier`, 2 pasadas): 1.ª detectó la regresión #4 → `RESULT: failed`. 2.ª (tras corregir): `Sin hallazgos` / `RESULT: success`, con contraste 1:1 de todas las claves `ca.`/`qa.`/`ga.` del CSV contra `public.management_period_summary` (`jsonb_build_object` de `supabase/migrations/202610090001_data_dura_appointment_sync.sql`, línea 261): 11 claves de citas, 5 de canales y 7 de gestiones, todas existentes.
- Fuera de alcance confirmado: `git status --short` → `M index.html`, `M scripts/tests/session-isolation.test.mjs`, `M scripts/tests/t5-frontend-edge.test.mjs`, `?? odd/tasks/ayudas-reporte-periodo.md`. Sin SQL ni RPCs tocados.

## Progreso
- Estado: **completado y verificado**.
- Ultima tarea: T6 (registro de incidencias).
- Siguiente paso: revisión visual en navegador por el humano (pestaña Reporte → Por período) y, si lo pide, commit del cambio.
- Bloqueos: ninguno.

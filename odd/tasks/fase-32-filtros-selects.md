# Fase 32: filtros y selects — opciones como datos puros (catalogos.js)

## Objetivo
Extraer de la seccion 4/4b del monolito (populateFilterOptions,
populateSelect y fillSelectFromCatalog) las reglas que hoy viven dentro del
DOM: valores unicos por campo y lista de opciones con su seleccion. El
wrapper queda con getElementById/createElement/appendChild.

## Problema y por que
Las dos funciones de relleno de <select> mezclan reglas de negocio
(deduccion de valores desde los leads, preservar la seleccion actual, forma
canonica del catalogo) con DOM. Sin tests directos y con dos semanticas
distintas, es facil regresar los filtros al tocar catalogos.

## Alcance
- `uniqueFieldValues(leads, key)` -> array (trimmeado, sin vacios ni 'SN',
  ordenado igual que hoy).
- `FILTROS_CATALOGO`: mapa declarativo de los cinco filtros (id, kind, campo).
- `opcionesSelectData(values, currentValue)` → [{ value, label, selected }]
  con la semantica de populateSelect (coincidencia exacta).
- `opcionesCatalogoData(values, currentValue)` → igual, con la semantica de
  fillSelectFromCatalog: clave `toLocaleLowerCase('es')`, forma canonica
  preferida y currentValue anadido al final si no hay canonico.
- El wrapper conserva: select inexistente -> return; lista vacia en
  fillSelectFromCatalog -> no toca el HTML; primera <option> intacta en
  populateSelect; el texto se asigna con textContent (nunca innerHTML).

## Restricciones
Sin stage/commit/push/remoto. Piezas puras sin window ni estado global;
reciben leads/valores por parametro. Reutilizar getField y catalogLabel
(helpers.js), catalogOptions y sortMonthCatalog.

## No romper
- Mismo conjunto/orden de opciones, misma etiqueta y misma opcion selected.
- Suite, lint, build, smoke.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion: capturar las opciones generadas por HEAD (sandbox vm) con
samples (vacio, 'SN', duplicados con distinta capitalizacion y acentos,
valor actual fuera del catalogo) y comparar con la pieza nueva.

## Tareas
- [x] T1: extraer reglas puras, registro window, caracterizar y adaptar
  sandboxes.
- [ ] T2: contraste independiente, suite, lint, build, smoke, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [ ] Wrappers de DOM sin reglas de negocio inline.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- Las piezas puras devuelven estructuras de datos, no HTML: evita diferencias
  de escapado respecto al createElement actual.
- uniqueFieldValues conserva `Array.from(set).sort()` del monolito (UTF-16),
  NO sortAlphaEs: el golden de HEAD muestra que los empates de catalogOptions
  ('alvaro' antes que 'Álvaro', 'Ana' antes que 'ana') dependen del orden de
  entrada a ese sort final estable. Registrado en JSDoc y fijado por test.
- Contrato "no tocar" (values vacio en fillSelectFromCatalog): el guard
  `!values.length` se queda en el wrapper junto al del select ausente, literal
  de HEAD. La pieza opcionesCatalogoData se documenta como llamada solo con
  values no vacio (con values vacio devolveria una lista enganosa, no un "no
  tocar"). Alternative descartada: pieza devolviera null — menos fiel al HEAD.
- El texto de la opcion se asigna con textContent en el wrapper (HEAD usaba
  innerText): ambas semantivas son de texto sin interpretacion de HTML;
  textContent es la variante canonica sin layout y la que pide el plan.

## Reutilizacion investigada
- getField, catalogLabel (helpers.js); catalogOptions (catalogos.js);
  sortMonthCatalog (leads.js); sortAlphaEs (helpers.js).

## Evidencia
- T1 (2026-10-14): cuatro piezas puras anadidas a src/legacy/catalogos.js con
  registro en window.catalogosApi (uniqueFieldValues, FILTROS_CATALOGO,
  opcionesSelectData, opcionesCatalogoData; se reutilizan getField,
  catalogLabel, sortAlphaEs, catalogOptions sin duplicar). Los tres wrappers
  del monolito quedan solo con getElementById/primera option/
  createElement/appendChild/textContent: populateFilterOptions recorre
  FILTROS_CATALOGO (mismas 5 llamadas a getVisibleBaseLeads que HEAD),
  populateSelect delega en opcionesSelectData y fillSelectFromCatalog en
  opcionesCatalogoData tras conservar el guard `!select || !values.length`.
- GOLDEN: capturado ANTES de tocar nada desde `git show HEAD:index.html`
  (d6a07a6) en sandbox vm con DOM falso (evidencia serializada en
  /tmp/opencode/golden-fase32-head.json) y re-derivado en el test a tiempo de
  ejecucion: 3 samples x 21 selects = 46 opciones serializadas
  {value,label,selected} + writes de innerHTML + identidad de primera option;
  arbol == HEAD deepEqual en los 3 samples (vacios/'SN' vs 'sn', duplicados
  con capitalizacion y acentos, current dentro y fuera del catalogo, values
  vacio sin tocar innerHTML, los cinco filtros con catalogRows mixtos incl.
  MARZO desactivado oculto).
- Tests nuevos: scripts/tests/filtros-selects.test.mjs (9 tests): golden
  head-vs-arbol, invariants primera option/fill vacio, literales exactos de
  FILTROS_CATALOGO (incl. 'Agente ' con espacio final), decision de orden
  sort() UTF-16 fijada por asercion, contrato "no tocar" verificado en fuente
  del wrapper, wrappers sin reglas inline (ni new Set, 'SN', toLocaleLowerCase,
  innerText ni innerHTML con contenido) y registro window.catalogosApi.
- Adaptaciones: ninguna necesaria — session-isolation mock-ea
  populateFilterOptions/populateCatalogSelects (linea 164, sin asserts de
  fuente) y t5-frontend-edge ejecuta los wrappers extraidos de nombres
  intactos; sus tests de catalogo (linea ~1971 SEPTIEMBRE→canonico y
  TEMPORADA al final) siguen pasando contra el wrapper nuevo.
- Verificacion T1: node --test filtros-selects 9/9; filtros+t5+session-isolation
  +ficha-lead+tabla-leads+repetidos-ficha+catalogos-helpers = 247/247; pnpm
  test completo = 596/596 node + 11/11 python; pnpm lint (tsc --noEmit +
  check-app 2 bloques, 3 reglas, tema claro) OK; pnpm build OK (inline-dist
  937 kB, CSP estricta); git diff --check limpio. Sin stage/commit/push;
  unstaged ajenos (odd/tasks/fase-1-centro-ayuda.md, opencode.json.bak)
  intactos.
- Pendiente T2: contraste independiente, suite/lint/build/smoke/diff-check en
  contexto fresco.

## Progreso
Estado: autorizado por continuacion del paso natural (2026-10-14).
T1: passed (2026-10-14). Siguiente tarea: T2.
Bloqueos: ninguno.

## Evidencia (T2)
- Estado: passed. Verificador read-only: las 4 piezas reproducen la
  semantica de HEAD (orden UTF-16 de uniqueFieldValues fijado por test con
  notDeepEqual a sortAlphaEs; 'Agente ' con espacio final verificado;
  canonicalizacion `toLocaleLowerCase('es')` y current-al-final identicos).
- Estado: passed. Wrappers: value leido antes de limpiar, primera <option>
  intacta, guard `!select || !values.length` en el wrapper (no en la pieza),
  textContent sin innerHTML de contenido. Riesgo bajo registrado:
  innerText→textContent en <option> solo divergiria con saltos de linea o
  CSS en el texto (valores de catalogo son de linea unica).
- Estado: passed. Golden ejecutado desde `git show HEAD:index.html` en vm
  con DOM mock funcional (setter innerHTML que cuenta writes) — sin
  sobreajuste; 3 samples x 21 selects = 46 opciones deepEqual.
- Estado: passed. t5-frontend-edge y session-isolation SIN cambios
  (git diff scripts/tests vacio salvo el fichero nuevo); SEPTIEMBRE→
  canonico y TEMPORADA-al-final siguen presentes y pasan.
- Estado: passed. filtros-selects 9/9; suite completa 596/596 Node + 11/11
  Python; lint OK; build OK (T1, inline-dist ~937 kB); diff-check limpio.
- Estado: pending. T3 revision visual humana y ZAP separado.

## Progreso
Estado: implementada y contrastada independientemente; sin commit
(2026-10-14). Siguiente tarea: T3 (visual humana y ZAP).
Bloqueos: ninguno.

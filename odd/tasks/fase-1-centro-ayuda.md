# Feature: Fase 1 — piloto de extraccion: Centro de ayuda

## Objetivo

Extraer la logica JS del Centro de ayuda (seccion 10b del monolito index.html)
a `src/legacy/help.js` siguiendo el patron strangler de la capa 2, sin cambiar
diseno ni comportamiento, con tests de caracterizacion acompanando la
extraccion. Es el piloto del plan de migracion por modulos aprobado.

## Problema y por que

El plan de transicion por modulos aprueba como primer paso un modulo de bajo
riesgo que ya tiene pruebas relacionadas. El Centro de ayuda es contenido
estatico, buscable y sin red: ideal para validar el ciclo completo
(tests -> extraer -> verificar -> entregar) antes de tocar zonas sensibles.

## Alcance

- Incluye: mover el bloque JS de la seccion 10b (HELP_SECTIONS, resaltado,
  render, modal, foco y listener de teclado) a `src/legacy/help.js`; registro
  en window de las funciones usadas por onclick/oninline; tests de
  caracterizacion nuevos; adaptar los tests que rebanaban el HTML (t5 x3
  slices, idle-timeout x2 aserciones).
- Excluye: markup del modal y botones (siguen en index.html), cambios de
  diseno o textos, React, TypeScript obligatorio, otras zonas del panel,
  migraciones, despliegue.

## Restricciones

- Movimiento programatico (script python), sin reescribir a mano el bloque:
  leccion documentada de corrupcion de entidades HTML en ediciones.
- Un solo cambio por entrega: extraccion + caracterizacion, nada mas.
- Sin commit/push/deploy sin peticion explicita del humano.

## No romper

- `window.openHelpModal/closeHelpModal/clearHelpSearch/renderHelpContent/
  focusHelpSection` usados por onclick/oninput en index.html.
- `helpReturnFocus` escrito por `clearSessionState()` (linea 1712 del
  monolito, script clasico sloppy): el modulo debe leer/escribir la misma
  propiedad de window, sin editar el reset de sesion.
- El listener de teclado (Escape cierra, Tab atrapado) debe seguir adjuntandose
  en navegador; en node (tests) el import no debe requerir DOM.
- Tests existentes: 395 node + 11 python en verde.
- El commit 2b3aa14 (cierre local por inactividad) ya parte de esta rama; su
  test nuevo en t5 tambien rebana HELP_SECTIONS y debe adaptarse a la lectura
  del modulo.

## TDD

- Modo: off
- Fuente: default (patron del repo: caracterizacion acompana cada extraccion)
- Runner: `pnpm test`
- Checks funcionales obligatorios: check-app, tsc, test, lint, build.

## Tareas

- [x] T1: Commit separado del trabajo previo sin commit (cierre local por
  inactividad) autorizado por el humano; base limpia para la extraccion.
- [x] T2: Extraccion programatica del bloque 10b a `src/legacy/help.js`
  (import de helpers, window.helpReturnFocus, guard de document, registro
  window, export de funciones) + module tag en index.html.
- [x] T3: Adaptar t5 (names list, import, inyeccion en sandbox, 3 slices ->
  readFileSync del modulo) e idle-timeout (2 aserciones -> helpSource).
- [x] T4: Tests de caracterizacion nuevos `scripts/tests/help-helpers.test.mjs`
  (estructura, normalizeHelpText, helpHighlight, renderHelpContent, open/close
  modal, clearHelpSearch) con DOM minimo en node.
- [x] T5: Verificacion completa: check-app, tsc, npm test, lint, build,
  qa-gate, git diff --check.
- [x] T6: ZAP pasivo contra http://localhost:3001 (autorizado por el humano)
  y revision de las 3 alertas Medium con clasificacion dev/produccion.

## Criterios de aceptacion

- [x] index.html ya no contiene HELP_SECTIONS ni las funciones de ayuda; los
  onclick/oninput intactos.
- [x] src/legacy/help.js byte-exacto salvo: header/import, dedent fuera de
  template literals, window.helpReturnFocus, guard de document, registro y
  export.
- [x] Toda la suite en verde (node + python), lint y build OK.
- [x] Lineas de index.html decrecen (~-360) sin perder funcionalidad.

## Decisiones aceptadas

- `helpReturnFocus` vive en window (no en let del modulo): clearSessionState()
  del monolito lo limpia con asignacion implicita sloppy sin editar el reset.
- Dedent 4 espacios solo fuera de template literals (el HTML generado queda
  byte-exacto).
- El markup del modal permanece en index.html (extraccion de logica, patron
  de la capa 2).
- Riesgo aceptado por el humano (cierre fase 1): el esquema SQL embebido del
  modalRls (index.html:1505) se mantiene como documentacion del panel. Sin
  datos ni credenciales; la proteccion real es RLS. Si se revisara, la
  alternativa es servir el SQL solo al abrir el modal (tarea futura).

## Reutilizacion investigada

- Patron canonico: src/legacy/citas.js y helpers.js (export + registro window
  + `if (typeof window !== 'undefined')`).
- Arnés de t5: inyeccion de funciones de modulos legacy en el contexto vm
  (lineas ~109-121) y lectura de ficheros extraidos con readFileSync
  (patron de src/legacy/leads.js en el test del badge Nuevo).
- Marcadores unicos verificados: `10b. CENTRO DE AYUDA` (1) y `11. MODAL RLS`
  (1).

## Evidencia

- T1: commit 2b3aa14 "Hacer el cierre por inactividad local..." (2 ficheros,
  +38/-2), qa-gate --strict exit 0. Trabajo previo verificado en verde antes
  del commit (t5 135/135).
- T2: script python: bloque [marcador 10b .. marcador 11) -> src/legacy/help.js
  (381 lineas); index.html 7281 -> 6921 (-360). Sintaxis ESM OK
  (node --input-type=module --check). Verificacion de byte-exactitud contra
  HEAD (core normalizado, comentarios excluidos): 0 lineas ausentes
  inesperadas; unica extra = transformacion acordada
  `const restore = window.helpReturnFocus`. onclick/oninput intactos
  (11 llamadas openHelpModal/closeHelpModal/renderHelpContent en index.html).
- T3: t5: names sin 'normalizeHelpText'/'helpHighlight'; import helpMod;
  inyeccion en sandbox; 3 slices -> readFileSync del modulo (2 de ayuda + 1
  del cierre local). idle-timeout: helpSource = read('src/legacy/help.js')
  para las 2 aserciones de contenido. idle-timeout + session-isolation:
  89/89 en verde tras la adaptacion.
- T4: help-helpers.test.mjs 12/12. Conteos reales verificados antes de
  asertar ('trafficker' 1/9, 'catalogo' 4/9, 'reprogramar' 2/9). Correccion
  de caracterizacion: notes es opcional (ayuda-data-dura no lo define).
  Entidades esperadas construidas por char-codes (leccion del editor).
- T5: node --test 408/408 (396 previos + 12 nuevos), unittest 11 OK, tsc OK,
  check-app OK (bloque #2: 5691 -> 5339 lineas), lint OK, build OK (dist
  autocontenido regenerado; JS del bundle 236 -> 257 kB al unirse help.js,
  HTML inline 470 -> 444 kB). qa-gate exit 0, git diff --check OK.
  Nota: el modo --baseline del arnes (git HEAD) fallara en t5/idle-timeout
  hasta que help.js tenga commit; modo manual de verificacion, no usado por
  `pnpm test`.

### Seguridad — ZAP pasivo (T6)

Objetivo http://localhost:3001 (autorizado; sin escaneo activo, sin
autenticacion). Spider 100%, AJAX spider 100%. Informe:
/tmp/opencode/zap-phase-1-localhost-3001.html. Resultado: High 0, Medium 3,
Low 5, Informational 9.

| Alerta (Medium) | Clasificacion | Evidencia |
|---|---|---|
| CSP Header Not Set | Solo dev; mitigada en produccion | Vite no sirve cabeceras; `vercel.json` define CSP completa con `frame-ancestors 'none'` (commits f217443/e9defbd) |
| Missing Anti-clickjacking Header | Solo dev; mitigada en produccion | `vercel.json`: `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| Source Code Disclosure - SQL | Real y preexistente (no introducida por la fase 1) | El esquema `CREATE TABLE IF NOT EXISTS public.leads` vive en index.html:1505 (documentacion del modalRls) y viaja a `dist/index.html` |

La alerta de SQL queda como decision humana abierta: aceptar el esquema
embebido (documentacion del panel, sin datos ni credenciales; la proteccion
real es RLS) o abrir tarea para servir ese SQL solo al abrir el modal.
Ninguna alerta fue introducida por la extraccion del Centro de ayuda.

## Progreso

- Estado: completada y cerrada (pendiente commit bajo orden explicita)
- Ultima tarea: T6 (revision ZAP) verificada; SQL embebido clasificado como
  riesgo aceptado por el humano
- Siguiente paso: commit de la fase 1 cuando el humano lo autorice; luego
  Fase 2 (prueba en navegador con distintos tamanos + despliegue de prueba)
  o siguiente modulo
- Bloqueos: ninguno

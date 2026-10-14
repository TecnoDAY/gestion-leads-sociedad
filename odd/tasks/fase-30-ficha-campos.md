# Fase 30: plantilla restante de la ficha (ver lead) a fichas o leads.js

## Objetivo
Extraer la plantilla restante de openViewLeadModal (cabecera y campos de la
ficha) a piezas puras, dejando en el wrapper solo lectura de estado, fuentes
y escritura DOM. Cierra la extraccion de la ficha iniciada en 26-29.

## Problema y por que
Tras 26-29 la ficha conserva en el monolito la plantilla de campos,
previews, botones y chips mezclada con estado; es la ultima pieza grande de
esta superficie y las plantillas puras no tienen tests directos.

## Alcance
- Piezas puras (leads.js, siguiendo el patron de fases 25-29): cabecera de
  la ficha y bloques de campos navegables "is naturales", chips de estado,
  formulario/apartados de Seguimiento presente (solo el HTML determinista;
  el estado mutable entra como parametro).
- El wrapper openViewLeadModal queda con: busqueda de lead, origen, fuentes
  hibridas, estado global y escritura del contenedor.
- La pieza se llama fichaLeadHtml(lead, ctx) con fragmentos precomputados
  pasados por parametro (repetidosHtml, bannerHtml, notasHtml,
  gestionesHtml, citasHtml) para no duplicar 26-29.

## Restricciones
Sin stage/commit/push/remoto. No ejecutar `pnpm build` durante el ZAP en
curso sobre el puerto 4173 (conserva dist de fases 29): solo tests, lint y
diff-check; el build se dejara fechado en evidencia como deferido.

## No romper
, Marco byte a byte desplegado (capturado de HEAD antes de extraer),
data-ev funcional (dispatcher activo) con los resultados del vm, msgs y
defaults. Suite, lint y smoke.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion del HTML exacto contra HEAD: capturar el render de
openViewLeadModal con samples antes del cambio (golden) y contrastar despues.

## Tareas
- [x] T1: extraer fichaLeadHtml, registro window, caracterizar y adaptar
  sandboxes sin pnpm build.
- [x] T2: contraste independiente (incluye build y smoke al cansarse el ZAP
  o con preview nuevo), suite, lint, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [ ] openViewLeadModal sin plantillas propias.
- [ ] Suite, lint correctos; build OK al reanudarlo; sin commit automatico.

## Decisiones aceptadas
- Botones/estado global (isAdmin, currentUser) entran por ctx, nunca
  importados de window dentro de la pieza pura.

## Reutilizacion investigada
- Remerged: filaLeadHtml/notasLeadHtml/gestionesLeadHtml/citasLeadHtml y
  bloques de la fase 29 llegan como fragmentos: no duplicar.

## Evidencia
- T1 (2026-10-14): fichaLeadHtml(lead, ctx) + repetidosYBannerHtml extraidos a
  src/legacy/leads.js con el marcado byte-exacto de HEAD; openViewLeadModal
  queda como wrapper minimo (busqueda origen+id, fuentes hibridas, registro en
  window, escritura del contenedor) sin plantillas propias.
- Golden byte a byte: scripts/tests/ficha-campos.test.mjs captura el innerHTML
  de openViewLeadModal desde `git show HEAD:index.html` en sandbox vm (5
  samples: actual, aviso de alcance, historico solo lectura, repetidos+banner,
  bordes S/N/agendado) y lo contrasta contra el arbol de trabajo: 5/5
  identicos. Sin `pnpm build` (ZAP activo sobre :4173 con el dist de fases
  29): build diferido — pendiente en T2 junto con el smoke del preview nuevo.
- Suites: node --test (ficha-campos, repetidos-ficha, ficha-lead, tabla-leads,
  t5-frontend-edge, session-isolation): 240/240 pass. pnpm test completo:
  579/579 pass (node). pnpm lint (tsc --noEmit + check-app): OK.
  git diff --check: limpio. Aserciones de fuente del monolito adaptadas:
  t5 (leadAppointment* ahora apuntan a fichaFuente=src/legacy/leads.js) y
  session-isolation (sandbox inyecta fichaLeadHtml/repetidosYBannerHtml).
- Sin stage/commit/push; unstaged preexistentes (odd/tasks/fase-1-centro-ayuda.md,
  opencode.json.bak) intactos.

## Progreso
T1 terminada (passed). Siguiente: T2 (contraste independiente; build y smoke
al cansarse el ZAP) solo con nuevo tramo autorizado.
Bloqueos: ninguno activo; build sigue diferido por ZAP.

## Evidencia (T2)
- Estado: passed. Verificador independiente: el golden del test se toma de
  `git show HEAD:index.html` (render de openViewLeadModal de HEAD en vm
  neutral; 0 referencias en HEAD a fichaLeadHtml, diff de leads.js
  puramente aditivo) — no hubo sobreajuste posible; renders nuevos vs
  HEAD byte a byte en 5 samples (6/6 del fichero nuevo).
- Estado: passed. fichaLeadHtml/repetidosYBannerHtml exactos; el ctx de
  fichaLeadHtml no recibe isAdmin por diseno (sin bifurcacion de marcado
  por rol en la plantilla; la bifurcacion post-render queda en wrapper —
  cubre T3 visual).
- Estado: passed. wrapper minimo verificable en index.html (origen+id,
  fuentes hibridas, escritura unica). t5/session-isolation adaptados sin
  debilitar aserciones (redirect de fuente, inyeccion aditiva).
- Estado: passed. ficha-campos 6/6; suite completa 579/579 Node + 11
  Python OK; pnpm lint OK; pnpm build OK (dist 321.73 kB JS / 938 kB
  autocontenido); git diff --check limpio; smoke HTTP 200 en 4173 con el
  dist nuevo servido.
- Estado: pending. T3 revision visual humana (branch post-render de
  advisors admin) y ZAP siguiente pendiente; dist cambia tras T2.

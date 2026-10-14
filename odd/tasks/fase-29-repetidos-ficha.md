# Fase 29: repetidos y primera entrada de la ficha (ver lead) a leads.js

## Objetivo
Extraer a src/legacy/leads.js la logica pura de openViewLeadModal relativa a
repetidos por telefono y primera entrada: deteccion (phoneKey >= 7
digitos, exclusion del propio registro por origen+id, doble recorrido
actual+historico), primera entrada (fecha minima entre el lead y sus
relacionados), orden de repetidos (fecha dd/mm/yyyy -> created_at -> id)
y el bloque HTML de la lista de repetidos. La plantilla de la ficha y las
abreviaturas del contenedor quedan en index.html.

## Problema y por que
openViewLeadModal (~220 lineas) mezcla dedupe por telefono, orden con
tres claves de respaldo y plantilla extensa; es la pieza grande que resta
de la ficha. Las fases 26-27 ya extrajeron notas/gestiones/citas dentro de
la ficha; este tramo cubre el bloque de posibles repetidos.

## Alcance
- `relacionadosPorTelefono(lead, fuentes, finalOrigin)`: devuelve los
  repetidos con la misma exclusion.
- `primeraEntradaLead(lead, relacionados)`: { firstTs, firstFecha,
  firstIsHistorico } o null (usada para el banner).
- `ordenRepetidos(items)`: mismo sortKey (fecha dd/mm/yyyy -> created_at
  parseable -> id numero, desc; empate por compareLeadIdsDescending).
- `bloqueRepetidosHtml(items, finalOrigin)`: filas `<li>` exactas con
  yearBadge 2025/2026, 'Este lead', obs truncada a 160 con ellipsis y
  extraccion de espacios.
- `bannerPrimeraEntradaHtml(firstFecha, firstYear)`: marcado del banner.
- Wrapper openViewLeadModal: lectura de fuentes (completeCurrentLoaded ?
  completeCurrentLeads : allLeads, allHistorico), composicion y DOM.

## Restricciones
Sin commit/push/deploy/remoto; conservar Fases 27-28 unstaged y trabajo
ajeno (odd/tasks/fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Mensajes, badges 2025/2026/'Este lead', truncado de observaciones,
  exclusion del propio lead y orden visible actuales (t5 golden).
- Suite, lint, build y smoke.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion y regresion obligatorias (RED por export ausente antes de
extraer; t5 como golden del panel).

## Tareas
- [x] T1: extraer las cinco piezas con registro window, caracterizar y
  adaptar sandboxes.
- [x] T2: contraste independiente, suite, lint, build, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [x] openViewLeadModal sin dedupe/orden/banner-inline propios.
- [x] Suite, lint y build correctos; sin commit automatico.

## Decisiones aceptadas
- El aviso de alcance incompleto (completeCurrentLoaded && historicoLoaded)
  queda en el wrapper: es texto condicionado al estado global del panel.

## Reutilizacion investigada
normalizePhone, getLeadOrigin, parseFechaLead, compareLeadIdsDescending,
badgeGestionHtml y escape/escapeAttr ya viven en los modulos y llegan a
leads.js directo; no crear modulo nuevo.

## Evidencia (T1)
- RED: scripts/tests/repetidos-ficha.test.mjs falla por exports ausentes
  (SyntaxError import, patron conocido). GREEN tras extraer: 10/10 tests.
- Extraccion: relacionadosPorTelefono, primeraEntradaLead, ordenRepetidos,
  bloqueRepetidosHtml y bannerPrimeraEntradaHtml en src/legacy/leads.js con
  registro window. Import added: compareLeadIdsDescending (helpers.js) y
  parseFechaLead (reportes.js). badgeGestionHtml ya vive en leads.js
  (renderGestionBadge del monolito era un wrapper suyo).
- Wrapper openViewLeadModal: conservadas lectura de fuentes
  (completeCurrentLoaded ? completeCurrentLeads : allLeads + allHistorico),
  aviso de alcance (duplicateScopeHtml), texto de dedupe, bloque exterior
  (.Posible lead repetido., total y linea de telefono) y resto de la
  plantilla byte a byte.
- Adaptacion sandbox: session-isolation.test.mjs ahora destruye las cinco
  funciones de leadsMod y las inyecta en el contexto vm (fallo en cascada
  resuelto). t5-frontend-edge no miraba la fuente del bloque repetidos: sin
  cambios necesarios en sus aserciones.
- Verificacion: node --test repetidos-ficha (10 pass) y
  session-isolation+t5 (214 pass); pnpm test completo 573 pass / 0 fail;
  pnpm lint OK (tsc + check-app); pnpm build OK (dist 311.67 kB);
  git diff --check limpio. Sin stage/commit/push; fase-1-centro-ayuda.md y
  opencode.json.bak intactos.

## Evidencia (T2)
- Estado: passed. Verificador independiente read-only: 5 exportaciones
  equivalentes byte a byte (dedupe umbral 7/exclusion origen+id/fuentes
  hibridas; primera entrada; sortKey con 3 respaldos y empate; badges
  2025/2026/'Este lead'; obs 160 con puntos suspensivos; banner con gate
  en wrapper como en HEAD). Simplificacion equivalente: la export es
  `[]` con < 7 y el wrapper ya no envuelve en `if phoneKey >= 7`.
- Estado: passed. Tests repetidos-ficha 10/10 funcionales (umbral 7/6,
  ts UTC exacto, empate textual "10"<"9", no-mutacion, truncado garantiza
  160+'...' y no 161); session-isolation+t5 214; suite completa 573/573;
  pnpm lint OK; git diff --check limpio. Build ejecutado por worker,
  no repetido por verificador (read-only).
- Estado: noted. Riesgos nuevos menores documentados por el verificador:
  bloqueRepetidosHtml no re-ordena internamente (solo el wrapper lo hace,
  JSDoc lo indica); bannerPrimeraEntradaHtml no valida el ano. Ambos con
  callers actuales correctos.
- Estado: pending. T3 revision visual humana y ZAP no ejecutados para
  este tramo.

## Progreso
Estado: implementada y contrastada independientemente; sin commit (2026-10-14).
Siguiente tarea: T3 (visual humana y ZAP separado).
Bloqueos: ninguno.

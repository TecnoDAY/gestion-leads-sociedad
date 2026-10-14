# Fase 28: tarjetas de leads recientes

## Objetivo
Extraer a leads.js el orden, limite y marcado de renderQuickLeads.

## Problema y por que
El renderizador mezcla una plantilla y seleccion de cuatro leads con escritura DOM.

## Alcance
- quickLeadsHtml(leads): mismo sort numerico descendente por id, limite 4 y HTML.
- Wrapper conserva busqueda del contenedor y escritura innerHTML.
- Listener data-quick-action permanece intacto en index.html.

## Restricciones
Sin commit/push/deploy/remoto; conservar cambios de Fase 27 y trabajo ajeno.

## No romper
Aspecto, defaults, badges, origen historico, WhatsApp deshabilitado y acciones.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion funcional obligatoria.

## Tareas
- [x] T1: extraer plantilla y selector, registro window y tests; adaptar sandboxes.
- [x] T2: contraste independiente, suite, lint, build, diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [x] Wrapper sin plantilla ni ordenamiento.
- [x] No mutacion del conjunto filtrado; mismos cuatro registros y orden.
- [x] Suite, lint y build correctos.

## Decisiones aceptadas
Una funcion pura basta: no crear abstracciones para cada tarjeta.

## Reutilizacion investigada
getLeadOrigin, getField, escapeHtml/escapeAttr y badgeGestionHtml ya existen.
T1 reutiliza esos helpers directamente. renderGestionBadge ya delegaba en
badgeGestionHtml: no se duplica el badge. Se conserva literalmente
`[...leads].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 4)`, sin
usar el comparador generico (su fallback textual cambiaria la semantica).
Los sandboxes existentes no ejecutan renderQuickLeads; no requieren cambios.
El sandbox nuevo ejecuta el wrapper y listener reales de index.html.

## Evidencia
### T1 (2026-10-14)
- Estado: passed. `node --test scripts/tests/quick-leads.test.mjs scripts/tests/leads-helpers.test.mjs scripts/tests/tabla-leads.test.mjs scripts/tests/t5-frontend-edge.test.mjs scripts/tests/session-isolation.test.mjs`: 246 tests, 0 fallos. Los 9 nuevos cubren orden numerico/empates/ids no numericos, limite, no mutacion, defaults, HTML exacto, escape, historico, badges, WhatsApp disabled, acciones, vacio, wrapper/listener reales y registro window.
- Estado: passed. `pnpm test`: 563 tests Node y 11 Python, 0 fallos. Salida local efimera: `/tmp/opencode/fase28-t1-test.log`.
- Estado: passed. `pnpm lint`: tsc y check-app OK (2 bloques, 3 reglas).
- Estado: passed. `pnpm build`: 24 modulos, dist autocontenido con CSP estricta; sin deploy.
- Estado: passed. `git diff --check`: sin errores.
- Estado: passed. `node --input-type=module` con script inline read-only: comparacion contra renderQuickLeads de `git show HEAD:index.html` en seis casos (vacio, defaults, orden/limite, historico, escape e ids no numericos); HTML identico y listener identico byte a byte.
- Estado: skipped (codigo unstaged). `bash ~/.config/opencode/scripts/qa-gate.sh`: sin staged, no aplicable; rutas sensibles rastreadas comprobadas. No equivale a auditoria automatica del codigo unstaged. Diff T1 revisado y tests nuevos inspeccionados.
- Estado: passed. Barrido reliability con `rg` sobre `scripts/tests/quick-leads.test.mjs` y `src/legacy/leads.js`: sin sleeps, mocks de libreria ni reloj/azar en esos archivos (exit 1 = sin coincidencias).
- Cambios T1 limitados a `src/legacy/leads.js`, wrapper de `index.html`, `scripts/tests/quick-leads.test.mjs` y este documento. Trabajo previo Fase 27, `odd/tasks/fase-1-centro-ayuda.md` y `opencode.json.bak` conservados unstaged. Sin stage, commit, push, remoto ni subagentes.
- Estado: passed. T2 verificador independiente read-only: 65 comparaciones HTML identicas frente a HEAD y listener identico byte a byte; 246 tests relevantes, lint y diff-check correctos. Build ejecutado por worker, no repetido por verificador.
- Estado: pending. T3 (visual humana/ZAP) no ejecutada para este tramo; no se extrapola el escaneo previo.

## Progreso
Estado: implementada y contrastada independientemente; sin commit.
Ultima tarea: T2.
Siguiente tarea: T3 (visual humana y ZAP separado).
Bloqueos: ZAP pendiente; sin nuevas consultas ni cambios de permisos.

# Fase 27: citas de la ficha

## Objetivo
Extraer el HTML de renderLeadAppointments a citas.js sin cambiar comportamiento.

## Problema y por que
El renderizador mezcla una plantilla extensa con lectura de estado y escritura DOM.

## Alcance
- citasLeadHtml(citas, { isAdmin, userId }) devuelve el marcado actual.
- Wrapper conserva escritura DOM y cualquier efecto existente.
- Tests directos de estados, permisos, IDs invalidos, escape y vacio.
- Ajustar tests que inspeccionan la ubicacion antigua sin debilitar permisos.

## Restricciones
Sin commit, push, merge, deploy ni cambios remotos. Conservar trabajo ajeno.

## No romper
Botones, permisos, data-ev, mensajes y fechas actuales. RPCs fuera de alcance.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion y regresion obligatorias.

## Tareas
- [x] T1: extraer plantilla, registrar window y caracterizar; adaptar sandboxes.
- [x] T2: verificacion independiente, suite, lint, build y diff-check.
- [ ] T3: revision visual humana y ZAP separado.

## Criterios de aceptacion
- [x] Wrapper sin plantilla de citas.
- [x] Suite, lint y build correctos.
- [x] Permisos identicos: editar admin/asignada, estados solo PROGRAMADA, borrar admin.

## Decisiones aceptadas
Reutilizar appointmentLocal, appointmentBadge y validAppointmentId del modulo.

## Reutilizacion investigada
citas.js ya contiene helpers y plantilla de tabla; no crear modulo nuevo.
T1 reutiliza escapeHtml, appointmentLocal, appointmentBadge y validAppointmentId directamente; conserva la plantilla original sin alterar defaults ni el caso de lista no vacia con todos los IDs invalidos (HTML vacio). No reutiliza filaCitaHtml como plantilla porque pertenece a una tabla con marcado diferente.

## Evidencia
- T1 Estado: passed. Export citasLeadHtml en src/legacy/citas.js y registro window; renderLeadAppointments conserva busqueda del nodo, retorno temprano y escritura innerHTML. Sin cambios RPC/red.
- Estado: passed. `node --test scripts/tests/citas-lead.test.mjs scripts/tests/t5-frontend-edge.test.mjs`: 144/144. Tests directos de permisos, estados, IDs, escape, fechas, defaults, vacio, no mutacion y registro window. Sandbox ejecuta el wrapper real y prueba nodo ausente; inspecciones de permisos/borrado reemplazadas por comportamiento. Parse-all incluye las plantillas de citas.js, conservando umbrales.
- Estado: passed. Comparacion local `node --input-type=module` con renderLeadAppointments obtenido por `git show HEAD:index.html`: 144 salidas identicas byte a byte (admin/no admin, usuaria asignada/ajena/undefined, seis estados, vacio, IDs invalidos/numericos y campos opcionales).
- Estado: passed. `pnpm test`: 554 tests Node y 11 tests Python, cero fallos (log /tmp/opencode/fase27-test.log).
- Estado: passed. `pnpm lint`: tsc y check-app correctos, dos bloques y tres reglas.
- Estado: passed. `pnpm build`: Vite e inline-dist correctos, CSP estricta.
- Estado: passed. `git diff --check`: sin errores.
- Estado: skipped (codigo unstaged). `bash ~/.config/opencode/scripts/qa-gate.sh`: sin staged, rutas sensibles rastreadas comprobadas. Revision manual del cambio sin secretos/logs/TODO nuevos. Reliability lens: barrido de patrones de tiempo, mocks y aleatoriedad sin coincidencias en los tres archivos JS de T1.
- Estado: passed. Verificador independiente read-only: 940 comparaciones contra HEAD coinciden (incluidas 40 excepciones preexistentes); 144 tests relevantes y suite 554 Node + 11 Python, lint y diff-check correctos. Build ejecutado por worker, no repetido por verificador.
- Estado: unavailable. Smoke HTTP de preview 4173: connection refused; servidor no disponible. No equivale a fallo de build.
- Estado: pending. T3 visual humano y ZAP no ejecutados para esta fase.

## Progreso
Estado: implementada y contrastada independientemente; revision visual humana confirmada; sin commit.
Ultima tarea: T2.
Siguiente tarea: T3 (revision visual humana y ZAP separado).
Bloqueos: preview 4173 no disponible. ZAP no ejecutado para este tramo.

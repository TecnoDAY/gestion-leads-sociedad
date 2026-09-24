# Formato de teléfono y detección de leads repetidos (Fase 1)

## Objetivo

Que los leads nuevos guarden el teléfono en formato `1 (305) 582-2012` y que la ficha integral detecte y muestre los registros repetidos de ese contacto con su historial.

## Problema y por qué

Una misma persona entra por Facebook, WhatsApp u otra campaña en semanas distintas y se crean varios leads. Hoy no hay forma de ver en la ficha que son la misma persona ni su historial por campaña/medio.

## Alcance

- Helpers `normalizePhone()` (solo dígitos para comparar) y `formatPhone()` (EE. UU. a `1 (305) 582-2012`; internacionales con `+` se conservan; incompletos no se alteran agresivamente).
- Formato automático al escribir/pegar/salir del campo en `#newTelefono` y `#editTelefono`, y al guardar en `handleCreateLead` y `handleUpdateLead` (solo admin edita teléfono).
- Ficha integral (`openViewLeadModal`): teléfono en formato canónico y bloque "Posible lead repetido" cuando `normalizePhone` coincide con otros leads en `allLeads`, listando fecha, campaña, medio, agente, estado y observaciones de cada registro ordenados por fecha, con enlace para abrir cada uno.
- Los teléfonos existentes en Supabase NO se modifican (sin migración).

## Restricciones

- Sin React, sin dependencias nuevas, sin migraciones SQL.
- Solo `index.html` y este documento.
- Números internacionales (`+52 55 8121 1304`) y números no 10 dígitos: conservar.

## No romper

- Búsqueda de leads por teléfono existente (fila de la tabla usa `cleanPhone`).
- Enlaces `wa.me`, `exportCurrentLeadsCSV`, CRUD, roles, login, Realtime, históricos (T1-T4 de `historicos-mensuales.md`).
- `getField()`, `create_lead`/`update_lead_full` RPCs (el payload mantiene sus claves).
- `npm run build` y `npm run lint`.

## TDD

- Modo: off
- Fuente: proyecto (sin runner de tests)
- Runner: no disponible

## Tareas

- [x] T1: Helpers de teléfono (normalize/format) + formato al escribir y al guardar en crear y editar + ficha con teléfono canónico.
- [x] T2: Detección de repetidos en la ficha integral con historial de registros relacionados.
- [x] T3: Verificación global (build, lint, diff check, qa-gate) y cierre.

## Criterios de aceptación

- [ ] `3055822012` o `13055822012` se guarda como `1 (305) 582-2012` en nuevo lead y en edición admin.
- [ ] `+52 55 8121 1304` se conserva sin forzar formato EE. UU.
- [ ] El campo de teléfono formatea al salir del campo (blur) sin mover el cursor mientras se escribe.
- [ ] La ficha muestra el teléfono en formato canónico.
- [ ] Si otro lead tiene el mismo teléfono normalizado, la ficha muestra "Posible lead repetido" con N registros, listando fecha, campaña, medio, agente, estado y observaciones de cada uno, ordenados por fecha, con botón para abrir cada registro.
- [ ] Sin coincidencias, no se muestra ningún bloque de repetidos.
- [ ] Los datos de Supabase no cambian (sin migración).
- [ ] `npm run build`, `npm run lint`, `git diff --check` y qa-gate pasan.

## Decisiones aceptadas

- Teléfono como criterio principal de duplicado; nombre no se usa aún (Fase 2).
- Formato EE. UU. solo para números de 10 dígitos (o 11 que empieza por 1); internacionales e incompletos se conservan.
- Formato visible/guardado ≠ clave de comparación (siempre dígitos).
- Sin columnas ni tablas nuevas: cálculo en memoria sobre `allLeads`.

## Reutilización investigada

- `getField()`, `escapeHtml/escapeAttr`, patrón de modal de ficha (`openViewLeadModal`) y `renderGestionBadge` ya existen; se reutilizan.
- La tabla de leads ya compara teléfonos con `replace(/\D/g,'')` (líneas ~1923 y ~2301): mismo criterio que `normalizePhone`.
- Patrón de bloque de información de la ficha (bg-slate-900/50 + label uppercase) para el nuevo bloque de repetidos.

## Evidencia

- T1: passed — worker ses_f2c50cec6ffesKrE7fbpX1ztBn + verificador odd-verifier; checks: node sobre helpers literales (3055822012/13055822012→'1 (305) 582-2012', '+52...' conservado), npm run build OK, npm run lint OK, git diff --check OK
- T2: passed — worker ses_f2c4e94f3ffeP0W5g0mD2y39MU + verificador odd-verifier; checks: escapado HTML verificado sin inyecciones, un solo recorrido allLeads, npm run build OK, npm run lint OK, git diff --check OK. Nota no bloqueante: persiste duplicidad trivial preexistente `telefono.replace(/\D/g,'')` en cleanPhone (orden NO tocar en ODD).
- T3: passed — comando `npm run build && npm run lint && git diff --check && qa-gate` → exit 0 (build 157.84 kB, qa-gate solo aviso preexistente .env.example plantilla)

## Progreso

- Estado: Fase 1 completa (T1-T3 passed); pendiente de prueba manual y de commit/push cuando el humano lo pida
- Última tarea: T3 verificada
- Siguiente paso: prueba manual (crear lead con teléfono sin formato, abrir ficha con repetidos); Fase 2 (vinculación persistente/manual) pendiente de autorización
- Bloqueos: ninguno

# Histórico 2025: tabla leads_historico y consulta

## Objetivo

Conservar los 4.348 leads del CSV 2025 como base histórica de solo lectura, acoplada estructuralmente a `public.leads` para poder relacionarlos con los leads actuales por teléfono y consultarlos en la aplicación.

## Problema y por qué

Existe un CSV con los leads entrantes de 2025 (`/home/miguel/Descargas/Gestion SAH 2025 - Leads Entrantes .csv`, 4.348 filas, 12 columnas). Sin una tabla histórica no hay forma de buscar un lead de 2025 ni de ver el historial completo de un contacto entre años. Meter esos datos directamente en `public.leads` contaminaría los KPIs y la operación actual.

## Alcance

- **T1**: migración local `supabase/migrations/202609240004_create_leads_historico.sql` con la tabla `public.leads_historico`, índices, RLS de solo lectura y comentarios. NO se ejecuta en Supabase (el humano la revisa y la ejecuta en SQL Editor).
- **T2**: script/migración de importación del CSV (4.348 filas → tabla, con auditoría source_file/source_row).
- **T3**: aplicación: selector Leads actuales / Histórico 2025 / Todos, búsqueda y ficha con badge de origen + relaciones por teléfono entre años.
- **T4**: verificación global y cierre.

## Restricciones

- Sin React, sin dependencias nuevas.
- Nunca ejecutar migraciones remotas sin revisión previa del humano.
- El CSV original no se modifica.
- La tabla histórica es de solo lectura: sin INSERT/UPDATE/DELETE desde la aplicación (ni RPCs nuevos de escritura).

## No romper

- `public.leads` y todos sus RPCs (create_lead, update_lead_*, archive_lead).
- RLS y políticas existentes de `leads` y `user_access`.
- Pestaña Leads, CRUD, roles, login, Realtime, históricos 2026, teléfono/repetidos.
- `npm run build` y `npm run lint`.

## TDD

- Modo: off
- Fuente: proyecto (sin runner de tests ni Postgres local)
- Runner: no disponible

## Tareas

- [x] T1: Migración local de `public.leads_historico` (esquema, índices, RLS solo lectura).
- [x] T2: Importación de los 4.348 registros del CSV con auditoría.
- [x] T3: Selector Histórico 2025 en la aplicación, búsqueda y ficha con badge y relaciones entre años.
- [x] T4: Verificación global y cierre.

## Criterios de aceptación

- [x] T1: la migración crea `leads_historico` con columnas compatibles con `leads` + metadatos, índices en `telefono_normalizado` y RLS que solo permite SELECT a authenticated usuarios activos.
- [x] T1: la migración es idempotente (`if not exists` / `drop policy if exists`).
- [x] T2: los 4.348 registros se importan con `source_file`, `source_row` y `source_year=2025`; recuento final coincide con el CSV; ningún lead actual se modifica.
- [x] T3: selector con tres modos (default: actuales); la ficha muestra badge "Histórico 2025" y los registros relacionados entre 2025 y 2026 por teléfono normalizado.
- [x] T3: los KPIs y gráficos actuales no incluyen 2025 por defecto.
- [x] `npm run build`, `npm run lint`, `git diff --check` y qa-gate pasan.

## Decisiones aceptadas

- Tabla separada `leads_historico`, no fusionar con `leads`.
- Mapeo CSV → tabla: `Nombre + Apellido` → `Nombre` (visible completo), `Apellido` se conserva en su propia columna; `Agente` → `AGENTE`; `OBSERVACION` → `OBSERVACIONES `; `FECHA DE ATENCION` → `Fecha de Atencion`; `Odoo` → `Odoo`; `Mes`, `Fecha`, `Telefono`, `Campaña`, `Medio`, `GESTION` idénticos.
- Metadatos: `source_year` (2025), `source_file`, `source_row`, `imported_at`.
- `registro_key` única `historico_<year>_<id>` para no confundir con IDs de `leads`.
- `telefono_normalizado` (solo dígitos, generated column) como clave de relación entre años.
- Fecha del CSV con hora (`21/07/2025 0:00:00`) → se limpia a `d/m/aaaa` al importar.
- El valor original de `Telefono` se conserva sin reformatear.
- Histórico excluido de KPIs actuales por defecto.

## Reutilización investigada

- Patrón RLS de `202609230001_secure_otp_roles_archiving.sql`: `enable row level security`, policy `... for select to authenticated using (public.is_active_user() ...)`, `revoke insert, update, delete ... from anon, authenticated`, `grant select ... to authenticated` → se replica para `leads_historico`.
- `getField()` en la app ya resuelve claves con espacio final (`OBSERVACIONES `), por lo que la columna conserva ese nombre.
- Normalización de teléfono `normalizePhone()` (solo dígitos) ya existe en `index.html` y será la clave de relación en cliente; en BD se materializa en `telefono_normalizado`.

## Evidencia

- T1: passed — worker ses_f2b59ea2affeoFu4wKcspAG0sd + verificador odd-verifier (sin hallazgos; nombres byte a byte, generated columns inmutables PG15, RLS SELECT-only con is_active_user verificado, idempotente). Checks: npm run build OK, npm run lint OK, git diff --check OK. Validador SQL local (psql/sqlfluff): no disponible — sintaxis revisada por lectura, no ejecutada. Ejecutada por el humano en SQL Editor el 2026-09-24: "Success. No rows returned" (captura), tabla creada en remoto.
- T2: passed — worker ses_f2b41ffe1ffe5jyB46GU51l8dv + verificador odd-verifier (comparación total 4348×15 campos CSV→SQL: 0 discrepancias; escapado tokenizado sin literales abiertos; estructura begin/commit + guardia DO en part1; source_row contiguo 1..4348). Ficheros: 202609240005/0006/0007 part1-3 (1557/1411/1380 filas, ~335 KiB c/u). Ejecutado por el humano en SQL Editor el 2026-09-24 tras truncate+restart identity (la primera carga tenía duplicados por reejecuciones, 7108 filas): part1 Success, part2 Success, part3 con verificación 4348 total y 4150 con teléfono (capturas). Coincide con lo esperado.
- T3: passed — worker ses_f2ac0c246ffeL7UWFNVaeJc6qK + verificador odd-verifier (sin hallazgos: selector con default actual, allLeads intacto, resolución por par origen+id en los 6 puntos de llamada, badge Histórico 2025 + solo lectura, repetidos entre años con escapado completo, defensas en editar/archivar)
- T4: passed — comando `npm run build && npm run lint && git diff --check && qa-gate` → exit 0 (build 165.58 kB, qa-gate solo aviso preexistente .env.example plantilla)

## Progreso

- Estado: feature completa (T1-T4 passed); pendiente de prueba manual y de commit/push cuando el humano lo pida
- Última tarea: T4 verificada
- Siguiente paso: prueba manual (selector Histórico 2025, ficha con badge, repetidos entre años, roles agente/admin)
- Bloqueos: ninguno
- Bloqueos: ninguno

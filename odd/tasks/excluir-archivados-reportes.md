# Excluir leads archivados de los reportes

## Objetivo
Archivar un registro lo excluye de leads y reportes, incluso de periodos anteriores, sin afectar otro registro activo del mismo telefono.

## Problema y por que
Los RPC diarios, actividad por periodo e inscripciones historicas cuentan eventos de leads archivados. El CSV de gestiones conserva eventos aunque RLS oculte el lead.

## Alcance
Plan aprobado en chat: verificar caso real en solo lectura; pruebas de regresion; migracion local de consultas afectadas; coherencia de detalle/CSV; invalidacion existente; ayuda y revision independiente.

## Out of scope
Aplicacion remota, deploy, commit, push, bloquear duplicados, fusionar leads, borrar o reescribir historial; cambios ajenos de seguimiento.

## Restricciones
Sin dependencias nuevas de la app, sin nuevos estados ni cambios de firmas RPC. Solo lecturas remotas. Pruebas SQL aisladas con datos sinteticos.

## No romper
Permisos CRM/roles/equipo; filtros de asesora; zona Miami; fechas/clases de inscripcion; bajas de estado sin archivar conservan inscripcion historica; duplicados activos permitidos; historial persistente intacto.

## TDD
Modo: on
Fuente: usuario (aprueba plan que incluye prueba reproductora previa)
Runner: node scripts/tests/archivados-reportes.sql.mjs /tmp/opencode/archive-report-tests/node_modules/@electric-sql/pglite/dist/index.js; node --test --test-name-pattern='archivados:' scripts/tests/t5-frontend-edge.test.mjs

## Tareas
- [x] T1: Confirmar datos reales y reproducir con pruebas funcionales SQL/frontend.
- [x] T2: Migracion local: filtrar archivados en fuentes de reportes existentes, sin DML.
- [x] T3: Corregir detalle CSV, comprobar invalidacion y actualizar ayuda.
- [x] T4: Verificacion local, qa-gate y revision independiente read-only.

## Criterios de aceptacion
- [x] Dos registros activos del mismo telefono/dia/campana siguen contando por ID (SQL sintetico).
- [x] Archivar uno excluye sus gestiones, inscripciones y citas de totales diarios/equipo/periodo y detalles/CSV (prueba SQL y frontend).
- [x] El activo permanece y cuenta; baja de estado no archivada conserva inscripcion historica (SQL y frontend).
- [x] Archivo posterior afecta periodos anteriores; no se borran filas (SQL, incluidos conteos de filas y restauracion).
- [x] Permisos y filtros de roles preservados; detalle y resumen coherentes (SQL roles/equipo).
- [x] Al reabrir reportes se consultan datos nuevos; invalidacion de periodo bloquea respuestas/exportaciones obsoletas (carga diaria existente inspeccionada, tests de invalidacion y archiveLead).
- [x] Tests/lint/build y revision independiente pasan.
- [ ] Validacion visual humana (manual, pendiente).

## Decisiones aceptadas
Usar archived_at existente y el ID de cada registro; no deduplicar por telefono. Exclusion retroactiva de archivados, distinta de baja de estado. Preservar notas diarias y metricas manuales de campana.

## Reutilizacion investigada
crm_inscripciones_historial alimenta resumen y detalle; corregir ahi. daily_management_report y management_period_summary mantienen formas y permisos. buildPeriodSummary ya excluye archivados; removeLeadFromState y Realtime ya invalidan periodo; al abrir vista diaria se recarga. CSV debe usar fetchPagedResult/fetchRowsByIds existentes y solo leads activos.

## Evidencia
- passed: git status --short inicial: cambios previos en index.html, helpers/leads y tests de seguimiento, mas migraciones/tests/ODD sin seguimiento; conservarlos.
- passed: consulta remota read-only: caso indicado con ID 6466 archivado (2 gestiones), ID 6468 activo (1 gestion), ambos fecha 25/10/2026 y misma campana. No se guardan telefonos ni nombres en fixtures.
- passed: advisors security/performance consultados; avisos preexistentes sobre funciones definer, extension public, password protection e indices. Fuera de alcance; sin cambios remotos. Referencias: https://supabase.com/docs/guides/database/database-linter y https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- passed: logs PostgreSQL consultados en agregado; sin lecturas de payloads personales.
- passed: RED SQL observado: diario contaba 2 tras archivar uno (esperado 1).
- passed: RED frontend observado: CSV incluia 4 filas en lugar de 2; truncaba 2105 filas a 137; exportaba aun invalidado durante descarga.
- passed: GREEN frontend, 5 pruebas focalizadas (3 nuevas + regresiones de campana y baja sin archivo).
- passed: pnpm test final: 836 JS + 11 Python, cero fallos; log /tmp/opencode/archivados-reportes-tests-final.log.
- passed: pnpm lint (tsc + check:app), pnpm build, git diff --check.
- passed: QA strict sin staged (solo rutas rastreadas comprobadas, no audita unstaged). Revision manual de lineas propias adicional; barridos security/reliability sin defectos nuevos concretos, usos de Date.now e innerHTML preexistentes ajenos al cambio.
- passed: worker SQL independiente de la tarea frontend, ses_e86c211a5ffedwCwPLTLqA5Q9r: nueva prueba SQL GREEN; casos adicionales en memoria de faltantes/nombres legacy/filtro individual reportados GREEN por worker.
- passed: node scripts/tests/reporte-roles-equipo.sql.mjs /tmp/opencode/archive-report-tests/node_modules/@electric-sql/pglite/dist/index.js: equipo, roles, filtros y permisos preservados con migracion nueva.
- passed: frontend focalizado final: cinco tests archivados (CSV activos/archivados/ausentes; paginacion 2105 con max_rows=137; archivo durante descarga; archiveLead/cache/invalidation por ID; sesion cambiada y todos archivados).
- Nota de pruebas: los fixtures anteriores que incluian archivados en inscripciones se ajustan al nuevo criterio aprobado. La prueba de baja de estado usa ahora un lead NO archivado. La comparacion Instagram se toma antes de la migracion de archivados para no confundir los dos cambios de poblacion.
- passed: verificador independiente read-only ses_e86bebb83ffeLf7WlVXkaZResl: PASS sin defectos atribuibles al cambio; ejecuto los tres scripts SQL (archivados-reportes, inscritos-historial, reporte-roles-equipo) GREEN, siete tests focalizados GREEN, suite t5 completa 171/171, diff --check y QA strict (limite sin staged explicitado).
- passed: comparacion read-only del cuerpo de las tres funciones remotas con sus fuentes locales anteriores: coinciden al normalizar comentarios y espacios; las diferencias de hash bruto eran solo texto/formato. Sin logica remota desconocida que sobrescribir en estas funciones al aplicar despues la migracion.
- passed: aplicacion remota completada (2026-10-26, autorizada por el humano):
  - apply_migration exclude_archived_report_leads: success (aplico crm_inscripciones_historial con typo en ORDER BY, corregido despues).
  - apply_migration fix_exclude_archived_report_leads: success (corrigio el typo, orden por e.registrado_at y e.gestion_id).
  - apply_migration exclude_archived_report_leads_full: success (management_period_summary con filtro de archivados en gestiones y citas).
  - apply_migration exclude_archived_report_leads_daily: success (daily_management_report con filtro de archivados en todas las fuentes).
  - Verificacion read-only posterior: las tres funciones tienen nuevos md5 (b903b985a213e107d85550802df1885f, fd864dcdd5c4cc4c13c26a36867dce29, 2abb6ba7bb6df3230e0d963c7aa23b4f); guards crm_access_forbidden activos sin sesion CRM.
- Frontend: cambios en index.html (renderPeriodoInscripcionesResumen y exportPeriodoGestionesCSV) y src/legacy/help.js pendientes de publicacion.
- Checks locales: 836 tests JS + 11 Python OK; pnpm lint OK; pnpm build OK; git diff --check OK; QA strict sin staged.
- Pendiente real: validacion visual humana en navegador; publicacion del frontend (Vercel) si se autoriza.

## Progreso
Estado: migracion SQL remota aplicada y verificada; frontend pendiente de publicacion.
Ultima tarea: migraciones SQL remotas aplicadas y verificadas; funciones actualizadas en produccion.
Siguiente paso: publicar frontend (Vercel) si se autoriza; validacion visual humana pendiente.
Bloqueos: sin autorizacion de deploy/commit/push.

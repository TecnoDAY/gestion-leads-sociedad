# Fiabilidad de Reportes: CSV correcto, exportacion segura y notas por identidad

## Objetivo
Corregir los defectos de integridad detectados en la revision de la seccion Reportes (Reporte Diario y exportaciones), en dos entregas: (1) datos y exportacion fiables, (2) guardado y coherencia de notas.

## Problema y por que
Revision solo lectura (auditoria delegada, verificada por lectura directa):
- La fila TOTAL del CSV exportado esta corrupta: 27 cabeceras, 24 valores por fila pero solo 20 claves de suma (`index.html:5628-5644`). Los totales de Reprogramadas e Inscritos (3 columnas) caen a `sumas['undefined']` y salen vacios; la fila TOTAL tiene 23 celdas contra 27 cabeceras. Ademas los totales de las columnas 13-19 quedan desplazados (agendados Doral se suma en "Total agendados", etc.). Regresion de `32a2b3f`. El dato incorrecto ya se descarga en produccion.
- `loadReporteDiario` no limpia `reporteDayData` ante fallo o carga obsoleta y el boton Descargar sigue activo: se exporta un CSV etiquetado con la fecha nueva pero con datos de la fecha anterior.
- Si `select daily_report_notes` falla, las notas se renderizan vacias y "Guardar" hace upsert con `''`, pudiendo borrar notas reales.
- Las notas se emparejan por `autor_name` (renombrar una asesora desvincula la nota; homonimos colisionan); la tabla y los bloques ya tienen `autor_user_id`.
- Mensajes crudos de PostgREST/PLPGSQL al usuario en guardar/borrar nota (`advisor_not_found`, `own_note_today_required`, ...).
- Admin ve editables bloques sin `autor_user_id` que la RPC va a rechazar con `advisor_not_found`, perdiendo el texto.
- Cabecera de fecha del reporte usa la zona del navegador; nombres de fichero de otras exportaciones usan fecha UTC (dia siguiente entre 19:00-24:00 Miami).
- Estado `reporteDayNotes`/`reporteAsesorasDisponibles` no se limpia al cerrar sesion; `reporteDayData2` es codigo muerto; textarea sin `maxlength` aunque la RPC trunca a 5000; `#reporteAviso` sin `aria-live`.

## Alcance
Incluye: `index.html` (seccion Reportes y nombres de fichero de `exportCurrentLeadsCSV`/`exportHistoricalSummaryCSV`), tests en `scripts/tests/t5-frontend-edge.test.mjs`, este documento.
Excluye: migraciones SQL nuevas (la RPC y la tabla ya soportan `autor_user_id`), refactor de otras secciones, cambios visuales, backfill de datos.

## Restricciones
- Commits y push solo con autorizacion explicita. Estilo de mensajes convencionales en espanol.
- Sin dependencias nuevas; YAGNI. Errores al usuario en espanol comprensible; crudo solo en `console.warn`.
- Hora siempre `America/New_York` (decision vigente).

## No romper
- Suite actual: 207 Node + 11 Python (`npm test`), lint y build.
- Contratos RPC: `daily_management_report(date, uuid)`, `upsert_daily_report_note(date, text, text, text)`, `delete_daily_report_note(bigint)`.
- Neutralizacion de formulas CSV, BOM y `revokeObjectURL` diferido (tests 1157-1184).
- Guards de carrera `reporteRequestGeneration`/sesion en `loadReporteDiario` y mutaciones de notas.

## TDD
- Modo: on. Fuente: usuario (continuidad del flujo anterior) + regresion demostrada.
- Runner: `node --test scripts/tests/t5-frontend-edge.test.mjs`, luego `npm test`.
- RED primero: fila TOTAL con 24 sumas y 27 celdas; export bloqueado con datos obsoletos; render sin edicion si falla la lectura de notas; traduccion de errores; nota emparejada por `autor_user_id` y delete por id via uid; bloque sin uid no editable ni para admin.

## Tareas
- [x] T1 Entrega 1: `keys` con las 4 columnas de sede (24) y fila TOTAL de 27 celdas; test `fila TOTAL suma las 24 columnas numericas y cuadra con las 27 cabeceras (regresion sede)`.
- [x] T2 Entrega 1: `reporteLoadedKey` (fecha|asesora) fijada solo en carga exitosa; export bloqueado con aviso si filtros cambiaron o carga fallo; datos limpiados en error.
- [x] T3 Entrega 1: `renderReporteV2(bloques, notas, notasOk)`; si falla el select de notas, aviso visible y edicion desactivada (sin upsert de `''`).
- [x] T4 Entrega 2: notas emparejadas por `autor_user_id` (fallback nombre) en render/delete/CSV; edicion solo con identidad valida (admin exige uid; agente la suya y dia actual Miami).
- [x] T5 Entrega 2: `reporteNotaErrorMsg` traduce codigos RPC (crudo queda en `console.warn`); `maxlength=5000`; resets limpian notas/asesoras/clave; cabecera en fecha civil (UTC-naive); nombres de fichero con `miamiToday()`; `aria-live`/`role=status` en `#reporteAviso`; `reporteDayData2` eliminada.
- [x] T6 Verificacion local: `npm test` = 213/213 Node + 11/11 Python; lint OK; build OK; `git diff --check` OK; qa-gate sin hallazgos nuevos (aviso preexistente de `.env.example`). Pendiente autorizacion de commit/push.

## Criterios de aceptacion
- [x] Fila TOTAL: 27 celdas, totales por columna correctos incl. Reprogramadas e Inscritos (test verde).
- [x] Export tras fallo o con filtros cambiados: ningun fichero descargado y aviso claro (test verde; tras recargar bien, exporta).
- [x] Fallo de lectura de notas: sin textarea editable y aviso visible (test verde); nunca se envia `''` sobre nota desconocida.
- [x] Nota guardada con nombre antiguo se sigue viendo tras renombrar (emparejamiento por uid, test verde) y delete resuelve por uid.
- [x] Errores de nota muestran mensaje en espanol sin codigos internos (test verde).
- [x] `npm test`, lint, build y diff-check verdes.

## Decisiones aceptadas
- Dos entregas pequeñas, sin reescritura (aprobado por el usuario: "cual seria el mejor plan a implementar?" → respuesta Entrega 1 + Entrega 2 → "implementa el plan").
- sin migracion: notas por uid son solo cambio de frontend.
- Notas legadas sin `autor_user_id`: emparejamiento por nombre como fallback (no se migran datos).

## Reutilizacion investigada
- `miamiToday()` (helper existente, ~linea 2264) para nombres de fichero y flag "hoy".
- Patron `reporteRequestGeneration` ya presente para invalidar cargas; el flag de coherencia de export se apoya en el, sin mecanismo nuevo.
- Descartado: nueva RPC, libreria de CSV, deshabilitar el boton via DOM (el harness de tests no modela disabled; la guarda logica es mas simple y testeable).

## Evidencia
- RED observado: 6 tests nuevos fallando contra el codigo previo (TOTAL de 23 celdas, export sin guarda, edicion con notas fallidas, emparejamiento por nombre, mensajes crudos, estaticos).
- GREEN: `node --test scripts/tests/t5-frontend-edge.test.mjs` = 77/77; `npm test` = 213/213 Node + 11/11 Python (`OK`).
- `npm run lint` = `check-app: OK`; `npm run build` = OK; `git diff --check` = OK; qa-gate: sin hallazgos nuevos (`.env.example` rastreado es preexistente).
- Estado: passed. Comandos ejecutados en T6.

## Progreso
- Estado: implementada y verificada localmente; pendiente autorizacion de commit/push. Sin bloqueos.
- Siguiente: con autorizacion, commits `fix(reportes)` + `test(reportes)` + `docs(odd)` y push; no requiere backend.

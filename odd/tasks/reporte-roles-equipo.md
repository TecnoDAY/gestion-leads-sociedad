# Reporte diario: roles y totales de asesoras

## Objetivo
Las asesoras solo ven asesoras en el reporte diario (ni supervisores ni administradores) y todos los roles autorizados ven un bloque de totales del dia de las asesoras.

## Problema y por que
El RPC daily_management_report mezcla a todos los autores y anade ademas a los usuarios activos admin/agente/supervisor; el selector y la comparativa los exponen a cualquiera con acceso al reporte. No existe totalizacion del equipo: cambiar el filtro de asesora recorta tambien cualquier suma client-side.

## Alcance
Migracion 202610220005: helper is_asesora_user, filtrado por rol en el servidor (actividad + catalogo), bloque 'equipo' con la suma del dia de las asesoras (uid con role 'agente') independiente del filtro individual. Frontend: seccion 'Totales de las asesoras' con las mismas cuatro tarjetas del detalle, entre el resumen general y la comparativa.
Fuera: cambios remotos sin autorizacion, otros listados (solo admin accede a usuarios autorizados y citas por asesora), CSV diario individual (conserva su alcance), edicion de notas y reescritura del historial.

## Restricciones
Restriccion en el servidor, no solo en pantalla. Nadie sin uid verificable se reclasifica: los nombres legacy siguen visibles en la comparativa pero quedan fuera del total. La actividad del dia de una agente desactivada sigue contando en el total (rol 'agente', no solo activos). El equipo no depende de quien consulta ni del filtro. Admin, supervisor y trafficker conservan la vista completa.

## No romper
Guard crm_access_forbidden, fechas Miami, grupos disjuntos de canales, categorias retiradas agrupadas en Otros, notas por asesora/fecha, select con ids estables, escritorio y movil.

## TDD
Modo: off
Fuente: default
Runner: pnpm test
Checks funcionales y pruebas de regresion obligatorios.

## Tareas
- [x] T1: Migracion local 202610220005 (is_asesora_user, filtrado por rol, bloque equipo).
- [x] T2: Prueba SQL aislada PGlite (visibilidad por rol, defensa por uid directo, independencia del filtro, legacy fuera del total, guard y permisos).
- [x] T3: Frontend equipoDiarioHtml + cuerpoReporteDiario + renderReporteV2/loadReporteDiario.
- [x] T4: Tests frontend (t5 y render), lint, build, qa-gate.
- [x] T5: Aplicar 202610220005 en Supabase y verificar con datos reales.

Aplicacion remota (2026-10-22, autorizada por el humano):
- tools.supabase.apply_migration name=reporte_roles_equipo con supabase/migrations/202610220005_reporte_roles_equipo.sql: success.
- Verificacion read-only: daily_management_report e is_asesora_user sin EXECUTE para anon y con EXECUTE para authenticated; guard crm_access_forbidden activo en la linea 8 de la version nueva (ejecucion sin sesion rechazada).
- Datos reales del 2026-10-22: 177 gestiones, todas de usuarios con rol agente; sin actividad de admin/supervisor hoy, asi que el bloque de equipo debe cuadrar con 177 gestiones realizadas.

## Progreso
Estado: implementacion local y remota completas; queda validacion visual humana.
Ultima tarea: aplicacion remota autorizada de 202610220005 y verificacion de permisos, guard y datos del dia.
Siguiente paso: validar en navegador (localhost:3000) — con cuenta de asesora el selector y la comparativa solo muestran asesoras; todas las cuentas ven el bloque 'Totales de las asesoras' con 177 gestiones hoy y no cambia al filtrar por una asesora.

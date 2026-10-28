# Disponibilidad temporal de tareas CRM

## Objetivo
Compartir una tarea asignada desde 20 minutos antes cuando su responsable no esta conectada y siempre desde su vencimiento, sin perder la asignacion original hasta una toma atomica.

## Problema y por que
La RPC actual borra la responsable al vencimiento si no hubo actividad en 5 minutos. La actividad no equivale a conexion; las tareas no se comparten 20 minutos antes ni se devuelven al reconectar.

## Alcance
Presencia por heartbeat de sesiones CRM sin alterar telemetria de actividad; disponibilidad derivada en servidor y visibilidad RLS, bandeja/campanita y toma atomica; conservar retiradas solo admin de `tareas-permisos.md`.

## Out of scope
Notificaciones push con app cerrada, reoferta automatica despues de una toma, nuevos estados de tarea, despliegue o migracion remota. Commit y push autorizados posteriormente por el usuario.

## Restricciones
Las migraciones locales se aplicaran en orden despues de `20261028010200_tareas_permisos_admin.sql`. No modificar migraciones anteriores. Presencia caduca por timeout si falla red/cierra pestaña.

## No romper
Creacion, completado, historial, cancelacion admin, permisos de rol, contador de tareas propias y sin asignar, control de inactividad del CRM.

## TDD
Modo: off. Fuente: default. Runner: `npm test`; checks funcionales obligatorios.

## Tareas
- [x] T1: Migracion local con presencia CRM, predicado de disponibilidad, RLS, vista invoker y claim atomico; desactivar liberacion antigua. Estado: passed (contrato estatico); ejecucion SQL real: pending.
- [x] T2: UI con heartbeat, tareas de equipo y contador, sin romper cambio de rol. Estado: passed (pruebas UI); navegador real: pending.
- [x] T3: Contratos SQL, pruebas de UI, suite completa/lint/build, revision independiente. Estado: passed (checks locales); integracion DB: pending.

## Criterios de aceptacion
- [x] Antes de T-20 solo ve la tarea su responsable; desde T-20 si falta heartbeat la ve el equipo (contrato SQL; pendiente prueba real).
- [x] Si vuelve antes de vencer y nadie la toma deja de ser compartida; al vencer se comparte aun si esta conectada (contrato SQL; pendiente prueba real).
- [x] Una sola toma cambia responsable y registra historial; no se redistribuye automaticamente despues (contrato SQL; pendiente concurrencia real).
- [x] Campanita: propias pendientes, sin asignar y compartidas una vez cada una (prueba UI).
- [x] Admin sigue viendo todas y retirando, asesora/supervisora no retiran (prueba UI y contrato migracion previa).
- [ ] Comprobacion SQL contra DB real y navegador: pendiente hasta aprobacion de migracion remota/entorno de pruebas.

## Decisiones aceptadas
Conexion = heartbeat reciente de sesion abierta (3 minutos de gracia); no es interaccion ni modifica `agent_sessions`. Primera toma confirma nuevo responsable. No modificar la hora de la tarea.

## Reutilizacion investigada
`crm_tasks`, `claimed_at`, `claim_crm_task`, RLS `crm_tasks_select`, `refreshTasks` y `filterTasks` existentes. Se evita `status=disponible` y reescritura de asignaciones; `refresh_crm_task_assignments` pasa a compatibilidad no mutante.

## Evidencia
`npm test`: 868 tests JS + 11 Python; `npm run lint`, `npm run build`, `git diff --check`, `qa-gate --strict`: correctos. Revisor independiente detecto carrera de reconexion vs toma, corregida con advisory lock compartido y revisada sin bloqueantes. Postgres remoto version 17 consultado solo lectura; no se aplicaron migraciones. `crm_tasks_visible` ausente en remoto: cliente conserva vista actual con fallback SOLO para vista inexistente; compartir desde T-20 requiere migracion. SQL no ejecutado contra PostgreSQL, navegador real y concurrencia real pendientes. Otras pestañas pueden mostrar el dato antiguo hasta refresco de 60 s, pero RPC rechaza toma invalida.

## Progreso
Estado: implementado y verificado localmente; bloqueado para comportamiento real hasta aplicar ambas migraciones en orden y verificar roles/concurrencia. Commit y push autorizados; migracion remota y despliegue no autorizados.

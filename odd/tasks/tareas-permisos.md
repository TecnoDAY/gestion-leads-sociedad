# Permisos de tareas por rol

## Objetivo
Admin ve todas las tareas y es el unico que puede retirarlas, conservando historial.

## Problema y por que
Hoy el panel no ofrece vista de equipo y la RPC permite cancelar a quien creo la tarea y a supervisores. La lectura RLS deja ver todas las tareas a cualquier rol CRM.

## Alcance
Vista Todas para admin; asesoras y supervisoras solo ven asignadas a si o sin asignar; retirar solo admin con historial, en UI y RPC/RLS. Campanita y resumen cuentan pendientes propias y sin asignar, incluidas las futuras.

## Out of scope
Borrado fisico, cambiar permisos de completar/tomar, publicar o desplegar sin autorizacion.

## Restricciones
Nueva migracion aditiva local; conservar migraciones aplicadas y no manipular datos de tareas.

## No romper
Alta, asignacion, toma atomica, completar, seguimiento y otras secciones del CRM.

## TDD
Modo: off. Fuente: default. Runner: `npm test`; checks funcionales obligatorios.

## Tareas
- [x] T1: Cambiar RLS de lectura y RPC de cancelacion con guardia admin (migracion local pendiente de aplicar).
- [x] T2: Vista Todas exclusiva y eliminar boton de retirada para otros roles.
- [x] T3: Pruebas de contrato SQL y UI; lint, test, build y revision independiente.
- [x] T4: Contador de campanita y resumen coherentes con tareas pendientes propias y sin asignar.

## Criterios de aceptacion
- [x] Admin ve Todas y boton Retirar; la migracion conserva fila e historial (contrato estatico).
- [x] Asesoras/supervisoras no ven tareas ajenas ni boton Retirar; RPC queda protegida por guardia admin en la migracion (contrato estatico).
- [x] Mis tareas, Sin asignar y Completadas siguen funcionando en pruebas UI.
- [x] Campanita cuenta pendientes propias y sin asignar, sin completadas ni retiradas.
- [ ] Verificacion visual manual en el navegador pendiente.
- [ ] Cambios remotos solo tras autorizacion explicita.

## Decisiones aceptadas
Retirar equivale a cancelar con historial; supervisor sigue regla de asesora; sin borrado definitivo.

## Reutilizacion investigada
`crm_tasks_select`, `cancel_crm_task(uuid)` y `filterTasks` existentes; no se modifican migraciones previas.

## Evidencia
`npm test`: 865 pruebas JS y 11 Python correctas. `npm run lint`, `npm run build`, `git diff --check`: correctos. Revision independiente: sin bloqueantes tras corregir degradacion de rol con consulta pendiente. SQL solo verificado mediante contrato estatico; no se aplico ni ejecuto contra la base de datos. Navegador real pendiente.

## Progreso
Estado: implementado en local; commit y push autorizados posteriormente; pendientes autorizacion de migracion remota y despliegue, y verificacion de roles en entorno real.

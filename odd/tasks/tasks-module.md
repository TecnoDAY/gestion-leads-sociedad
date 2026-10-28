# Tareas CRM con asignacion y alerta general

## Objetivo
Anadir un modulo independiente de tareas vinculadas a leads, con asignacion directa, sustitucion por inactividad y bandeja general para tomar, sin agrandar el monolito.

## Problema y por que
Las asesoras necesitan programar recordatorios (llamadas, gestiones) asignables a si mismas o a otra asesora. Si la destinataria no esta disponible al vencer, la tarea se pierde o se queda sin atender.

## Alcance
Incluye:
- Migracion SQL de tabla crm_tasks + RPCs atomicos + RLS + realtime.
- Modulo src/tasks/ (UI, acceso a datos, realtime, notificaciones del navegador).
- Integracion minima en index.html: sidebar, pestaña, campana, resumen en Inicio, boton en ficha de lead y opcion en nuevo lead.
- Reduccion de altura de notas del formulario de seguimiento.
- Pruebas SQL de contrato y checks funcionales.

Excluye:
- Despliegue remoto, commit, push, PR.
- Sistema de guardias/horarios nuevo (no existe en el proyecto).
- Push real con pestaña cerrada (requiere scheduler server-side); se deja como pendiente.
- Refactor general del CRM.

## Out of scope
- No modificar seguimientos ni citas existentes.
- No alterar roles ni permisos existentes.

## Restricciones
- Seguir patrones de migraciones (security definer, search_path, revoke/grant, RLS).
- No leer ni modificar .env/secrets.
- Modulo debe funcionar sin framework nuevo.

## No romper
- Tests existentes deben seguir pasando.
- Leads, citas, seguimientos, realtime de leads.

## TDD
Modo: off. Fuente: default. Runner: npm test.

## Tareas
- T1: Migracion crm_tasks + RPCs + RLS + realtime.
- T2: Modulo src/tasks (servicio, UI, realtime, notificaciones).
- T3: Integracion en index.html (sidebar, vista, campana, dashboard, ficha, nuevo lead, notas).
- T4: Pruebas SQL de contrato.
- T5: Verificacion (lint + tests + check-app).

## Criterios de aceptacion
- [ ] Crear tarea desde ficha de lead y desde nuevo lead.
- [ ] Asignar a si misma o a asesora activa.
- [ ] Al vencer, si destinataria inactiva, pasa a sin asignar con registro.
- [ ] Bandeja general con tomar tarea; solo una puede tomarla.
- [ ] Notificacion interna y del navegador cuando permitido.
- [ ] Notas 30% mas bajas (aprox.).
- [ ] npm test y check-app sin regresiones.

## Decisiones aceptadas
- Sin guardias: usa agent_sessions (last_activity_at, umbral 5 min) como disponibilidad.
- Asignacion automatica solo a bandeja general cuando no hay destinataria disponible.
- Push cerrado queda pendiente.

## Reutilizacion investigada
- agent_sessions + touch_agent_session RPC.
- admin_manage_user_access para listar asesoras (solo admin). Para no-admin, nuevo RPC list_crm_task_advisors.
- notify-lead-change edge function como patron (no reutilizado para tareas).
- followup modal y handleCreateLead.

## Evidencia
- npm run lint: OK
- npm test: passed
- check:app: OK
- Un solo formulario con búsqueda de lead y contexto vinculado.
- Responsables siguen dependiendo de aplicar la migración a un entorno de prueba.

## Progreso
Estado: implementado local, verificacion manual pendiente. Sin push ni despliegue.

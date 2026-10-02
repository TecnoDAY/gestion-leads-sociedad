# Inactividad 5 min para asesoras + historial de sesiones

## Objetivo
- Solo asesoras: a los 4 min sin actividad, aviso con cuenta regresiva de 60s ("Continuar sesión"); a los 5, cierre local con motivo.
- Historial por sesión (inicio, última actividad, cierre, motivo, duración) visible solo para admin en el panel Usuarios; retención 90 días sin pg_cron.
- No se registran clics/teclas ni PII; las acciones comerciales ya viven en gestiones/citas/notas.

## Decisiones aceptadas
- Rol objetivo: `agente` únicamente (admin/supervisor/trafficker no se cierran).
- Aviso al minuto 4: banner no bloqueante; cualquier actividad lo disipa.
- Nivel: sesiones + acciones existentes (sin tracking de eventos).
- Retención: 90 días, purga ligera al iniciar cada sesión (sin pg_cron).
- Cierre con `signOut({scope:'local'})`: no cierra otros dispositivos de la misma asesora.
- Multi-pestaña: `localStorage` + evento `storage` comparte la marca de actividad.
- Suspensión del equipo: al volver visible se compara la hora real contra la marca.

## Alcance
- T1 Tabla `agent_sessions` + RPCs start/touch/end/report (admin) + purga 90d.
- T2 Frontend: timers, banner, listeners, scope local, registro de motivos (manual/idle/session_invalid).
- T3 Panel admin: bloque "Actividad de asesoras" (estado, inicio, última actividad, cierre, motivo, duración).
- T4 Tests + gates; T5 aplicar remoto + commit/push con autorización.

## No romper
- clearSessionState/handleSignOut/enterAuthenticatedSession conservan guards de generación.
- Trafficker sin realtime ni CRM no inicia sesión operativa.

## TDD: off (default). Runner: npm test; lint; build; diff-check; qa-gate.

## Tareas
- [x] T1 Migración `202610020006_agent_sessions.sql` aplicada remoto (tabla con RLS, 4 RPC verificadas, retención 90 días en start).
- [x] T2 Frontend: listeners contados (pointerdown/keydown/scroll/visibilitychange), sin mousemove; aviso a 4 min con cuenta regresiva; cierre a 5 con `idle_timeout`; `signOut scope:'local'`; localStorage comparte actividad entre pestañas; cleanup en clearSessionState.
- [x] T3 Panel Usuarios: bloque "Actividad de asesoras" (inicio, última actividad, estado/motivo, minutos) solo admin.
- [x] T4 Tests (199 Node + 11 Python), lint, build, diff-check, qa-gate verdes; tablas con RLS y RPC con motivos controlados.
- [ ] T5 commit/push.

## Correcciones durante implementación
- clearSessionState mantenía su posición semántica: endAgentSessionLocally se lanza antes pero sin await (preservaba test de aislamiento de mensajes).
- Orden de timer: aviso re-entra según ts real para corregir suspensión del equipo.
- Catch vacíos reemplazados por catch con comentario (regla qa-gate).

## Progreso
- Estado: implementada y verificada; pendiente commit/push.

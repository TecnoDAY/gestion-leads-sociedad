# Equipo presencia

Pestaña "Equipo" (presencia visible para todos) como primera pestaña del modal Usuarios; "Accesos" queda solo para admin.
Spec visual: `design/equipo-presencia/01-pestana-equipo.html`. Rama: `feat/equipo-presencia`.

## Specs

- S1. "tods pueden ver solo esa parte de quien esta activo": todo usuario con acceso habilitado (`user_access.activo = true`) puede abrir la pestaña Equipo; solo ve presencia (nombre, rol, estado, última señal). No ve correos ni acciones de cuenta.
- S2. La pestaña Accesos (invitar, usuarios autorizados, cambiar correo, desactivar cuenta, cierre automático, actividad de asesoras) sigue siendo exclusiva de admin; un no-admin no la ve ni puede ejecutar sus acciones (la autorización la impone el servidor, no solo la UI).
- S3. Estados veraces: "En línea" = señal de presencia del CRM en los últimos 3 min; "Ausente" = hubo señal antes, se muestra "última vez hace …"; "Sin datos" = nunca hubo señal. Nunca "Desconectada" ni "Trabajando". Estado con texto además de color.
- S4. Agrupado En línea / Ausentes / Sin datos, resumen con contadores ("3 en línea · 2 ausentes · 1 sin datos"), "Actualizado hace …" y botón Actualizar.
- S5. Visual según el artboard 01 mapeado a estilos/tokens existentes del proyecto (no copiar el HTML del artboard), accesible (tabs ARIA, foco visible, contraste AA, pantallas angostas).
- S6. Datos desde una RPC nueva de Supabase (migración en `supabase/migrations/`), segura (security definer, `search_path` fijo, exige usuario activo), que devuelve todo el equipo activo con su última señal; sin exponer email. Sin polling nuevo pesado: carga al abrir/Actualizar.

- S7. "que cuando esté en línea, que me salga cuánto tiempo ... cuando está ausente, cuánto tiempo ha estado ausente. Quiero un contador": en la lista, En línea muestra "desde HH:MM · X h Y min" y Ausente "desde HH:MM · X h Y min", con contador que avanza en el cliente (sin consultas nuevas por tick).
- S8. Registro de periodos de conexión: el heartbeat existente (`crm_task_heartbeat`) abre un periodo nuevo si la última señal del usuario tiene más de 5 min, o extiende el periodo abierto; inicio = primera señal, fin = última señal. Cortes < 5 min no cuentan como ausencia. Retención 5 semanas (35 días), borrado automático sin job nuevo. Sin escrituras adicionales por minuto más allá de la del heartbeat (misma llamada).
- S9. "histórico salga hoy ayer": al tocar una persona se abre su historial con el detalle de Hoy y Ayer (periodos En línea / Ausente con horas, hora de Miami).
- S10. "Semana 1 Tanto tiempo conectado y desconectado, semana 2, semana 3, semana 4 ... Esta semana. la semana anterior": debajo, resumen de 4 semanas (Esta semana, Semana anterior, Hace 2 semanas, Hace 3 semanas; lunes–domingo, America/New_York) con total En línea y Ausente, donde Ausente = huecos entre la primera conexión y la última desconexión de cada día. Se calcula al abrir el historial (una RPC), no en vivo.
- S11. Historial (S9–S10) visible solo para admin y supervisor (autorización en servidor); los contadores de S7 visibles para todos. Textos veraces: "En línea" = CRM abierto, no "trabajando"; desconexión estimada por última señal.

## Tasks

- T1 (S1–S6) RPC + migración, pestañas en modal Usuarios, botón Usuarios visible para todos, vista Equipo, tests, docs/ayuda. Route: gentle-ai-worker. Commit: 73fa1dd. Done (npm test 968+11 OK, lint OK, build OK por worker).
- T2 Verificación independiente (Risk item 2: permisos). Route: gentle-ai-verify. Commit: n/a. Blocked: 1er intento falló en preparación (copia bloqueada, 0 tests); 2º intento autorizado en sitio: verificador se negó a ejecutar probes sin copia aislada → todo S1–S6 UNVERIFIED, sin defectos hallados en inspección estática. Pruebas del padre: npm test 968+11 OK, lint OK.
- T4 (S7–S11) Periodos de presencia + contadores + historial Hoy/Ayer + resumen 4 semanas. Route: gentle-ai-worker. Commit: dc94845. Done (npm test 978+11 OK, lint OK, build OK por worker; corrige bug T1: Actualizar quedaba deshabilitado si cambiaba el acceso durante la carga). Slice: T1 73fa1dd + T4 dc94845 ≈1166 líneas; siguiente trabajo va en un PR/slice aparte. Verificador (git archive aislado): S3/S4 PASS, S7 FAIL (contador congelado >24 h) → corregido con test RED/GREEN en commit siguiente; S1,S2,S5,S6,S8–S11 UNVERIFIED (sin PostgreSQL).
- T5 Aplicar migración de periodos en producción (humano) y verificar read-only. Commit: n/a.
- T3 Aplicar migración en producción (humano, SQL Editor; MCP es read-only) y verificar con consulta read-only. Commit: n/a. Done: función presente, security definer, search_path=public, anon sin execute, authenticated con execute; 6 usuarios activos.

## Log

- L1 (usuario): "Implement the design artboard design/equipo-presencia/01-pestana-equipo.html ... Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim. Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source."
- L2 (usuario, antes): "tods pueden ver solo esa parte de quien esta activo dame 4 diseño de como quedaria muestramelo en el cambas"; comentario canvas 44gay0p8: "me gusta pero trata de que se vea mas bonito si me parece que esta division de equipo acceso solo administrador me  parece bien".
- L3 Decisión: design/system.md está desactualizado frente a src/index.css y tiene cambios del usuario sin commit; se usan los estilos/tokens existentes de src/index.css (fuente real del CRM). Engram no disponible (contrato incompatible): sin espejo de memoria.
- L5 (usuario): "Ok, me gustaría hacer lo siguiente. Que cuando esté en línea, que me salga cuánto tiempo... cuando está ausente, cuánto tiempo ha estado ausente. Quiero un contador... y que exista un registro de quizás los Último Tres días"; luego: "histórico salga hoy ayer, perfecto ... Me gustaría que saliera... Semana 1 Tanto tiempo conectado y desconectado, semana 2, semana 3, semana 4 ... Esta semana. la semana anterior ... utilizando los mismos recursos que tenemos ahorita"; luego: "vamos a implementarlo si encuentras errors corrigelos".
- L6 Decisión (recomendación del agente, no contestada explícitamente por el usuario; la más restrictiva y ampliable): historial solo admin/supervisor; semanas lunes–domingo hora de Miami; retención 35 días; hueco de fusión 5 min.
- L4 Decisión: la lista incluye todas las cuentas activas; trafficker sin señal aparece como "Sin datos". Presencia = `crm_task_presence.last_seen_at` (heartbeat existente, TTL 3 min).

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

## Tasks

- T1 (S1–S6) RPC + migración, pestañas en modal Usuarios, botón Usuarios visible para todos, vista Equipo, tests, docs/ayuda. Route: gentle-ai-worker. Commit: pending.
- T2 Verificación independiente (Risk item 2: permisos). Route: gentle-ai-verify. Commit: n/a.
- T3 Aplicar migración en producción (humano, SQL Editor; MCP es read-only) y verificar con consulta read-only. Commit: n/a.

## Log

- L1 (usuario): "Implement the design artboard design/equipo-presencia/01-pestana-equipo.html ... Implement it in the project's real stack. Use the artboard as the visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML verbatim. Take colors, typography, spacing, radius and shadows from design/system.md, the project's token source."
- L2 (usuario, antes): "tods pueden ver solo esa parte de quien esta activo dame 4 diseño de como quedaria muestramelo en el cambas"; comentario canvas 44gay0p8: "me gusta pero trata de que se vea mas bonito si me parece que esta division de equipo acceso solo administrador me  parece bien".
- L3 Decisión: design/system.md está desactualizado frente a src/index.css y tiene cambios del usuario sin commit; se usan los estilos/tokens existentes de src/index.css (fuente real del CRM). Engram no disponible (contrato incompatible): sin espejo de memoria.
- L4 Decisión: la lista incluye todas las cuentas activas; trafficker sin señal aparece como "Sin datos". Presencia = `crm_task_presence.last_seen_at` (heartbeat existente, TTL 3 min).

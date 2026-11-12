# Usuarios: Equipo y Accesos

Toda persona con acceso habilitado puede consultar **Usuarios → Equipo**. En móvil se abre desde **Más → Usuarios**. **Accesos** solo aparece para administradores y conserva las invitaciones, las cuentas autorizadas, el cambio de correo, la desactivación, el cierre automático y la actividad de asesoras.

## Consultar presencia

1. Abre Usuarios: Equipo es siempre la primera pestaña.
2. Consulta los contadores y los grupos En línea / Ausentes / Sin datos.
3. Pulsa Actualizar para obtener nuevas señales. Si falla, aparece un aviso y puedes reintentar; una muestra anterior conserva su antigüedad.

| Estado | Significado |
| --- | --- |
| En línea | Última señal del CRM hace 3 minutos o menos (límite inclusivo). |
| Ausente | Hubo señal, pero hace más de 3 minutos. Muestra «Última vez hace …». No confirma una desconexión. |
| Sin datos | No hay señal registrada; no demuestra que la cuenta esté desconectada. |

La presencia no demuestra actividad laboral ni reemplaza el estado de acceso habilitado. Los nombres y roles se escapan antes de renderizarse. Equipo no recibe correos ni acciones de cuenta.

## Origen y actualización

- `list_team_presence()` devuelve todas las filas activas de `user_access`, unidas por usuario a `crm_task_presence.last_seen_at` (incluye señales antiguas, sin convertirlas en nulas).
- El heartbeat existente en `src/tasks/index.js` lo ejecutan agente, supervisor y admin al iniciar sesión y mediante el refresco existente de Tareas. Trafficker no lo ejecuta; si nunca tuvo señal aparece Sin datos. No se añade ningún heartbeat ni polling de red.
- La RPC devuelve marcas de tiempo del servidor, pero no la hora actual del servidor. La clasificación y los tiempos relativos usan el reloj del dispositivo: un reloj desajustado puede afectar el resultado. Diferencias futuras se muestran sin edades negativas.
- Solo abrir Usuarios o pulsar Actualizar consulta la RPC. Mientras el modal está abierto, un temporizador local de 15 s recalcula las edades y caduca En línea con la muestra disponible, sin red; se detiene al cerrar o salir de sesión. «Actualizado hace …» indica la antigüedad de la última consulta correcta, no una nueva lectura del servidor.
- Accesos se monta solo para admin y sus consultas solo se hacen al seleccionar esa pestaña. Los permisos de las RPC administrativas y de la función de invitación siguen imponiéndose en el servidor.

## Aplicación de la migración (humano)

Aplicar `supabase/migrations/202611130001_team_presence.sql` mediante el procedimiento habitual después de revisión. Esta implementación no la aplica. Requiere `user_access`, `crm_task_presence` e `is_active_user()` existentes.

La función es `stable`, `security definer`, con `search_path = public`; rechaza con `42501` a quien no tenga acceso activo. Solo `authenticated` recibe ejecución; `public` y `anon` no. No cambia tablas ni permisos de las funciones de Accesos.

Tras aplicarla, verificar con cuentas admin, agente, supervisor y trafficker: todas ven Equipo; solo admin ve Accesos. Verificar también el rechazo de una cuenta desactivada y de una solicitud anónima. Las pruebas locales de SQL son estáticas y no sustituyen estas comprobaciones reales de autorización.

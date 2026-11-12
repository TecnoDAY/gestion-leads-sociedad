# Usuarios: Equipo y Accesos

Toda persona con acceso habilitado puede consultar **Usuarios → Equipo**, incluidos los contadores de presencia. En móvil se abre desde **Más → Usuarios**. Solo **admin y supervisor** pueden abrir el historial de una persona. **Accesos** sigue siendo exclusivo de admin, sin cambios en sus acciones ni permisos.

## Consultar presencia

1. Abre Usuarios: Equipo es siempre la primera pestaña.
2. Consulta los grupos En línea / Ausentes / Sin datos y su resumen.
3. Pulsa Actualizar para obtener nuevas señales. Una muestra anterior conserva su antigüedad si falla la consulta; puedes reintentar.

| Estado | Significado y contador |
| --- | --- |
| En línea | Señal del CRM hace 3 minutos o menos (límite inclusivo). «En línea · desde 09:12 · 2 h 15 min» cuenta desde la primera señal del periodo registrado. Si aún no existe periodo, indica «Inicio del periodo sin registrar». |
| Ausente | Señal de hace más de 3 minutos. «Ausente · desde 13:40 · 45 min» cuenta desde la última señal y conserva «Última vez hace …». No confirma una desconexión. |
| Sin datos | No hay señal registrada; no demuestra que la cuenta esté desconectada. |

Las horas se muestran en **America/New_York (Miami)**. Para duraciones de un día o más se agrega la fecha y el contador conserva horas y minutos, por ejemplo «desde 12 nov, 05:30 · 1 día 1 h 30 min». Los contadores se recalculan localmente cada **30 s**, sin solicitudes de red. El reloj del dispositivo puede afectar la clasificación y el contador; nunca se muestran edades negativas.

**En línea = CRM abierto; no indica trabajo.** La presencia no reemplaza el estado de acceso habilitado. Equipo no recibe correos ni acciones de cuenta; nombres y roles se escapan al renderizar.

## Historial (admin y supervisor)

Toca una tarjeta para expandir el historial dentro de Usuarios. El panel tiene carga, vacío («Aún no hay historial registrado») y error con instrucciones de reintento. **Volver al equipo** o **Escape** cierra el historial y devuelve el foco a la tarjeta; otro Escape cierra Usuarios. Agente y trafficker ven tarjetas no interactivas y no llaman a la RPC de historial.

- **Hoy / Ayer:** periodos En línea y huecos Ausente, con horas de Miami y duración. Los periodos se recortan a cada medianoche local. «ahora» identifica un periodo cuya última señal estaba dentro de los 3 minutos al consultar.
- **Resumen semanal:** Esta semana (con fechas), Semana anterior, Hace 2 semanas y Hace 3 semanas; lunes a domingo en Miami, incluidos días de 23/25 horas por cambio de horario. Muestra En línea y Ausente, incluso semanas sin datos con totales cero.
- **En línea:** suma de duraciones registradas, recortadas a cada día y semana. Un periodo reciente cuenta hasta el momento de consultar; uno antiguo termina en su última señal.
- **Ausente:** tiempo entre la primera conexión y la última desconexión del día menos En línea; suma solo huecos internos. No cuenta el resto de la noche, antes de la primera conexión ni después de la última desconexión.

«Ausente = tiempo entre la primera conexión y la última desconexión del día. En línea = CRM abierto; no indica trabajo. Historial desde que se activó el registro.» La desconexión es estimada por última señal. El historial y el resumen son una instantánea: **una RPC al abrir**, no cambian con el contador local. Para actualizarlos, cierra y vuelve a abrir la persona.

## Registro y límites

- El heartbeat existente en `src/tasks/index.js` sigue ejecutándose para agente, supervisor y admin. Trafficker no envía señales; puede aparecer Sin datos. No se añade polling ni otro heartbeat.
- `crm_task_heartbeat()` conserva firma, permisos, upsert de presencia y bloqueo asesor/tarea. Dentro de esa misma llamada extiende el último periodo si la señal anterior tiene **5 minutos o menos**, o crea uno nuevo. Dos pestañas del mismo usuario usan el mismo bloqueo transaccional; los cortes de hasta 5 minutos se fusionan y no se cuentan como ausencia.
- **Retención de 35 días:** al enviar un heartbeat se borran los periodos de ese usuario cuya última señal sea anterior al límite. No hay job nuevo: registros de personas que no vuelven pueden permanecer almacenados hasta su siguiente señal; las consultas del historial se limitan a las cuatro semanas solicitadas. Un periodo largo aún reciente se conserva y se recorta al consultar.
- El historial comienza cuando se aplica la migración y llegan nuevas señales; no se reconstruye el pasado desde la última señal antigua. Una persona puede tener presencia anterior sin inicio de periodo conocido.
- `list_team_presence()` devuelve todas las cuentas activas con última señal e inicio del periodo que la contiene, sin correo. Solo abrir Usuarios o Actualizar consulta la lista. El temporizador de 30 s se detiene al cerrar o salir de sesión y no refresca datos del servidor: una muestra puede caducar aunque la persona continúe conectada.
- Cambiar de sesión, cerrar el panel o perder el rol invalida respuestas tardías del historial. Accesos se monta solo para admin; sus consultas se hacen al seleccionar esa pestaña y siguen autorizadas por servidor.

## Aplicación de la migración (humano)

La migración previa `supabase/migrations/202611130001_team_presence.sql` corresponde a S1–S6 y ya está aplicada según el registro ODD. Aplicar después **`supabase/migrations/202611140001_presence_periods.sql`** mediante el procedimiento habitual, tras revisión. Esta implementación **no accede a la DB ni aplica migraciones**.

La nueva migración es transaccional e idempotente. Crea `crm_presence_periods` con índices y RLS sin políticas directas; revoca tabla/secuencia a public, anon y authenticated. Las RPC son `security definer` con `search_path = public`. `list_team_presence()` sigue exigiendo usuario activo (`42501`); `get_presence_history(uuid)` exige caller activo con rol admin/supervisor (`42501`). Solo authenticated recibe ejecución, no public/anon. El cambio de retorno de la lista requiere drop/create, dentro de la transacción.

### Comprobación posterior

- Con cuentas admin, supervisor, agente y trafficker: todas ven Equipo y contadores; solo admin ve Accesos, solo admin/supervisor pueden abrir historial.
- Rechazo real de historial para agente, trafficker, usuario desactivado y llamada anónima, incluso invocando la RPC directamente.
- Dos pestañas simultáneas generan un solo periodo; comprobar fusión a 5 min, separación después de 5 min y limpieza por usuario después de 35 días.
- Comprobar periodos sobre medianoche, lunes y cambio de horario Miami; comparar los totales con señales conocidas. Validar carga/vacío/error, foco y pantallas angostas en navegador.

Las pruebas locales de SQL son **contratos estáticos**, no ejecutan PostgreSQL y no sustituyen las comprobaciones reales de permisos, concurrencia ni aritmética temporal. No hay verificación visual automatizada en esta entrega.

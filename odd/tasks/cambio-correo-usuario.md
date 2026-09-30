# Cambio de correo de un usuario existente desde el panel

## Objetivo

Que el administrador pueda cambiar el correo con el que inicia sesión un agente, supervisor o trafficker desde el panel de Gestión de accesos, sin crear otra cuenta, y que la persona solo complete el cambio tras confirmar el nuevo correo y definir una contraseña nueva.

## Problema y por qué

Hoy el panel solo permite invitar, listar y activar/desactivar usuarios (`authorize-user` + `admin_manage_user_access`). Si un asesor cambia de correo no hay ninguna vía administrativa: reinvitarlo crearía otra cuenta o mandaría un enlace de recuperación al correo antiguo, y `auth.admin.updateUserById({email})` cambia el correo de inmediato sin confirmar ninguna de las direcciones (documentación GoTrue: "changes are applied directly without confirmation flows"), lo que permite asignar un correo que quizá no controla el asesor.

Verificado el 2026-09-30 en fuente primaria (`/supabase/auth`):

- `PUT /admin/users/{id}` = cambio inmediato, borra los tokens pendientes (`ClearAllPendingTokens`): descartado como flujo principal.
- `PUT /user` (iniciado por la persona con sesión) = "change requires confirmation email": es el que mantiene el cambio pendiente hasta confirmar.
- `GET /verify` con `type=email_change` inicia sesión y redirige a la Site URL con el token en el fragmento: sirve para reutilizar la pantalla de establecer contraseña ya existente.
- `admin.generateLink({type:'email_change_new'})` devuelve el enlace sin enviarlo; `resend({type:'email_change'})` es el que enviaría el correo.
- Si `SECURE_EMAIL_CHANGE_ENABLED` está activo exige confirmar desde los dos correos. **Pendiente de comprobar en el proyecto real (T1).**

## Alcance

- Acción «Cambiar correo» en el panel de Gestión de accesos, solo visible y ejecutable por administradores.
- Validación del correo nuevo (formato y que no esté en uso en Auth ni en `user_access`).
- Envío al correo nuevo de un enlace que confirma la dirección y deja sesión activa.
- Pantalla de establecer contraseña tras confirmar (reutiliza la existente).
- Sincronización de `user_access.email` con `auth.users.email` sin tocar `user_id`, `role` ni `activo`.
- Verificación remota del flujo completo con un usuario desechable antes de tocar datos reales.

**Fuera de alcance**: cambio de contraseña administrativa, creación de cuentas nuevas, cambio de correo autoservicio por parte del asesor, doble factor/MFA, plantillas de correo personalizadas, cambiar la configuración de `SECURE_EMAIL_CHANGE_ENABLED` del proyecto.

## Restricciones

- Sin dependencias nuevas; vanilla JS + supabase-js v2 (CDN) + Edge Functions en Deno.
- El servidor nunca recibe ni guarda una contraseña en claro.
- Ningún token, cookie ni clave en logs ni en el cliente.
- Respuestas que no filtren si un correo existe a llamadores no autorizados.
- No commit, push, PR, merge ni deploy sin petición explícita del humano.

## No romper

- Contrato de `authorize-user`: `202 {accepted:true}` en casi todos los caminos, `400 {error:'invalid_role'}` solo para rol inválido, sin enumeración de correos. Su README debe seguir describiéndolo igual.
- Flujo de invitación existente: `inviteUserByEmail` → fragmento `type=invite` → modal de establecer contraseña → entrar.
- Flujo de recuperación: «¿Olvidaste tu contraseña?» → fragmento `type=recovery` → mismo modal.
- `pendingPasswordSetup` se lee **antes** de `createClient` y no debe borrarse si el modal ya está abierto (no borrar lo escrito al reenfocar).
- Políticas RLS, helpers (`is_admin_user`, `is_supervisor`, `is_crm_user`, `is_active_user`) y RPCs existentes sin cambios de semántica.
- `user_access`: `email` minúsculas y con `trim`, única (`user_access_email_key`), `user_id` único.
- `npm run build` y `npm run lint` (tsc + `scripts/check-app.mjs` incluida la regla de tema claro) en verde.

## TDD

Modo: off | Fuente: default | Runner: `npm run build && npm run lint` (checks funcionales obligatorios) + verificación remota por SQL de solo lectura.

## Tareas

- [x] **T1 Verificación acotada del flujo nativo.** Hecha con una Edge Function temporal (sin `.env`): usuario desechable, estadia A→B, lectura de `auth.users` antes/después y borrado al final. Ver **Evidencia**.
- [x] **T2 Migración de sincronización.** Trigger `AFTER UPDATE ON auth.users` que copie `email` (normalizado) a `user_access.email` cuando cambie, respetando las restricciones de unicidad; idempotente y sin tocar `user_id`, `role` ni `activo`. **Aplicada** en el remoto y verificada (trigger + permisos).
- [x] **T3 Edge Function `change-user-email`.** Admin-only con bearer, valida correo nuevo, estadia y envía el enlace con `PUT /user`, responde de forma no enumerativa. README de contrato en `supabase/functions/change-user-email/README.md`. **Desplegada y verificada byte a byte.**
- [x] **T4 Panel.** Botón «Cambiar correo» por fila, formulario inline con el correo nuevo, feedback de error/éxito y aviso de las dos confirmaciones. Solo admin; el correo no se interpola en `onclick`, se resuelve por id.
- [x] **T5 Pantalla de contraseña tras confirmar.** `email_change` añadido a la detección de `pendingPasswordSetup`. `onAuthStateChange` no necesita cambios: el retorno emite `SIGNED_IN`, que ya está en la lista.
- [ ] **T6 Verificación.** Gates locales hechos (ver abajo); quedan la revisión de políticas/RLS afectadas, el smoke HTTP tras el despliegue y la evidencia remota del flujo completo con una cuenta real.

## Criterios de aceptación

- [ ] El administrador ve «Cambiar correo» en Gestión de accesos y el formulario valida formato y correo duplicado.
- [ ] Tras guardar, llega un correo **al nuevo** con un enlace de un solo uso; el correo antiguo sigue funcionando hasta confirmar.
- [ ] Al confirmar, la misma cuenta (`user_id` sin cambios) queda con el correo nuevo y `user_access.email` refleja el cambio.
- [ ] La persona acaba en la pantalla de establecer contraseña y entra con correo nuevo + contraseña nueva.
- [ ] No se crea ninguna cuenta adicional ni se pierde rol, estado ni historial.
- [ ] Un llamador sin sesión o sin rol admin no puede ejecutar el cambio y no obtiene información sobre si un correo existe.
- [ ] `npm run build`, `npm run lint` y `git diff --check` en verde.

## Decisiones aceptadas

- No se usa `admin.updateUserById({email})` como flujo principal: cambia sin verificar la nueva dirección.
- Se reutiliza la pantalla de establecer contraseña existente en lugar de crear un modal nuevo.
- El gate de contraseña es blando, igual que en el flujo de invitación: quien no confirma el enlace no cambia de correo, y quien cierra la pestaña puede volver a entrar y completarlo más tarde.
- Si el proyecto exige doble confirmado, se acepta el paso extra al correo antiguo en lugar de desactivar la protección del proyecto.
- La sincronización es por trigger en base de datos, no por llamada del cliente: no depende de que la pestaña esté abierta.

## Reutilización investigada

- `supabase/functions/authorize-user/index.ts`: patrón de autenticación admin, normalización de correo, respuestas 202 y `getServiceRoleKey()`. Se replica, no se reimplementa.
- `index.html`: `pendingPasswordSetup` + `openSetPassword()` + `handleSetPassword()` ya implementan el paso de contraseña; solo hay que detectar el nuevo `type`.
- `admin_manage_user_access`: ya hace listado y activación admin-only; el cambio de correo no debe meterse ahí porque necesita la clave de servicio y el cliente no la tiene.
- Decisión: función nueva `change-user-email` en lugar de ampliar `authorize-user` (responsabilidades distintas: dar de alta vs mutar una cuenta existente) y en lugar de una acción RPC (RPC autenticado no puede llamar a la API de Auth).

## Evidencia

### T1 — Verificación acotada (2026-09-30, Edge Function temporal `auth-email-change-probe`)

Sonda desplegada, usada y retirada (vuerión 5 = stub `410`, `verify_jwt:true`; los 4 usuarios desechables `probe-*` borrados, `count(*) = 0`). No hubo que tocar `.env`: la sonda usó su propia clave de servicio dentro de Supabase.

| Pregunta T1 | Resultado |
| --- | --- |
| ¿Se estadia el cambio? | Sí. `admin/generate_link {type:'email_change_new'}` escribe `email_change`, `email_change_sent_at`, `email_change_confirm_status=0` y `email_change_token_new` (56 chars), **sin enviar correo** y sin tocar `email`. |
| ¿Está activo el doble confirmado? | **Sí** (`SECURE_EMAIL_CHANGE_ENABLED`). |
| Primer clic (correo nuevo) | `303` → `#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email` → **sin sesión**; estado `0 → 1`. |
| Segundo clic (correo antiguo) | `303` → `#access_token=…&refresh_token=…&type=email_change` → **sí deja sesión**; `email` pasa a ser el nuevo, `email_change` y tokens a cero. |
| ¿Qué `type` llega en el fragmento? | `email_change` (con `access_token`, `refresh_token`, `expires_in`, `token_type`). |
| ¿Misma cuenta? | Sí: `sub` del JWT y `id` de `auth.users` idénticos antes/después; solo cambia `email`. |
| ¿Los dos tokens coexisten? | Sí: tras `email_change_new` + `email_change_current` → `tok_new=56`, `tok_cur=56`, `status=0` (así funciona `PUT /user` en producción). `email_change_current` **resetea** `email_change_confirm_status` a 0, por lo que no sirve ir mintiendo enlaces uno a uno tras la primera confirmación. |
| Validación de correo | `PUT /user` rechaza la dirección **actual** si el dominio no es entregable: `example.com` tiene null MX (`0 .`) → `400 email_address_invalid`. Los dominios reales (gmail, el de la empresa) pasan. |
| Límites de envío | 429 `over_email_send_rate_limit` de dos tipos: «For security purposes… after N seconds» (ventana de 60 s por usuario, la dispara también `generate_link`) y «email rate limit exceeded» (**project-wide**). Documentación Supabase: 2 correos/hora con SMTP integrado, 30/hora con SMTP propio, solo configurable con SMTP propio. |

Decisiones que salen de T1:

- **Mecanismo**: `PUT /user` con sesión de la persona (mint vía `admin/generate_link {type:'recovery'}` → `verify` → `PUT /user {email}`). Es el único que envía **los dos** correos de golpe y el único que no consume una llamada extra de presupuesto de correo; `generate_link`+`resend` no llega a entregar el enlace del correo antiguo (sin ese enlace el flujo no se puede completar).
- El `type` a detectar en el cliente es `email_change` (T5).
- La función debe devolver un error claro en `429` (presupuesto de correo del proyecto), sin reintentar en bucle.
- Efecto secundario a documentar: mintear la sesión registra un evento `login` y actualiza `last_sign_in_at` del usuario objetivo; los tokens se descartan dentro de la función y nunca salen de ella.

### T2 — Migración

`supabase/migrations/202609300001_sync_user_access_email.sql` **aplicada** el 2026-09-30 (ver «Aplicación y despliegue»).

### Aplicación y despliegue (2026-09-30)

Herramienta: MCP `supabase` sobre el proyecto `hkkuyomlcqyxtzblowle`. Autorización humana recibida antes de tocar el remoto.

**Pre-flight (read-only)**

- `list_migrations` → 4 migraciones previas; la de esta feature no aplicada.
- `list_edge_functions` → `authorize-user` v4 y `auth-email-change-probe` v5; `change-user-email` **no existía**, así que no había cuerpo remoto que sobrescribir.

**Migración**

- `apply_migration({name:'sync_user_access_email', …})` → `{"success": true}`.
- Relectura con `execute_sql`:
  - trigger `on_auth_user_email_sync` sobre `auth.users`: `CREATE TRIGGER … AFTER UPDATE OF email ON auth.users FOR EACH ROW WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text)) EXECUTE FUNCTION sync_user_access_email()`, `tgenabled = 'O'`.
  - función `sync_user_access_email`: `prosecdef = true`, `proconfig = search_path=""`, `anon EXECUTE = false`, `authenticated EXECUTE = false`, `service_role EXECUTE = true`, comentario = el del fichero.
  - `user_access` = 4 filas antes y 4 después (sin escrituras de datos desde el agente).

**Edge Function**

- `deploy_edge_function({name:'change-user-email', verify_jwt:false, …})` → `status ACTIVE`, `version 1`, `verify_jwt false`.
- Contenido **verificado byte a byte** tras el deploy con `get_edge_function`: `fnv1a = 4273848566` y `8350` caracteres tanto en el fichero local como en el remoto (el fichero se sirvió por HTTP local para no transcribirlo a mano). `verify_jwt:false` está justificado: la función hace su propia autenticación admin, igual que `authorize-user`.

**Smoke HTTP** (5 casos contra `…/functions/v1/change-user-email`)

| Caso | Status | Cuerpo |
| --- | --- | --- |
| Sin `Authorization` | 202 | `{"accepted":true}` |
| Bearer falso | 202 | `{"accepted":true}` |
| Body que no es JSON | 400 | `{"error":"invalid_request"}` |
| Método `GET` | 405 | `{"error":"method_not_allowed"}` |
| `targetUserId` que no es uuid | 202 | `{"accepted":true}` |

- **Efectos laterales: 0.** Recuento antes/después idéntico: `user_access = 4`, `auth.users = 4`, `auth.users con email_change <> '' = 0`.
- `query_logs`: 5 invocaciones registradas con `202, 405, 400, 202, 202`; **ningún 500**.

**Lo que falta de T6**: la prueba positiva (admin real → correo → confirmación → contraseña). No la puedo hacer yo: no tengo credenciales de ninguna cuenta. Se hace desde el panel con el navegador del humano.

## Progreso

Estado: **T1–T5 completadas y aplicadas en el remoto**; solo queda T6 (prueba real) y el commit cuando se pida.

Gates locales (2026-09-30):

- `npm run build` → `dist/index.html 321.77 kB (gzip 67.43)` ✓
- `npm run lint` → `check-app: OK (3 bloques, 2 regras)`, tema claro `76 sobrescrituras, 1093 utilidades` ✓
- `git diff --check` y `git diff --cached --check` → sin whitespace errors ✓
- `qa-gate` → exit 0. Dos avisos, ninguno de este cambio: el `console.log('Email change requested', …)` es traza de auditoría intencional (solo dos uuid, sin tokens ni correos) y `fichero sensible rastreado: .env.example` es un fichero preexistente que solo contiene placeholders (`MY_GEMINI_API_KEY`, `MY_APP_URL`). `qa-gate --strict` devuelve 1 por ese `.env.example` preexistente.

Remoto (2026-09-30): migración aplicada y verificada, `change-user-email` desplegada (v1, `ACTIVE`, `verify_jwt:false`, contenido idéntico al local), smoke de 5 casos en verde y sin efectos laterales.

Última tarea: aplicación + despliegue + smoke (skill `supabase-apply-lite`).
Siguiente paso: prueba real desde el panel (T6) — admin abre Gestión de accesos → «Cambiar correo» → la persona confirma en el correo nuevo y después en el antiguo → pantalla de contraseña. Después, commit y push **solo si el humano lo pide**.
Bloqueos: ninguno técnico. La prueba final necesita una persona con sesión de admin y acceso a los dos buzones.

Nota: la sonda temporal `auth-email-change-probe` quedó en la versión 5 = stub `410` con `verify_jwt:true` (el MCP no tiene herramienta para borrar funciones); sus 4 usuarios `probe-*` fueron borrados (`count(*) = 0`). Conviene eliminarla desde el dashboard cuando se quiera.

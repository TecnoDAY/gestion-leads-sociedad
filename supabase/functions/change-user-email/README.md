# change-user-email

Cambia el correo de una cuenta existente desde el panel de Gestión de accesos, con confirmación por correo y sin crear otra cuenta.

- `POST /functions/v1/change-user-email`
- `verify_jwt: false` con autenticación propia en el cuerpo de la función (igual que `authorize-user`): el gateway no valida nada, la función sí.
- Cabecera: `Authorization: Bearer <access token de un usuario con rol admin y activo>`.
- Cuerpo: `{ "targetUserId": "<uuid>", "newEmail": "<correo>" }`.

## Respuestas

| Código | Cuerpo | Cuándo |
| --- | --- | --- |
| `202` | `{accepted:true}` | Cambio estadiado y correos enviados. También es la respuesta de cualquier llamador **no autorizado** (sin bearer, token inválido, sin rol admin, `targetUserId` no uuid): la misma respuesta para no revelar si una cuenta o un correo existen. |
| `400` | `{error:'invalid_email'}` | Formato de correo inválido, o GoTrue lo rechaza (dominio no entregable). |
| `400` | `{error:'same_email'}` | El correo nuevo coincide con el actual. |
| `400` | `{error:'email_taken'}` | El correo ya está en uso en `auth.users` o en `user_access`. |
| `400` | `{error:'change_rejected'}` | GoTrue rechazó el cambio por un motivo no mapeado (se registra en el log). |
| `405` | `{error:'method_not_allowed'}` | Cualquier método distinto de `POST`. |
| `429` | `{error:'email_rate_limit'}` | Presupuesto de correo del proyecto agotado (2/hora con SMTP integrado). |
| `500` | `{error:'internal'}` | Fallo interno. Solo se devuelve a quien ya se había autorizado. |
| `503` | `{error:'service_unavailable'}` | Faltan `SUPABASE_URL` o la clave de servicio. |
| `404` | `{error:'user_not_found'}` | El `targetUserId` no está en `user_access` o no existe en Auth. |

## Qué hace por dentro

1. Autoriza al llamador: `auth.getUser(bearer)` + `user_access.role = 'admin'` y `activo = true`.
2. Valida que el destino exista en `user_access` y en Auth, que el correo nuevo tenga formato válido y no esté en uso.
3. `admin.generateLink({type:'recovery'})` → `POST /verify` para obtener una sesión **temporal de la persona**. Esa sesión y su refresh token nunca salen de la función: no se registran ni se devuelven, y se descartan al terminar.
4. `PUT /user {email}` con esa sesión: es el flujo nativo de GoTrue, así queda **pendiente de confirmación** (no cambia nada todavía) y Supabase envía los correos de confirmación a las dos direcciones.
5. Devuelve `202` y descarta los tokens.

## Qué no hace

- No aplica el cambio: solo lo estadia. Se aplica cuando la persona confirma sus correos.
- No crea cuentas, no toca `user_id`, `role` ni `activo`.
- No recibe ni guarda ninguna contraseña en claro.
- No cambia la configuración `SECURE_EMAIL_CHANGE_ENABLED` del proyecto (doble confirmación activa).

## Efectos observables

- Al confirmar **el primer** enlace (da igual cuál de los dos) GoTrue responde `#message=Confirmation link accepted...` y deja el cambio en `email_change_confirm_status = 1`; **no** hay sesión todavía.
- Al confirmar el **segundo**, GoTrue redirige con `#access_token=...&type=email_change` y `email` pasa a ser el nuevo. El `sub` del JWT no cambia: es la misma cuenta.
- Mintear la sesión del paso 3 escribe un evento `login` en el audit log de Auth y actualiza `last_sign_in_at` del usuario objetivo. Es un efecto secundario del flujo nativo, no una entrada real de la persona.
- La sincronización `auth.users.email` → `user_access.email` la hace el trigger `on_auth_user_email_sync` (migración `202609300001`), no esta función.

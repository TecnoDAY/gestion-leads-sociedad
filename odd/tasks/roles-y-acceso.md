# Roles, alta por invitacion y recuperacion de clave

## Objetivo
Consolidar el acceso del CRM: cuatro roles (admin, supervisor, agente, trafficker) con
permisos aplicados en Supabase, alta desde el panel por invitacion para que cada usuario
defina su propia clave, y recuperacion de clave desde la pantalla de inicio de sesion.

## Problema y por que
- `authorize-user` solo admite `admin|agente` y **convierte cualquier otro valor en `agente`**
  (`normalizeRole`, `authorize-user/index.ts:25`). Un `trafficker` pedido desde el panel
  se daria de alta como agente sin aviso.
- El alta usa `auth.admin.createUser({ email_confirm: true })` **sin clave**
  (`authorize-user/index.ts:94`): la cuenta queda confirmada pero sin posibilidad de
  iniciar sesion con `signInWithPassword`, y no se envia ningun correo. El flujo no cierra.
- No existe `resetPasswordForEmail` en toda la app: una clave olvidada no tiene salida.
- El rol `supervisor` (aprobado) no existe en el check de `user_access` ni en el panel.
- `is_campaign_editor()` esta definida pero **no se invoca en ningun sitio**: el guard real
  de `upsert_campaign_stat` repite la lista de roles en linea (`202609290001:121`).
- El panel `lead_appointments` esta limitado a `is_admin_user() or advisor_user_id = auth.uid()`,
  asi que un supervisor (no asesor) veria la pestana Citas vacia.

## Alcance
1. **Migracion `202609290002_supervisor_role.sql`**: rol `supervisor`, helpers, politicas.
2. **Panel**: selector con los cuatro roles y aviso de que se envia invitacion.
3. **Edge Function `authorize-user`**: acepta los cuatro roles, **rechaza** el invalido
   con 400 en lugar de degradarlo a `agente`, y provisiona con `inviteUserByEmail`.
4. **Login**: enlace "Olvidaste tu contraseña" y pantalla bloqueante para definir la
   clave cuando el retorno viene de un enlace de invitacion o recuperacion.
5. **Frontend de rol**: `isSupervisor`, distintivo, edicion de campanas y filtro de asesora.

## Fuerade de alcance (fases posteriores)
- Google Sign-In (bloqueado: requiere credenciales OAuth de Google Cloud).
- MFA TOTP para administradores.
- Eliminacion permanente de cuentas (pendiente de decidir si conserva o borra historial).
- Cambiar el rol de Miguel de admin a supervisor (decision explicita del humano).

## Restricciones
- No exponer ni almacenar claves: solo Supabase Auth guarda el hash.
- No hacer commit, push, PR, merge ni deploy (migracion remota ni Edge Function desplegada)
  sin peticion explicita.
- Sin dependencias nuevas; sin romper `signInWithPassword` ni la validacion de `user_access`.
- Roles en `user_access` siguen siendo texto validado por CHECK.

## No romper
- Contrato `user_access`: `user_id, email, nombre, role, activo`.
- Respuesta `202 {accepted:true}` de `authorize-user` para todos los caminos que no sean
  rol invalido (no enumerar correos).
- Politicas y RPC existentes de leads, notas, citas y reporte diario: el supervisor entra
  con los mismos limites que un agente, nunca con los de admin.
- `npm run build`, `npm run lint` (`tsc --noEmit` + `check-app.mjs`) y `git diff --check`.
- Reglas de `scripts/check-app.mjs`: sintaxis de cada bloque `<script>`, sin `catch` vacio,
  cobertura de tema claro para toda utilidad `bg|border|divide|ring|placeholder` nueva.

## TDD
Modo: off
Fuente: default (el proyecto no define politica ni tiene suite de tests: `npm run test` no existe)
Runner: `npm run build && npm run lint && git diff --check`

## Tareas
- [x] T1. Migracion `supabase/migrations/202609290002_supervisor_role.sql`: check de rol con
      los cuatro valores, `is_supervisor()`, `is_crm_user()` e `is_campaign_editor()` con
      `supervisor`, `upsert_campaign_stat` usando `is_campaign_editor()`, politicas de
      lectura de `lead_appointments` y `lead_appointment_events` para supervisor.
- [x] T2. Panel: `authorizeRole` con las cuatro opciones y nota de invitacion.
- [x] T3. `authorize-user`: `normalizeRole` que devuelve `null` si el rol no es valido y
      responde 400 `invalid_role`; sustituir `createUser` por `inviteUserByEmail`, con
      `resetPasswordForEmail` de respaldo si la cuenta ya existe.
- [x] T4. Login: boton de recuperacion, deteccion del tipo de enlace antes de `createClient`,
      modal de definicion de clave y alta de `PASSWORD_RECOVERY` en el listener.
- [x] T5. Rol supervisor en frontend: flag, distintivo, edicion de campanas y filtro de
      asesora en Citas.
- [x] T6. Verificacion local: build, lint, diff check, qa-gate y revision independiente
      read-only. **Pendiente la verificacion remota** (migracion y Edge Function sin aplicar).

## Criterios de aceptacion
- [ ] `user_access.role` admite `admin|agente|trafficker|supervisor` y rechaza otros valores.
- [ ] Un `role` desconocido a `authorize-user` devuelve `400 {error:'invalid_role'}` y no
      crea ni modifica ninguna cuenta.
- [ ] El alta envia una invitacion: el usuario abre el enlace y define su clave.
- [ ] La pantalla de login permite restablecer la clave y muestra confirmacion sin revelar
      si el correo existe o no.
- [ ] Un enlace de invitacion o recuperacion abre la pantalla de clave antes de entrar a la app.
- [ ] El supervisor: lee todo el CRM, edita leads/gestiones/notas/citas como agente,
      edita campanas como trafficker, no ve ni ejecuta ninguna accion admin.
- [ ] El trafficker sigue sin ver filas del CRM (politicas con `is_crm_user()` intactas).
- [ ] El admin y el agente conservan exactamente los permisos que tenian.
- [ ] El selector de roles ofrece los cuatro valores.
- [ ] `npm run build`, `npm run lint` y `git diff --check` pasan.

## Decisiones aceptadas
- **Lectura total del supervisor en el CRM**, escritura limitada a agente + trafficker:
  aprobado por el humano al elegir "Escritura agente y trafficker" y despues al pedir
  "implementa el plan como recomiendas".
- El supervisor **no** obtiene acciones exclusivas de admin (`update_lead_full`,
  `archive_lead`, `restore_lead`, `update/delete_lead_note`, `delete_campaign_stat`,
  `admin_manage_user_access`): conservan `is_admin_user()`.
- El supervisor solo cambia el estado de citas propias (como un agente); como no es asesor,
  en la practica su escritura en Citas es nula. Es una consecuencia del alcance aprobado,
  no una contradiccion: la supervision de citas es de lectura.
- Se ensancha la lectura de `lead_appointments`/`lead_appointment_events` al supervisor:
  sin eso la pestana Citas le saldria vacia y "visualizar todo" no se cumpliria.
- `authorize-user` sigue contestando `202 {accepted:true}` en todos los caminos salvo rol
  invalido: no se abre enumeracion de correos. El feedback granular al admin queda fuera.
- Si la cuenta ya existe, la reinvitacion envia un enlace de restablecimiento: da salida
  al caso "reenviar acceso" y a las cuentas dadas de alta sin clave por el flujo antiguo.
- No se pasa `redirectTo` en ningun lado: se usa la **Site URL** de Supabase, un unico punto
  de configuracion en lugar de dos.
- La puerta de "definir clave" es blanda (deteccion en la URL): si se cierra la pestana sin
  definir clave, la salida es el enlace "Olvidaste tu contraseña". No se anade columna ni RPC.
- `trafficker` y `supervisor` en el selector del panel; `normalizeRole` deja de degradar
  roles desconocidos a `agente`.
- Tecnologia y Miguel siguen siendo admin (decision previa del humano).

## Reutilizacion investigada
- **`auth.admin.inviteUserByEmail`**: es la via canonica de Supabase para "el admin crea,
  el usuario pone su clave". `POST /invite` crea el usuario si falta o reutiliza uno sin
  confirmar; `GET/verify?type=invite` devuelve sesion en el fragmento y redirige a la Site
  URL. Fuente: docs de Supabase Auth (`/invite`, `/verify`).
- **auth-js (GoTrueClient.ts, master)**: `flowType` por defecto es `'implicit'`
  (linea 166) y `detectSessionInUrl: true`; el retorno llega como
  `#access_token=...&type=invite|recovery` y `_getSessionFromURL` limpia el hash (linea 1999).
  El evento emitido es `PASSWORD_RECOVERY` solo si `type === 'recovery'`, si no `SIGNED_IN`
  (lineas 452-457). Por eso la deteccion se hace **leyendo el hash antes de `createClient`**,
  no por el nombre del evento.
- **`resetPasswordForEmail` + `updateUser({password})`**: patron documentado de recuperacion;
  se reutiliza como red de seguridad de la invitacion.
- **Helpers existentes**: se reutilizan `is_active_user`, `is_admin_user`, `is_crm_user`,
  `is_campaign_editor`, `admin_manage_user_access` y el listener `onAuthStateChange`; no se
  crea ningun sistema de sesion propio.
- **Alternativas descartadas**: (a) sistema de claves propio — innecesario y peor que Supabase
  Auth; (b) `createUser` + correo de recuperacion en dos pasos — peor UX, dos acciones;
  (c) columna `password_set` en `user_access` + RPC para endurecer la puerta — anade esquema
  y una superficie de escritura nueva para un problema que resuelve el enlace de recuperacion;
  (d) detectar el tipo de enlace por el evento `PASSWORD_RECOVERY` — no cubre `type=invite`.

## Evidencia

### Hallazgo corregido durante la implementacion
El upsert de `user_access` en `authorize-user` usaba `onConflict: 'email'`, pero el unico
indice unico existente era `user_access_email_idx ON ... USING btree (lower(email))`.
PostgreSQL no puede inferir `ON CONFLICT (email)` a partir de un indice sobre
`lower(email)`, asi que el upsert fallaba con `42P10` y el alta se perdia en silencio
(la funcion devuelve 202 en todos los caminos). Confirmado consultando el catalogo real:
no existia ningun indice ni constraint unico sobre `email`. Se anade
`create unique index if not exists user_access_email_key ... (email)`; con el CHECK
`email = lower(btrim(email))` ese indice es equivalente al de `lower(email)` y no cambia
que filas son validas.
Los logs de Edge no registran ninguna invocacion previa de `authorize-user`, coherente con
que el flujo de alta nunca llego a funcionar.

- T1 — `supabase/migrations/202609290002_supervisor_role.sql` creado. Verificado con
  `diff` de los cuerpos extraidos: `upsert_campaign_stat` difiere de `202609290001` en
  **una sola linea** (`access.role not in ('admin','trafficker')` →
  `not public.is_campaign_editor()`). 4 `create or replace function`, 8 `$$` emparejados,
  `begin;`/`commit;` unicos. **Sin ejecutar en remoto.**
- T2 — `index.html`: selector con `agente|trafficker|supervisor|admin`, titulo
  `Gestion de accesos`, boton `Autorizar y enviar invitacion` y nota de invitacion.
- T3 — `authorize-user/index.ts`: `ROLES` + `normalizeRole -> Role | null`, `400
  invalid_role` justo tras la validacion de email y antes de cualquier trabajo de auth o
  escritura; `inviteUserByEmail` sustituye a `createUser`; `resetPasswordForEmail` de
  respaldo cuando la cuenta ya existe. `README.md` actualizado. **Sin desplegar.**
- T4 — `index.html`: deteccion del `type` del fragmento antes de `createClient`
  (lineas 1423-1433), gate en `enterAuthenticatedSession` (1727), `openSetPassword`
  idempotente (no borra lo tecleado en reentradas por `focus`/`visibilitychange`),
  `handleSetPassword` con validacion, `handlePasswordReset`, `PASSWORD_RECOVERY` anadido
  al listener de `onAuthStateChange`, y `modalSetPassword`/`formSetPassword` en las listas
  de limpieza de `clearSessionState`.
- T5 — `index.html`: `isSupervisor`, distintivo `Supervisor`, `canEditCampaigns()` como
  fuente unica de la edicion de campanas (3 usos) y filtro/fuente de asesora de Citas
  con `isAdmin || isSupervisor` (3 usos). Todas las guardas `isAdmin` de escritura y de
  administracion quedan intactas.
- T6 — Local:
  - `npm run build` → `dist/index.html 316.34 kB` (gzip 66.15 kB), OK.
  - `npm run lint` → `tsc --noEmit` OK; `check-app` 3 bloques OK, tema claro OK
    (76 sobrescrituras, 1079 utilidades), 2 reglas OK.
  - `git diff --check` OK (sin conflictos de espacios).
  - `qa-gate` → exit 0, unico aviso preexistente (`fichero sensible rastreado:
    .env.example`), ningun patron de las lineas anadidas.
  - Verificador independiente `explore` (read-only, sesion `ses_f10f1153bffeoltlhHW23P554Q`)
    reviso migracion, Edge Function y frontend. Hallazgos atendidos abajo.

### Aplicacion remota (autorizada por el humano el 2026-09-29)
- `apply_migration` `supervisor_role_and_access` → `{"success": true}`.
  Verificado con queries read-only:
  - `user_access_role_check` → `role = ANY (ARRAY['admin','agente','trafficker','supervisor'])`.
  - `user_access_email_key` → `CREATE UNIQUE INDEX ... (email)` junto al existente de `lower(email)`.
  - `is_supervisor`, `is_crm_user`, `is_campaign_editor` → los tres contienen `supervisor`.
  - `upsert_campaign_stat` → `HAS_GUARD=yes`, `OLD_GUARD=no`.
  - Politicas de `lead_appointments` y `lead_appointment_events` → ambas con
    `is_active_user() AND is_crm_user() AND (is_admin_user() OR is_supervisor() OR ...)`.
  - `user_access` sigue con las 3 filas originales (Miguel admin, Tecnologia admin, Jessica agente).
- `deploy_edge_function` `authorize-user` → version **4**, `status ACTIVE`, `verify_jwt: false`
  (se conserva el valor previo: la funcion hace su propia autenticacion y la via
  bootstrap no lleva JWT).
  - `get_edge_function`: contiene `inviteUserByEmail`, `invalid_role` y
    `resetPasswordForEmail`; **ya no** contiene `email_confirm: true`.
    Identidad de contenido probada: 174 lineas en local y en remoto, misma cola
    (`return result === 0; }`), y 7083 codepoints locales - 1 (el `\n` final que el
    despliegue no conserva) = 7082 code units remotos. Las unicas 2 clases no-ASCII
    son las dos `ñ` de los comentarios.
- Smoke test HTTP (sin side effects, comprobado despues: `auth.users` = 0 filas para la
  direccion de prueba y `user_access` = 3 filas):
  - `role:"bogus"` → **400 `{"error":"invalid_role"}`** (comportamiento nuevo).
  - `email` invalido → 202 `{"accepted":true}` (contrato no enumerativo intacto).
  - `role` valido sin autenticacion → 202 `{"accepted":true}` y **no** crea nada.

### Hallazgos del verificador y acciones
1. **Cuerpo de `upsert_campaign_stat` idem al remoto salvo el guard** → PASS, probado con
   `diff -u` (1 linea).
2. **`resetPasswordForEmail` dentro del `try` principal** → el `catch` externo devuelvia
   202 (no rompe el contrato no enumerativo), pero una excepcion de envio saltaria el
   upsert de `user_access` y el rol no se escribiria. **Corregido**: el envio va ahora en
   su propio `try/catch` que solo loguea, de modo que el alta del rol se completa aunque
   el correo falle.
3. **Riesgo de pantalla en blanco** → ya cubierto: `handleSetPassword` devuelve
   `modalLogin` si la validacion posterior falla; `clearSessionState` lo muestra.
4. **Reentrada de `openSetPassword`** → PASS tras el guard de idempotencia.
5. **Conjuntos de roles** → PASS: `ROLES` (Edge), `authorizeRole` (panel) y
   `user_access_role_check` (migracion) coinciden en `admin|agente|trafficker|supervisor`.
6. **Aislamiento de trafficker** → PASS: `is_crm_user()` sigue excluyendolo de las 6
   politicas de lectura del CRM; el guard de escritura de `create_lead_appointment`
   (`role = 'trafficker'`) no se toco.

## Progreso
Estado: implemented y aplicado en remoto (fase 1)
Ultima tarea: T6 (verificacion local + remota)
Siguiente paso: prueba end-to-end con un correo real desde el panel (invitacion → abrir
enlace → definir clave → entrar con `signInWithPassword`) y revisar que la Site URL de
Supabase apunta a la app para que los enlaces de invitacion y de recuperacion lleguen.
Bloqueos: fase 1 sin bloqueos. Fases 2 (Google, requiere credenciales OAuth de Google
Cloud) y 3 (MFA/eliminacion permanente, requiere decision sobre el historial) siguen fuera
de alcance. El rol de Miguel sigue en `admin` por decision explicita del humano.

### Nota de entrega
`index.html` arrastraba cambios sin commitear del visual refresh: los de esta feature
quedan encima en el mismo fichero, asi que un commit futuro los mezcla salvo que se
separen por hunks (`git add -p`). Tampoco se ha hecho commit, push ni ninguna otra
modificacion sin peticion explicita.

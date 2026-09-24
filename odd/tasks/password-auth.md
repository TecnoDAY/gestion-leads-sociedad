# Acceso por correo y contraseña

## Objetivo
Cambiar el acceso del dashboard de enlace mágico OTP a correo y contraseña para no depender del límite de correo gratuito de Supabase.

## Problema y por que
El proveedor de correo integrado de Supabase tiene un límite muy bajo y muestra `email rate limit exceeded`. Los usuarios se administran manualmente en Supabase Auth y `public.user_access`, por lo que el correo no necesita ser el mecanismo de autenticación.

## Alcance
- Cambiar el modal de `index.html` para solicitar correo y contraseña.
- Usar `supabaseClient.auth.signInWithPassword` en el login.
- Mantener la validación de sesión contra `public.user_access` y `activo = true`.
- Mantener intactos roles, permisos RPC, RLS, archivado y carga de leads.
- Mantener la Edge Function y la migración SQL sin cambios.

## Restricciones
- No almacenar contraseñas en `public.user_access` ni en el frontend.
- No permitir acceso solo por correo: la contraseña la administration de Supabase Auth.
- No cambiar la estructura de `user_access`.
- No hacer commit, push ni deploy sin una peticion explicita adicional.

## No romper
- Contrato de `user_access`: `user_id`, `email`, `nombre`, `role`, `activo`.
- Sesiones existentes y validacion de usuarios desactivados.
- RPCs de leads y permisos de administrador/agente.
- Build, lint y carga completa de leads.

## TDD
Modo: off
Fuente: default
Runner: `npm run build`, `npm run lint`, `git diff --check` y busqueda de referencias residuales.

## Tareas
- [x] T1. Sustituir el formulario de enlace por correo y contraseña.
- [x] T2. Sustituir `signInWithOtp` por `signInWithPassword` y manejar errores sin revelar informacion sensible.
- [x] T3. Verificar build, lint, diff y ausencia de UI/llamadas OTP residuales.

## Criterios de aceptacion
- [x] El modal no muestra enlace, codigo OTP ni boton `Entrar` separado del formulario.
- [x] El usuario introduce correo y contraseña y pulsa `Ingresar`.
- [x] La autenticacion usa `signInWithPassword` y no envia correos.
- [x] El acceso continua blocked si `user_access` no existe o `activo` es false.
- [x] La UI y las funciones de leads existentes no cambian.
- [x] Build, lint, diff check y busqueda residual pasan.

## Decisiones aceptadas
- La contraseña se administrationa en Supabase Auth, no en `public.user_access`.
- Los usuarios se crean manualmente en Auth con `Create user`, correo confirmado y contraseña.
- El rol se asigna manualmente en `user_access` como `agente` o `admin`.
- La migracion SQL ya es compatible con este flujo y no se modifica.

## Reutilizacion investigada
- Se reutiliza el listener existente `onAuthStateChange` y `enterAuthenticatedSession`.
- Se reutilizan `loadCurrentAccess`, `validateCurrentSession` y las politicas/RPCs actuales.
- Se reemplaza solo la funcion de solicitud de acceso, evitando cambios en Edge Function o SQL.

## Evidencia
- T1/T2 — Estado: passed. `index.html` muestra correo y contraseña, usa `signInWithPassword` y conserva la validacion de `public.user_access`.
- T3 — Estado: passed. `npm run build`, `npm run lint`, `git diff --check` y busqueda de referencias OTP residuales pasaron correctamente. La build solo muestra el warning preexistente de Vite sobre `__dirname`.
- Verificacion independiente — Estado: passed. El flujo de sesion, roles, permisos y validacion de usuarios activos permanece conectado.

## Progreso
Estado: complete-local
Ultima tarea: T3 verificada
Siguiente paso: crear usuarios en Supabase Auth con correo, contraseña y correo confirmado; despues asignar su rol en `public.user_access`. El cambio aun no ha sido commiteado ni publicado.

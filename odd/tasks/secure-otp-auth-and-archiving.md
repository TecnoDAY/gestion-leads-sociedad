# Autenticación OTP, roles y archivado

## Objetivo

Proteger el dashboard de leads con acceso por correo OTP, permitir únicamente a correos autorizados por el administrador y separar permisos de administrador y agente.

## Problema y por que

La aplicacion actual carga y modifica leads con una clave publica y una politica RLS publica. No existe inicio de sesion, gestion de usuarios, roles ni archivado; por tanto cualquier persona con acceso al frontend puede leer y potencialmente modificar datos.

## Alcance

- Migracion SQL para `user_access`, roles activos, archivado y RPCs de escritura.
- Edge Function para autorizar/provisionar usuarios desde servidor sin exponer la secret key.
- Pantalla de acceso OTP en `index.html`.
- Integracion de sesion, expiracion y estado de rol en el frontend.
- Agentes: crear leads y editar solo campos de seguimiento.
- Administradores: gestionar accesos, crear/asignar y archivar leads.
- Archivado en lugar de eliminacion fisica desde el panel.
- Mantener la carga completa existente y Realtime.

## Restricciones

- No ejecutar migraciones destructivas automaticamente contra el proyecto Supabase remoto sin revisarlas.
- No incluir secret key, service role ni tokens en el frontend.
- No migrar a React en esta entrega.
- No ofrecer eliminacion fisica desde la UI.
- Mantener columnas historicas existentes y el flujo de los 5.810 leads.

## No romper

- La carga completa por cursor y la cola Realtime existentes.
- Los campos `Agente `, `ULTIMO AGENTE ` y `OBSERVACIONES ` con espacios.
- La exportacion y el comportamiento normal de los leads activos.
- El contador exacto de la base de datos.

## TDD

Modo: off
Fuente: default
Runner: checks SQL estaticos, simulaciones de sesion/roles, `npm run build`, `npm run lint` y revision independiente.

## Tareas

- [x] T1. Crear migracion SQL de user_access, archivado, RLS, RPCs e indices.
- [x] T2. Crear Edge Function de autorizacion y provisionamiento seguro.
- [x] T3. Integrar OTP, sesion, roles y UI de administracion en el frontend; admin edita datos principales via `update_lead_full` y agente conserva follow-up via `update_lead_followup`.
- [x] T4. Verificar migracion, permisos, build y regresiones.
- [x] T5. Ejecutar verificacion independiente y cerrar evidencia.

## Criterios de aceptacion

- [x] Correo no autorizado no obtiene sesion.
- [x] Correo autorizado puede solicitar OTP y crear/iniciar su identidad mediante backend seguro.
- [x] Usuario desactivado pierde acceso aunque conserve una sesion.
- [x] Agente puede crear leads y editar solo los cinco campos de seguimiento.
- [x] Agente no puede archivar, gestionar usuarios ni eliminar leads.
- [x] Administrador puede gestionar accesos y archivar leads.
- [x] Leads archivados no aparecen en la vista normal ni en metricas.
- [x] No existe UI de DELETE fisico.
- [x] No hay secretos en frontend ni en archivos rastreables.
- [x] La migracion es reversible/documentada y no se aplica remotamente sin revision.
- [x] Build y lint pasan.

## Decisiones aceptadas

- `shouldCreateUser: false` en el cliente: solo la Edge Function provisiona usuarios autorizados.
- `user_access` es la autoridad de rol/estado; no se confiar en metadata editable del cliente.
- Las mutaciones sensibles pasan por RPC; RLS solo no protege columnas individuales.
- La primera cuenta admin se provisiona fuera del frontend o mediante la funcion con una credencial de administrador segura.

## Reutilizacion investigada

- Se reutilizan `supabaseClient`, `loadLeadsData`, `handleRealtimeEvent` y el render actual en `index.html`.
- Se usa el CDN Supabase existente para evitar una migracion imediata a React.
- Se crea una migracion SQL versionable en lugar de editar objetos remotos de forma automatica.

## Evidencia

- Estado: passed localmente. La migracion y la funcion estan versionadas pero no se aplicaron al proyecto Supabase remoto.
- T3 — Estado: passed. El modal de edicion muestra una seccion exclusiva de admin con Nombre, Telefono, Mes, Fecha, Campaña, Medio, Ciudad, Agente asignado, Odoo, Fecha de Atencion y Landing. Admin usa `update_lead_full` y agente mantiene `update_lead_followup` con campos permitidos; `handleUpdateLead` realiza llamadas RPC separadas sin argumentos extra.
- T4 — Estado: passed. `npm run build`, `npm run lint`, `node --check` inline, `deno check`, validacion SQL PGlite y `git diff --check` pasaron correctamente; la migracion no se aplico al proyecto Supabase remoto.
- T5 — Estado: passed. Verificacion independiente sin bloqueos locales; se corrigieron politica publica residual, `updated_at`, campos de agente, retorno de RPC, claves secretas de Supabase, invalidacion de sesion, cierre/reset de modales y firmas RPC.
- Pasos remotos pendientes: aplicar migracion en Supabase, desplegar `authorize-user`, configurar `SUPABASE_SECRET_KEYS.default` y `AUTHORIZE_BOOTSTRAP_TOKEN`, bootstrapear primer admin, retirar token y ejecutar pruebas integradas agent/admin/desactivado/Realtime.
- No se incluyeron secretos reales; la key publishable existente permanece en frontend y ninguna service key se expone.

## Progreso

Estado: complete-local
Ultima tarea: T5 verificada; no quedan bloqueos locales.
Siguiente paso: aplicar migracion y desplegar la Edge Function tras revisar los pasos remotos documentados.

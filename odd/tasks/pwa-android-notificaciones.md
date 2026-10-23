# PWA Android e instalacion con notificaciones

## Objetivo
Convertir el CRM web en una PWA instalable en Android desde un enlace o QR, y enviar notificaciones push a todos los usuarios autorizados cuando se crea un lead o cambia su estatus.

## Problema y por que
Los asesores necesitan usar el CRM desde el telefono con acceso rapido. No hay presupuesto ni necesidad inicial de Google Play ni de funcionamiento offline.

## Alcance
Incluye:
- Manifest, iconos y service worker.
- Boton "Instalar en este dispositivo" y codigo QR.
- Activacion y desactivacion de notificaciones por dispositivo.
- Tabla `push_subscriptions` con RLS por usuario.
- Edge Function `notify-lead-change` que envia Web Push a todos los suscriptores.
- Avisos tras alta y actualizacion exitosa de lead.

Excluye:
- Google Play, APK, iOS y funcionamiento offline.
- Notificaciones garantizadas en todos los estados de Android.

## Restricciones
- Conexion obligatoria.
- No mostrar PII en la pantalla bloqueada.
- La clave privada VAPID vive en Supabase Vault; no en el repositorio.

## No romper
- Tests de `scripts/tests/*.test.mjs`.
- `pnpm check:app` y `pnpm lint`.
- Flujo de alta y edicion de leads.

## TDD
Modo: off
Fuente: default
Runner: `pnpm test`

## Tareas
- [x] T1: Iconos PNG desde favicon.svg.
- [x] T2: Manifest PWA.
- [x] T3: Service worker con push y click.
- [x] T4: Registro del service worker y prompt de instalacion.
- [x] T5: Modal de instalacion, QR y notificaciones.
- [x] T6: Allowlist de handlers en `src/legacy/actions.js`.
- [x] T7: Migracion `push_subscriptions` y secreto VAPID.
- [x] T8: Edge Function `notify-lead-change`.
- [x] T9: Avisos tras alta y actualizacion de lead.
- [x] T10: Verificacion local (`check:app`, `lint`, `test`, `build`).

## Criterios de aceptacion
- [x] `pnpm check:app` pasa.
- [x] `pnpm lint` pasa.
- [x] `pnpm test` pasa.
- [x] `pnpm build` genera `dist/sw.js`, `dist/manifest.webmanifest` e iconos.
- [x] La Edge Function responde `401` sin token.

## Decisiones aceptadas
- Distribucion inicial por enlace/QR, sin Google Play.
- Todos los usuarios autorizados reciben todos los avisos.
- Notificaciones de mejor esfuerzo, sin garantia tras cierre forzado.

## Reutilizacion investigada
- Se reutiliza el CRM actual y Supabase.
- Se evita Capacitor y reescritura de framework.
- VAPID generado con `web-push`.

## Evidencia
- `pnpm check:app`: OK.
- `pnpm lint`: OK.
- `pnpm test`: OK.
- `pnpm build`: OK.
- Edge Function `notify-lead-change`: ACTIVE, respuesta `401` sin token.

## Progreso
Estado: completado en local.
Ultima tarea: T10.
Siguiente paso: desplegar el frontend y probar instalacion y push en un Android real.
# Llamar desde el dashboard con Aircall (click-to-call) — plan guardado

## Objetivo
Botón "Llamar" en la ficha/tabla de leads que inicia (o prepara) la llamada
en Aircall con el número del lead, sin exponer credenciales en el frontend.

## Contexto y decisiones previas
- Sin coste extra en Aircall: el acceso API viene incluido en los planes de
  pago (verificado en developer.aircall.io, 2026); no hay cargo por llamada API.
- La API key de Aircall NUNCA va en el frontend: proxy server-side obligatorio.
- Mínimo server-side = Supabase Edge Function (tier gratis), con el mismo
  patrón activo/admin-agente ya usado en RPCs (`is_active_user()`).
- Endpoints Aircall: `POST /v1/users/:id/calls` (llama directo) y
  `POST /v1/users/:id/dial` (rellena la app Aircall y el agente pulsa llamar).
  Emparejar usuarios por email (List all Users), según su documentación.
- Fase 2 opcional: webhooks de llamada terminada → nota automática en `lead_notes`.

## Alcance por fases
- **Paso 0 (sin código, hoy):** instalar la extensión click-to-dial de Aircall
  en los navegadores de los agentes; los teléfonos del dashboard se vuelven
  clicables tal como está la app.
- **Fase A (5 min):** teléfonos como enlaces `tel:+...` en tabla y ficha
  (mejora móvil/escritorio).
- **Fase B (integración real):**
  1. Edge Function `aircall-dial`: recibe lead_id/teléfono, verifica usuario
     activo vía JWT de Supabase, mapea email→usuario Aircall, llama a
     `POST /v1/users/:id/dial` (o `/calls`) con la API key del secreto.
     Solo admin y agentes activos; rate-limit consciente (120 req/min Aircall).
  2. Botón "Llamar" en ficha del lead (y opcionalmente en fila de tabla) que
     invoca la función; toast de éxito/error.
  3. Clave API guardada como secreto de la función (`supabase secrets set`),
     nunca en `index.html` ni en el repo.
- **Fase C (opcional, después):** webhook Aircall → registro automático en
  `lead_notes` ("llamada de N min"); requiere URL pública + validación firma.

## Restricciones
- Sin dependencias nuevas en el frontend; vanilla JS como hasta ahora.
- Nunca exponer `AIRCALL_API_ID/TOKEN` al cliente; nunca commitear secretos.
- No deploy de funciones ni secretos sin revisión/petición explícita del humano.
- Funciones Edge se despliegan con `supabase functions deploy` (revisar antes).

## No incluye
- App OAuth pública de Aircall (solo para comercializar integraciones).
- Embed CTI/dialer completo (complejidad sin beneficio frente al botón).
- SMS vía API (solo plan Pro de Aircall; fuera de alcance).

## Criterios de aceptación (Fase B)
- [ ] Agente pulsa Llamar → su app Aircall recibe el número (o llama directo).
- [ ] La API key no aparece en ningún fichero del repo ni en el JS servido.
- [ ] Usuario desactivado o sin sesión no puede invocar la función.
- [ ] Error de Aircall (usuario ocupado, número inválido) muestra toast claro.

## Alternativas descartadas
- API directa desde frontend: filtra la key. Backend propio: viola YAGNI.
- OAuth público: overkill interno. CTI embebido: coste sin beneficio.

## Progreso
- Estado: plan guardado, sin implementar.
- Siguiente paso (cuando el humano lo pida): Paso 0 / Fase A / Fase B.

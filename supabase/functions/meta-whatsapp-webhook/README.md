# Meta WhatsApp Webhook

Edge Function para recibir webhooks de Meta WhatsApp Business API e insertar leads automáticamente en la tabla `public.leads`.

## Endpoint

```
https://hkkuyomlcqyxtzblowle.supabase.co/functions/v1/meta-whatsapp-webhook
```

> **Nota:** `verify_jwt: false` (igual que `authorize-user`). La autenticación la hace la firma HMAC de Meta.

## Configuración en Meta Developer Dashboard

1. **Products → WhatsApp → Configuration**
2. **Callback URL**: `https://hkkuyomlcqyxtzblowle.supabase.co/functions/v1/meta-whatsapp-webhook`
3. **Verify Token**: el mismo valor que `META_WEBHOOK_VERIFY_TOKEN` (ver secretos abajo)
4. **Webhook Fields**: `messages`

## Secretos requeridos (Supabase Dashboard → Edge Functions → Secrets)

| Secreto | Descripción | Ejemplo |
|---|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | Token que Meta envía en la verificación GET (debe coincidir) | `mi-token-secreto-123` |
| `META_APP_SECRET` | **Obligatorio**. App Secret de tu app de Meta (Settings → Basic). Sin él el endpoint rechaza todos los POST. | `a1b2c3d4e5f6...` |
| `WHATSAPP_DEDUP_DAYS` | (Opcional) Ventana de deduplicación en días. Default: `30`. | `30` |
| `WHATSAPP_DEFAULT_AGENTE` | (Opcional) Nombre del agente que se asigna. Default: `Agente`. | `Agente` |
| `WHATSAPP_CAMPANA` | (Opcional) Valor para la columna `Campaña`. Default: `General`. | `General` |

## Comportamiento

### GET (verificación)
- Meta envía `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`
- Si el token coincide → devuelve `hub.challenge` (200, text/plain)
- Si no → 403

### POST (mensaje entrante)
1. Verifica firma `X-Hub-Signature-256` = HMAC-SHA256(body, `META_APP_SECRET`)
2. Parsea JSON. Si falla → 200 (ack silencioso para Meta)
3. Ignora eventos que no sean `messages` (delivery, read, etc.)
4. Aplana TODO el lote: `entry[] → changes[] → value.messages[]` (antes solo `messages[0]`).
   Por cada mensaje extrae:
   - Teléfono: `message.from` debe ser string; conserva sus dígitos internacionales sin inferir país ni añadir un `1` a números de diez dígitos. RPC, ventana y teléfono almacenado usan la misma identidad que `lead_contact_id_for`.
   - Nombre: `value.contacts` matcheado por `wa_id` (o primer contacto, o "Sin Nombre")
   - Texto: `message.text.body`; idempotencia: `message.id` → columna `leads.whatsapp_message_id`. Un ID ausente, no string o vacío se omite con `invalid_message_id`, sin insertar un lead no idempotente.
5. **Contacto** vía RPC atómica `lead_contact_id_for` (upsert dentro de la función; sin select-then-insert).
   **Dedup blanda por ventana**: mismo `contact_id` con lead creado en los últimos `WHATSAPP_DEDUP_DAYS` días
   (entero en `[0, 3650]`; ausente/inválido → 30 sin tumbar el handler; `0` desactiva la ventana) → `duplicate: true`. Un error de lectura devuelve 503, no permite continuar con el insert.
6. Inserta lead con:
   - `Nombre`, `Telefono` (formateado `1 (XXX) XXX-XXXX` solo si ya son once dígitos comenzando por `1`; otros números conservan sus dígitos), `Medio: 'Whatsapp'`, `GESTION: 'Información'`
   - `Campaña`, `Fecha`, `Mes`, `AGENTE`, `OBSERVACIONES` con el texto truncado a 500 chars
   - `whatsapp_message_id` (`UNIQUE` parcial). Tras `23505`, solo confirma `duplicate: true` si una consulta sin error encuentra el lead con ese mismo `message.id`; conflicto no relacionado, lectura fallida o vacía → 503.
7. El trigger `leads_set_contact_id` liga `contact_id` automáticamente (reutiliza contacto existente)
8. **ACK coherente**: 200 solo si todo el lote quedó persistido, duplicado real u omitido por validación
   (`missing_sender`, `invalid_phone`, `invalid_message_id`); cualquier fallo transitorio (contacto/dedup/insert), o respuesta de persistencia sin ID confirmado → **503 `retryable`**
    para que Meta reintente (los ya persistidos deduplican por `message.id` en el reintento)
9. Resultados y logs solo exponen estados/IDs internos, nunca teléfono, nombre, texto del mensaje ni errores crudos de base de datos.

La nueva migración `202609300003_webhook_whatsapp_message_id.sql` agrega la columna y el índice único parcial sin borrar registros. Si encuentra IDs duplicados, lanza una excepción y aborta la transacción conservando los datos; cualquier reconciliación requiere autorización separada. Debe aplicarse antes de desplegar este handler.

## Pruebas locales

El test versionado transpila el **handler real** con esbuild y ejecuta `Deno.serve` en VM con Supabase/Deno simulados, sin red ni dependencias nuevas:

```bash
node --test scripts/tests/webhook-whatsapp.test.mjs
```

Cubre lotes, fallos parciales/reintentos, concurrencia por ID, conflictos únicos no relacionados, errores de lectura, mensajes inválidos, normalización, configuración y ausencia de PII. El check de la migración es estático; no sustituye una ejecución SQL local.

```bash
# Levantar Supabase local (requiere supabase CLI)
supabase start
supabase functions serve meta-whatsapp-webhook --env-file .env.local

# GET verification
curl "http://localhost:54321/functions/v1/meta-whatsapp-webhook?hub.mode=subscribe&hub.verify_token=mi-token&hub.challenge=challenge123"

# POST simulado (requiere generar firma HMAC)
# Ver script test-webhook.sh en el repo
```

## Despliegue

```bash
# Desde la raíz del proyecto
supabase functions deploy meta-whatsapp-webhook --verify-jwt=false
```

O vía MCP `deploy_edge_function` con `verify_jwt: false`.

## Estructura de columnas en `leads`

| Columna | Valor |
|---|---|
| `Nombre` | nombre del perfil WhatsApp (máx 200) |
| `Telefono` | `1 (XXX) XXX-XXXX` si recibe once dígitos con `1`; otros números, solo dígitos sin prefijo inferido |
| `Medio` | `Whatsapp` (existe en catálogo) |
| `GESTION` | `Información` (existe en catálogo) |
| `Campaña` | `General` (configurable) |
| `Fecha` | `DD/MM/YYYY` |
| `Mes` | `ENERO`…`DICIEMBRE` |
| `AGENTE` | `Agente` (configurable) |
| `OBSERVACIONES` | `Lead de WhatsApp: <texto>` (máx 500) |

El trigger `leads_set_contact_id` (BEFORE INSERT OR UPDATE OF "Telefono") rellena `contact_id` ligando a `lead_contacts` por `phone_normalized` (solo dígitos).

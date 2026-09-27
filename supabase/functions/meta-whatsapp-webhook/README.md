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
4. Extrae:
   - Teléfono: `entry[0].changes[0].value.messages[0].from` (dígitos)
   - Nombre: `entry[0].changes[0].value.contacts[0].profile.name` (o "Sin Nombre")
   - Texto: `entry[0].changes[0].value.messages[0].text.body`
5. **Deduplicación**:
   - Busca en `lead_contacts` por `phone_normalized` (solo dígitos)
   - Si existe contacto, busca en `leads` por `contact_id` creado en los últimos `WHATSAPP_DEDUP_DAYS` días
   - Si hay lead reciente → responde 200 con `duplicate: true` (no inserta)
6. Inserta lead con:
   - `Nombre`, `Telefono` (formateado `1 (XXX) XXX-XXXX`), `Medio: 'Whatsapp'`, `GESTION: 'Información'`
   - `Campaña`, `Fecha`, `Mes`, `AGENTE`, `OBSERVACIONES` con el texto truncado a 500 chars
7. El trigger `leads_set_contact_id` liga `contact_id` automáticamente (reutiliza contacto existente)
8. Responde **siempre 200** tras el paso 2 (evita reintentos de Meta)

## Pruebas locales

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
| `Telefono` | formateado `1 (XXX) XXX-XXXX` |
| `Medio` | `Whatsapp` (existe en catálogo) |
| `GESTION` | `Información` (existe en catálogo) |
| `Campaña` | `General` (configurable) |
| `Fecha` | `DD/MM/YYYY` |
| `Mes` | `ENERO`…`DICIEMBRE` |
| `AGENTE` | `Agente` (configurable) |
| `OBSERVACIONES` | `Lead de WhatsApp: <texto>` (máx 500) |

El trigger `leads_set_contact_id` (BEFORE INSERT OR UPDATE OF "Telefono") rellena `contact_id` ligando a `lead_contacts` por `phone_normalized` (solo dígitos).
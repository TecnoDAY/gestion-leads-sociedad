# Webhook Meta WhatsApp → Leads

**Fecha**: 2026-09-27
**Estado**: implementado, pendiente despliegue manual
**Stack**: Supabase Edge Function (Deno/TypeScript)
**Relacionado**: `supabase/functions/meta-whatsapp-webhook/`, `lead_contacts` (migración 20260927023737)

---

## Alcance

Recibir webhooks de Meta WhatsApp Business API y crear leads en `public.leads` con los campos:
- Nombre (del perfil WhatsApp)
- Teléfono (formateado para consistencia con datos existentes)
- Medio = `Whatsapp`
- GESTION = `Información`
- Campaña, Fecha, Mes, AGENTE, OBSERVACIONES con valores por defecto configurables

---

## Tareas

| # | Tarea | Estado | Evidencia |
|---|---|---|---|
| 1 | Crear Edge Function `meta-whatsapp-webhook` con verificación GET y POST firmado | ✅ | `supabase/functions/meta-whatsapp-webhook/index.ts` |
| 2 | Deduplicación por `phone_normalized` (lead_contacts) + ventana de días | ✅ | código líneas 130-155 |
| 3 | Insertar lead con nombres de columna exactos (incl. espacios finales) | ✅ | código líneas 170-195 |
| 4 | README con secretos, config Meta, pruebas, despliegue | ✅ | `supabase/functions/meta-whatsapp-webhook/README.md` |
| 5 | Verificación sintáctica (`deno check`) | 🔄 | pendiente |
| 6 | Prueba local de ramas (GET/POST/firma/teléfono inválido/duplicado) | ⬜ | pendiente |
| 7 | `npm run lint` + `npm run build` sin regresiones | ⬜ | pendiente |
| 8 | Despliegue manual por el usuario + config secretos en Supabase | ⬜ | pendiente |

---

## Decisiones tomadas

| Tema | Decisión | Razón |
|---|---|---|
| Idempotencia | Ventana por teléfono (30 días default) | Cero migraciones, reversible, usa índice UNIQUE existente en `lead_contacts.phone_normalized` |
| Texto del mensaje | Truncado a 500 chars en `OBSERVACIONES` | Visibilidad inmediata para el agente, sin tablas extra |
| Formato teléfono | `1 (XXX) XXX-XXXX` para 10/11 dígitos | Coincide con 5.815 filas existentes |
| Seguridad | `verify_jwt: false` + HMAC-SHA256 + timingSafeEqual | Meta no manda JWT; fail-closed sin `META_APP_SECRET` |
| Despliegue | Manual por el usuario | Control total, sin secretos en repo |

---

## Detalles técnicos

### Triggers que intervienen (auto)
- `leads_set_contact_id` (BEFORE INSERT OR UPDATE OF "Telefono"): liga `contact_id` a `lead_contacts` por `phone_normalized` (solo dígitos). No pisa nombre/ciudad del contacto existente.
- `trg_leads_normalize_catalog_columns`: normaliza `Medio`, `GESTION`, `Campaña`, `Mes`, `AGENTE` con `title_case_text`/`normalize_agent_name`. Los valores enviados ya están en catálogo.

### Normalización de teléfono (crítica)
```typescript
// Edge Function
normalizePhoneForDB(raw) → solo dígitos (regexp_replace('[^0-9]', '', 'g'))
// DB: lead_contact_id_for hace EXACTAMENTE lo mismo
```
→ La deduplicación en el Edge Function usa la **misma clave** que el trigger (`phone_normalized` = solo dígitos), por lo que no hay desincronización posible.

### Columnas con espacios finales
- `OBSERVACIONES ` (con espacio)
- `Interesado en ` (con espacio)
El INSERT usa los nombres exactos.

---

## Riesgos / Edge cases

| Riesgo | Mitigación |
|---|---|
| Meta reenvía webhook (misma `wamid`) | Ventana 30 días por `contact_id` + `created_at` |
| Teléfono inválido / "SN" / vacío | Validación `^[0-9]{7,15}$` → 200 silencioso |
| `META_APP_SECRET` no configurado | Fail-closed: 503 en POST, no acepta nada |
| Nombre > 200 chars / texto > 500 | `slice()` en el código |
| Meta envía `whatsapp:+1555...` | `normalizePhoneForDB` quita todo no-dígito |
| Cambio de catálogo (Medio/GESTION) | Trigger normaliza, pero valores enviados ya son canónicos |

---

## Próximos pasos (fuera de este ODD)

1. Usuario configura secretos en Supabase Dashboard
2. Usuario despliega con `supabase functions deploy meta-whatsapp-webhook --verify-jwt=false`
3. Usuario apunta Callback URL en Meta Developer Dashboard
4. Prueba real: enviar mensaje al número de WhatsApp Business → verificar lead en app
5. (Opcional) Añadir `webhook_message_id` UNIQUE para idempotencia exacta por mensaje
6. (Opcional) Métricas: logs estructurados → dashboard
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-hub-signature-256',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const textPlain = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
  });

function getServiceRoleKey(): string | null {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceKeyFile = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY_FILE');
  if (serviceKey) return serviceKey;
  if (serviceKeyFile) {
    try {
      return Deno.readTextFileSync(serviceKeyFile).trim();
    } catch {
      return null;
    }
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Meta envia el numero internacional: conservar sus digitos sin inferir pais.
// RPC, ventana y trigger usan esta misma identidad (el display no anade digitos).
function normalizePhoneForDB(raw: string): string {
  return raw.replace(/\D/g, '');
}

function isValidPhoneDigits(digits: string): boolean {
  return /^[0-9]{7,15}$/.test(digits);
}

// WHATSAPP_DEDUP_DAYS validado sin excepciones: entero en [0, 3650];
// cualquier valor ausente/invalido cae al defecto 30 sin tumbar el handler.
const DEFAULT_DEDUP_DAYS = 30;
const MAX_DEDUP_DAYS = 3650;

function parseDedupDays(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return DEFAULT_DEDUP_DAYS;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return DEFAULT_DEDUP_DAYS;
  const n = parseInt(trimmed, 10);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_DEDUP_DAYS) return DEFAULT_DEDUP_DAYS;
  return n;
}

function formatPhoneForDisplay(digits: string): string {
  if (digits.length === 11 && digits.startsWith('1')) {
    const rest = digits.slice(1);
    return `1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6, 10)}`;
  }
  return digits;
}

function formatDateForDB(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

function formatMesForDB(date: Date): string {
  const meses = [
    'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
  ];
  return meses[date.getMonth()];
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Aplana TODO el lote Meta: entry[] -> changes[] -> value.messages[].
// Antes solo se leia entry[0].changes[0].messages[0] y se perdia el resto.
function extractInboundMessages(payload: unknown): Array<{ message: any; contactName: string }> {
  const out: Array<{ message: any; contactName: string }> = [];
  const entries = (payload as any)?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = change?.value;
      const messages = value?.messages;
      const contacts = value?.contacts;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const from = message?.from;
        const contact = Array.isArray(contacts)
          ? contacts.find((c: any) => c?.wa_id === from) ?? contacts[0]
          : undefined;
        out.push({
          message,
          contactName: contact?.profile?.name ?? 'Sin Nombre',
        });
      }
    }
  }
  return out;
}

function isUniqueViolation(error: any): boolean {
  return error?.code === '23505';
}

function resolveCampaignName(value: unknown, activeCatalogNames: unknown[]): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return 'Sin definir';
  const match = activeCatalogNames.find((name) =>
    typeof name === 'string' && name.trim().toLocaleLowerCase() === candidate.toLocaleLowerCase()
  );
  return typeof match === 'string' ? match.trim() : 'Sin definir';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceRoleKey();
  if (!serviceKey || !supabaseUrl) {
    console.error('Missing server-only Supabase configuration');
    return json(503, { error: 'service_unavailable' });
  }

  // GET: Webhook verification from Meta
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? '';

    if (mode === 'subscribe' && token && challenge) {
      if (timingSafeEqual(token, expectedToken)) {
        return textPlain(200, challenge);
      }
    }
    return json(403, { error: 'forbidden' });
  }

  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // POST: Handle incoming message
  const appSecret = Deno.env.get('META_APP_SECRET');
  if (!appSecret) {
    console.error('META_APP_SECRET not configured - rejecting webhook');
    return json(503, { error: 'service_unavailable' });
  }

  const signature = request.headers.get('x-hub-signature-256') ?? '';
  const rawBody = await request.text();

  // Verify HMAC signature
  const providedSig = signature.replace('sha256=', '');
  if (!providedSig) {
    return json(403, { error: 'missing_signature' });
  }
  const expectedSig = await hmacSha256(rawBody, appSecret);
  if (!timingSafeEqual(providedSig, expectedSig)) {
    return json(403, { error: 'invalid_signature' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(200, { received: true });
  }

  const inbound = extractInboundMessages(payload);
  if (!inbound.length) {
    // Not a user message (delivery receipt, read receipt, etc.)
    return json(200, { received: true });
  }

  const dedupDays = parseDedupDays(Deno.env.get('WHATSAPP_DEDUP_DAYS'));

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const defaultAgent = Deno.env.get('WHATSAPP_DEFAULT_AGENTE') ?? 'Agente';
  let campana = 'Sin definir';
  try {
    const { data, error } = await service
      .from('lead_catalogs')
      .select('value')
      .eq('kind', 'campana')
      .eq('active', true);
    if (error) throw error;
    campana = resolveCampaignName(
      Deno.env.get('WHATSAPP_CAMPANA'),
      (data ?? []).map((row: any) => row?.value),
    );
    if (campana === 'Sin definir') {
      console.warn('WHATSAPP_CAMPANA inválida, usando Sin definir');
    }
  } catch {
    console.warn('No se pudo validar WHATSAPP_CAMPANA, usando Sin definir');
  }

  const results: Array<Record<string, unknown>> = [];
  let transientFailures = 0;

  for (const { message, contactName } of inbound) {
    const phoneRaw = message?.from;
    if (!phoneRaw) {
      // Mensaje sin remitente: veneno, no reintentable. Se cuenta como
      // omitido pero no provoca reintento del lote.
      results.push({ skipped: true, reason: 'missing_sender' });
      continue;
    }
    if (typeof phoneRaw !== 'string') {
      results.push({ skipped: true, reason: 'invalid_phone' });
      continue;
    }

    // Normalizacion unica (canonica): solo digitos.
    const phoneDigits = normalizePhoneForDB(phoneRaw);
    if (!isValidPhoneDigits(phoneDigits)) {
      results.push({ skipped: true, reason: 'invalid_phone' });
      continue;
    }

    if (typeof message?.id !== 'string' || !message.id.trim()) {
      // Sin id no hay garantia de reintento idempotente: no crear un lead.
      results.push({ skipped: true, reason: 'invalid_message_id' });
      continue;
    }
    const messageId = message.id;

    // Contacto via canonica atomica (upsert dentro de la funcion) en vez de
    // select-then-insert: dos entregas concurrentes no crean dos contactos.
    // Si la RPC falla de forma transitoria, el mensaje queda pendiente de
    // reintento (no se confirma como recibido).
    let contactId: number | null = null;
    try {
      const { data, error } = await service.rpc('lead_contact_id_for', {
        p_phone: phoneDigits,
        p_nombre: String(contactName).slice(0, 200),
        p_ciudad: '',
      });
      if (error) throw error;
      if (!Number.isSafeInteger(data) || data <= 0) throw new Error('contact_not_confirmed');
      contactId = data;
    } catch {
      console.error('Contact resolution failed (retryable)');
      transientFailures += 1;
      results.push({ error: 'contact_retryable' });
      continue;
    }

    // Dedup blanda por ventana: mismo contacto con lead reciente.
    if (contactId !== null && dedupDays > 0) {
      try {
        const since = new Date(Date.now() - dedupDays * 24 * 60 * 60 * 1000).toISOString();
        const { data: existingLead, error } = await service
          .from('leads')
          .select('id')
          .eq('contact_id', contactId)
          .gte('created_at', since)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (existingLead) {
          if (existingLead.id == null) throw new Error('duplicate_not_confirmed');
          results.push({ duplicate: true, lead_id: existingLead.id });
          continue;
        }
      } catch {
        console.error('Dedup window check failed (retryable)');
        transientFailures += 1;
        results.push({ error: 'dedup_retryable' });
        continue;
      }
    }

    const now = new Date();
    const textBody = message?.text?.body ?? '';
    const observaciones = textBody
      ? `Lead de WhatsApp: ${textBody}`.slice(0, 500)
      : 'Lead creado desde webhook de WhatsApp.';

    const leadData: Record<string, unknown> = {
      Nombre: String(contactName).slice(0, 200),
      Telefono: formatPhoneForDisplay(phoneDigits),
      Medio: 'Whatsapp',
      GESTION: 'Información',
      Campaña: campana,
      Fecha: formatDateForDB(now),
      Mes: formatMesForDB(now),
      AGENTE: defaultAgent,
      // Columnas con espacio final exacto según esquema real
      "OBSERVACIONES ": observaciones,
      "Interesado en ": '',
    };
    leadData['whatsapp_message_id'] = messageId;

    try {
      const { data: created, error: createError } = await service
        .from('leads')
        .insert(leadData)
        .select('id');
      if (createError) throw createError;
      if (created?.[0]?.id == null) throw new Error('creation_not_confirmed');
      results.push({ lead_id: created[0].id });
    } catch (err: any) {
      if (isUniqueViolation(err)) {
        // 23505 puede proceder de otra restriccion: solo confirmar si existe
        // realmente un lead con este message.id y la lectura no fallo.
        try {
          const { data: dup, error } = await service
            .from('leads')
            .select('id')
            .eq('whatsapp_message_id', messageId)
            .limit(1)
            .maybeSingle();
          if (!error && dup?.id != null) {
            results.push({ duplicate: true, lead_id: dup.id });
            continue;
          }
        } catch {
          console.error('Message duplicate check failed (retryable)');
        }
      }
      // Fallo transitorio (red/DB): NO se confirma; Meta reintentara y el
      // reintento caera en la rama 23505 sin duplicar.
      console.error('Lead creation failed (retryable)');
      transientFailures += 1;
      results.push({ error: 'creation_retryable' });
    }
  }

  // ACK coherente: 200 solo si todo el lote quedo persistido, duplicado real
  // u omitido por validacion. Cualquier fallo transitorio -> 503 para que
  // Meta reintente (los ya persistidos deduplican por message.id).
  if (transientFailures > 0) {
    return json(503, { received: false, error: 'retryable', results });
  }
  return json(200, { received: true, results });
});

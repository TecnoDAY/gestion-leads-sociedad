// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function normalizePhoneForDB(raw: string): string {
  return raw.replace(/\D/g, '');
}

function isValidPhoneDigits(digits: string): boolean {
  return /^[0-9]{7,15}$/.test(digits);
}

function formatPhoneForDisplay(digits: string): string {
  if (digits.length === 10) {
    return `1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
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

  // Meta payload structure
  const entry = (payload as any)?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;
  const contacts = value?.contacts;

  if (!messages || !messages.length) {
    // Not a user message (delivery receipt, read receipt, etc.)
    return json(200, { received: true });
  }

  const message = messages[0];
  const phoneRaw = message?.from;
  const name = contacts?.[0]?.profile?.name ?? 'Sin Nombre';

  if (!phoneRaw) {
    return json(200, { received: true });
  }

  // Normalize phone to digits only (matches lead_contact_id_for logic)
  const phoneDigits = normalizePhoneForDB(phoneRaw);
  if (!isValidPhoneDigits(phoneDigits)) {
    return json(200, { received: true });
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deduplication: check lead_contacts first (exact match on phone_normalized)
  const { data: contact } = await service
    .from('lead_contacts')
    .select('id')
    .eq('phone_normalized', phoneDigits)
    .limit(1)
    .single();

  if (contact) {
    // Contact exists - check for recent lead with this contact_id
    const dedupDays = parseInt(Deno.env.get('WHATSAPP_DEDUP_DAYS') ?? '30', 10);
    const since = new Date(Date.now() - dedupDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: existingLead } = await service
      .from('leads')
      .select('id')
      .eq('contact_id', contact.id)
      .gte('created_at', since)
      .limit(1)
      .single();

    if (existingLead) {
      return json(200, { received: true, duplicate: true, lead_id: existingLead.id });
    }
  }

  // Insert new lead
  const now = new Date();
  const defaultAgent = Deno.env.get('WHATSAPP_DEFAULT_AGENTE') ?? 'Agente';
  const campana = Deno.env.get('WHATSAPP_CAMPANA') ?? 'General';

  const textBody = message?.text?.body ?? '';
  const observaciones = textBody
    ? `Lead de WhatsApp: ${textBody}`.slice(0, 500)
    : 'Lead creado desde webhook de WhatsApp.';

  const phoneDisplay = formatPhoneForDisplay(phoneDigits);

  const leadData = {
    Nombre: name.slice(0, 200),
    Telefono: phoneDisplay,
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

  const { data: created, error: createError } = await service
    .from('leads')
    .insert(leadData)
    .select('id');

  if (createError) {
    console.error('Lead creation failed:', createError.message);
    return json(200, { received: true, error: 'creation_failed' });
  }

  console.log('WhatsApp lead created', { lead_id: created?.[0]?.id });
  return json(200, { received: true, lead_id: created?.[0]?.id });
});
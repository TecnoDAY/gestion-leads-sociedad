// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';
import webpush from 'npm:web-push@3.6.7';

const ORIGENES_POR_DEFECTO = [
  'https://gestion-leads-sociedad.vercel.app',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
].join(',');

const origenPermitido = (origen) => {
  const configurado = (Deno.env.get('ALLOWED_ORIGIN') || '').trim();
  if (configurado === '*') return '*';
  const permitidos = new Set(
    (configurado || ORIGENES_POR_DEFECTO)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return permitidos.has(origen) ? origen : null;
};

const CRM_ROLES = new Set(['admin', 'agente', 'supervisor']);

const VAPID_PUBLIC_KEY = 'BEFR2BUOlY-qv8HBzxxGq08AgYy5o2AHSQAB4QDff0ioy-YJ_E6ZrxJcBqNZla0579UC1Lzy-8Bi9_3wRqZnGjU';

function getServiceRoleKey() {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey) return serviceKey;
  const serviceKeyFile = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY_FILE');
  if (serviceKeyFile) {
    try { return Deno.readTextFileSync(serviceKeyFile).trim(); } catch { return null; }
  }
  return null;
}

Deno.serve(async (request) => {
  const permitido = origenPermitido(request.headers.get('origin') ?? '');
  const cors = { Vary: 'Origin' };
  if (permitido === '*' || permitido) {
    cors['Access-Control-Allow-Origin'] = permitido === '*' ? '*' : permitido;
    cors['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceRoleKey();
  if (!serviceKey || !supabaseUrl) return json(503, { error: 'service_unavailable' });

  const authorization = request.headers.get('Authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!bearerToken) return json(401, { error: 'unauthorized' });

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await adminClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) return json(401, { error: 'unauthorized' });

  // Solo usuarios CRM activos pueden disparar el broadcast (el cliente
  // service-role no lleva su JWT: se comprueba con el id ya verificado).
  const { data: access, error: accessError } = await adminClient
    .from('user_access')
    .select('activo, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (accessError || access?.activo !== true || !CRM_ROLES.has(access?.role)) {
    return json(403, { error: 'forbidden' });
  }

  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: 'invalid_request' }); }

  const eventType = payload?.eventType;
  if (eventType !== 'created' && eventType !== 'updated') return json(400, { error: 'invalid_event_type' });
  const leadId = Number(payload?.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) return json(400, { error: 'invalid_lead_id' });

  const { data: lead, error: leadError } = await adminClient.from('leads').select('id, "GESTION"').eq('id', leadId).maybeSingle();
  if (leadError) return json(500, { error: 'lead_lookup_failed' });
  if (!lead) return json(404, { error: 'lead_not_found' });

  // PostgREST no expone el esquema vault: la clave se lee con una RPC que
  // solo service_role puede ejecutar (migracion 202611010002).
  const { data: vapidPrivateKey, error: secretError } = await adminClient.rpc('get_vapid_private_key');
  if (secretError || typeof vapidPrivateKey !== 'string' || !vapidPrivateKey) {
    console.error('No se pudo leer la clave VAPID:', secretError?.code || 'empty');
    return json(500, { error: 'vapid_secret_unavailable' });
  }

  webpush.setVapidDetails('mailto:admin@sociedadactoral.com', VAPID_PUBLIC_KEY, vapidPrivateKey);

  const status = lead.GESTION || '';
  const title = 'Gestión de Leads';
  const bodyText = eventType === 'created'
    ? 'Se registró un nuevo lead.'
    : (status ? 'Un lead cambió a ' + status + '.' : 'Un lead fue actualizado.');

  const { data: subs, error: subsError } = await adminClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');
  if (subsError) return json(500, { error: 'subscriptions_unavailable' });

  let sent = 0;
  let removed = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body: bodyText, url: '/?lead=' + leadId, tag: 'lead-' + leadId })
      );
      sent += 1;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await adminClient.from('push_subscriptions').delete().eq('id', sub.id);
        removed += 1;
      } else {
        console.error('Error enviando push:', statusCode, err?.message);
      }
    }
  }

  return json(200, { ok: true, sent, removed });
});
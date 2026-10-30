// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';

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

const json = (cors, status, body) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  const permitido = origenPermitido(request.headers.get('origin') ?? '');
  const cors = { Vary: 'Origin' };
  if (permitido === '*' || permitido) {
    cors['Access-Control-Allow-Origin'] = permitido === '*' ? '*' : permitido;
    cors['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    cors['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(cors, 405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || !supabaseUrl) return json(cors, 503, { error: 'service_unavailable' });

  const aircallId = Deno.env.get('AIRCALL_API_ID');
  const aircallToken = Deno.env.get('AIRCALL_API_TOKEN');
  if (!aircallId || !aircallToken) return json(cors, 503, { error: 'aircall_not_configured' });

  const authorization = request.headers.get('Authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!bearerToken) return json(cors, 401, { error: 'unauthorized' });

  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await adminClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) return json(cors, 401, { error: 'unauthorized' });

  const { data: isActive, error: activeError } = await adminClient.rpc('is_active_user');
  if (activeError || isActive !== true) return json(cors, 403, { error: 'forbidden' });

  let payload;
  try { payload = await request.json(); } catch { return json(cors, 400, { error: 'invalid_request' }); }

  const leadId = Number(payload.leadId);
  const phone = String(payload.phone || '').replace(/\D/g, '');
  if (!Number.isInteger(leadId) || leadId <= 0) return json(cors, 400, { error: 'invalid_lead_id' });
  if (phone.length < 7) return json(cors, 400, { error: 'invalid_phone' });

  const email = userData.user.email;
  if (!email) return json(cors, 400, { error: 'no_email' });

  // Mapear email -> usuario Aircall
  const basicAuth = btoa(`${aircallId}:${aircallToken}`);
  let aircallUserId = null;
  try {
    const res = await fetch('https://api.aircall.io/v1/users?per_page=50', {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (!res.ok) return json(cors, 502, { error: 'aircall_users_failed' });
    const body = await res.json();
    const found = (body?.users || []).find((u) => String(u?.email || '').toLowerCase() === email.toLowerCase());
    if (!found) return json(cors, 404, { error: 'aircall_user_not_found' });
    aircallUserId = found.id;
  } catch {
    return json(cors, 502, { error: 'aircall_users_failed' });
  }

  // Iniciar llamada (dial: rellena la app Aircall, el agente pulsa llamar)
  try {
    const res = await fetch(`https://api.aircall.io/v1/users/${aircallUserId}/dial`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Aircall dial failed:', res.status, text);
      return json(cors, 502, { error: 'aircall_dial_failed' });
    }
    return json(cors, 200, { ok: true });
  } catch {
    return json(cors, 502, { error: 'aircall_dial_failed' });
  }
});
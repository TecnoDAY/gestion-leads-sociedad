// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bootstrap-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
};

const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.trim().slice(0, 120) : '';

const normalizeRole = (value: unknown): 'admin' | 'agente' =>
  value === 'admin' ? 'admin' : 'agente';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceRoleKey();
  if (!serviceKey || !supabaseUrl) {
    console.error('Missing server-only Supabase configuration');
    return json(503, { error: 'service_unavailable' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  const email = normalizeEmail(payload.email);
  const nombre = normalizeName(payload.nombre);
  const role = normalizeRole(payload.role);
  if (!email) return json(202, { accepted: true });

  const authorization = request.headers.get('Authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const bootstrapToken = request.headers.get('x-bootstrap-token') ?? '';
  const expectedBootstrapToken = Deno.env.get('AUTHORIZE_BOOTSTRAP_TOKEN') ?? '';

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    let adminUserId: string | null = null;
    let bootstrap = false;

    if (bearerToken) {
      const { data: userData, error: userError } = await service.auth.getUser(bearerToken);
      if (userError || !userData.user?.email) return json(202, { accepted: true });
      adminUserId = userData.user.id;
      const { data: access, error: accessError } = await service
        .from('user_access')
        .select('user_id, role, activo')
        .eq('user_id', adminUserId)
        .eq('activo', true)
        .maybeSingle();
      if (accessError || access?.role !== 'admin') return json(202, { accepted: true });
    } else if (
      expectedBootstrapToken.length >= 32 &&
      bootstrapToken.length > 0 &&
      timingSafeEqual(bootstrapToken, expectedBootstrapToken)
    ) {
      bootstrap = true;
      const { count, error } = await service
        .from('user_access')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('activo', true);
      if (error || (count ?? 0) > 0) return json(202, { accepted: true });
    } else {
      return json(202, { accepted: true });
    }

    // Provisioning is deliberately server-side. The response is intentionally
    // non-enumerating: an unauthorized, unknown, or already provisioned email
    // looks the same to the caller.
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { nombre },
    });

    let userId = created?.user?.id ?? null;
    if (createError && !/already|registered|exists/i.test(createError.message)) {
      console.error('Auth provisioning failed:', createError.message);
      return json(202, { accepted: true });
    }

    if (!userId) {
      const { data: matches } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = matches?.users?.find((user: { email?: string }) =>
        user.email?.trim().toLowerCase() === email
      )?.id ?? null;
    }
    if (!userId) return json(202, { accepted: true });

    const { error: upsertError } = await service
      .from('user_access')
      .upsert({ user_id: userId, email, nombre, role, activo: true, updated_at: new Date().toISOString() }, { onConflict: 'email' });

    if (upsertError) {
      console.error('Allowlist upsert failed:', upsertError.message);
      return json(202, { accepted: true });
    }

    console.log('Authorized user provisioned', { bootstrap, actor: adminUserId, email });
    return json(202, { accepted: true });
  } catch (error) {
    console.error('Unexpected authorize-user error', error);
    return json(202, { accepted: true });
  }
});

function getServiceRoleKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return null;
  try {
    const keys = JSON.parse(raw) as Record<string, unknown>;
    const value = keys.default ?? keys.service_role ?? keys.serviceRole ?? keys.secret;
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    console.error('SUPABASE_SECRET_KEYS is not valid JSON');
    return null;
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

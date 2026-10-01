// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const authHeaders = (serviceKey: string, bearer: string) => ({
  'Content-Type': 'application/json',
  apikey: serviceKey,
  Authorization: `Bearer ${bearer}`,
});

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

  const authorization = request.headers.get('Authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const targetUserId = typeof payload.targetUserId === 'string' ? payload.targetUserId.trim() : '';

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Sin autorizar, la respuesta es siempre 202: quien no es admin no llega a
  // saber si un correo existe, si la cuenta existe o si el cambio fue posible.
  let authorized = false;

  try {
    if (!bearerToken || !UUID.test(targetUserId)) return json(202, { accepted: true });

    const { data: userData, error: userError } = await service.auth.getUser(bearerToken);
    if (userError || !userData.user?.id) return json(202, { accepted: true });

    const { data: access, error: accessError } = await service
      .from('user_access')
      .select('user_id, role, activo')
      .eq('user_id', userData.user.id)
      .eq('activo', true)
      .maybeSingle();
    if (accessError || access?.role !== 'admin') return json(202, { accepted: true });

    authorized = true;

    const newEmail = normalizeEmail(payload.newEmail);
    if (!newEmail) return json(400, { error: 'invalid_email' });

    // El destino tiene que ser una cuenta gestionada en el panel: así esta
    // función no sirve para mutar cualquier usuario de Auth.
    const { data: targetAccess } = await service
      .from('user_access')
      .select('user_id')
      .eq('user_id', targetUserId)
      .maybeSingle();
    if (!targetAccess) return json(404, { error: 'user_not_found' });

    const { data: targetUser, error: targetError } = await service.auth.admin.getUserById(targetUserId);
    const currentEmail = (targetUser?.user?.email ?? '').trim().toLowerCase();
    if (targetError || !currentEmail) return json(404, { error: 'user_not_found' });
    if (newEmail === currentEmail) return json(400, { error: 'same_email' });

    const { count: takenInAccess } = await service
      .from('user_access')
      .select('user_id', { count: 'exact', head: true })
      .eq('email', newEmail);
    if ((takenInAccess ?? 0) > 0) return json(400, { error: 'email_taken' });

    for (let page = 1; ; page += 1) {
      const { data: matches, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      if (!Array.isArray(matches?.users)) throw new Error('Invalid Auth users page');
      const takenInAuth = matches.users.some((user: { email?: string; new_email?: string }) =>
        (user.email ?? '').trim().toLowerCase() === newEmail ||
        (user.new_email ?? '').trim().toLowerCase() === newEmail
      );
      if (takenInAuth) return json(400, { error: 'email_taken' });
      if (matches.users.length < 1000) break;
    }

    // Flujo nativo: se abre una sesión de la persona (que no sale de aquí) y se
    // le pide el cambio de correo a GoTrue. Así los correos de confirmación los
    // envía Supabase a las dos direcciones y el cambio queda PENDIENTE hasta
    // que quien recibe el enlace lo confirma. Nunca se registra ni se devuelve
    // ningún token.
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'recovery',
      email: currentEmail,
    });
    // GoTrue devuelve el enlace dentro de `data.properties` (verificado en
    // T1 y en el SDK auth-js `_generateLinkResponse`): `data.hashed_token` y
    // `data.action_link` de nivel superior quedan como respaldo legado.
    // Nunca se registra ni se devuelve ningun token.
    const linkProps = (linkData as { properties?: Record<string, unknown> } | null)?.properties ?? {};
    const propHash = linkProps.hashed_token;
    const topHash = (linkData as { hashed_token?: unknown } | null)?.hashed_token;
    const tokenHash = typeof propHash === 'string' ? propHash
      : (typeof topHash === 'string' ? topHash : '');
    const propLink = linkProps.action_link;
    const topLink = (linkData as { action_link?: unknown } | null)?.action_link;
    const actionLink = typeof propLink === 'string' ? propLink
      : (typeof topLink === 'string' ? topLink : '');
    let recoveryToken = '';
    try {
      recoveryToken = new URL(actionLink).searchParams.get('token') ?? '';
    } catch {
      recoveryToken = '';
    }
    if (linkError || (!tokenHash && !recoveryToken)) {
      console.error('recovery link failed:', linkError?.message ?? 'empty link');
      return json(500, { error: 'internal' });
    }

    // Convertir el enlace en sesión: `token_hash` es el camino verificado en T1
    // y el token en bruto del enlace queda como respaldo. Un intento fallido no
    // consume el enlace, así que probar el segundo no rompe nada.
    let accessToken = '';
    let sessionStatus = 0;
    for (const verifyBody of [
      { type: 'recovery', token_hash: tokenHash },
      { type: 'recovery', token: recoveryToken },
    ]) {
      if (!verifyBody.token_hash && !verifyBody.token) continue;
      const sessionResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: authHeaders(serviceKey, serviceKey),
        body: JSON.stringify(verifyBody),
      });
      const sessionData: { access_token?: string } | null = await sessionResponse.json().catch(() => null);
      sessionStatus = sessionResponse.status;
      if (sessionResponse.ok && sessionData?.access_token) {
        accessToken = sessionData.access_token;
        break;
      }
    }
    if (!accessToken) {
      console.error('recovery session failed:', sessionStatus);
      return json(500, { error: 'internal' });
    }

    const updateResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: authHeaders(serviceKey, accessToken),
      body: JSON.stringify({ email: newEmail }),
    });
    const updateBody: { error_code?: string; msg?: string } | null =
      await updateResponse.json().catch(() => null);

    if (updateResponse.status === 429) {
      // Presupuesto de correo del proyecto (2/hora con SMTP integrado). El
      // panel lo traduce a un mensaje entendible; aquí no se reintenta.
      return json(429, { error: 'email_rate_limit' });
    }
    if (!updateResponse.ok) {
      const code = updateBody?.error_code ?? '';
      if (code === 'user_already_exists' || /already/i.test(updateBody?.msg ?? '')) {
        return json(400, { error: 'email_taken' });
      }
      if (code === 'email_address_invalid') return json(400, { error: 'invalid_email' });
      console.error('email change rejected:', updateResponse.status, code);
      return json(400, { error: 'change_rejected' });
    }

    console.log('Email change requested', { actor: userData.user.id, target: targetUserId });
    return json(202, { accepted: true });
  } catch (error) {
    console.error('Unexpected change-user-email error', error);
    // A quien no llegó a autorizarse no se le filtra nada; a un admin sí se le
    // cuenta que algo fue mal, para no fingir un envío que no ocurrió.
    return authorized ? json(500, { error: 'internal' }) : json(202, { accepted: true });
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

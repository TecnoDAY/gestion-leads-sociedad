// Endurecimiento de seguridad (odd/tasks/security-hardening.md); sin red ni datos reales.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');

test('S1: kanban.html standalone retirado del repo y del build', async () => {
  assert.equal(existsSync(new URL('kanban.html', root)), false);
  const { default: configure } = await import(new URL('vite.config.ts', root).href);
  const config = configure({ command: 'build', mode: 'production' });
  assert.deepEqual(config.build.rollupOptions.input, { main: 'index.html' });
  assert.doesNotMatch(source('scripts/inline-dist.mjs'), /kanban\.html/);
});

test('S1: /kanban.html redirige a / en Vercel', () => {
  const vercel = JSON.parse(source('vercel.json'));
  assert.deepEqual(vercel.redirects, [{ source: '/kanban.html', destination: '/', permanent: true }]);
});

// --- Harness Edge: ejecuta el handler real con Supabase, fetch y web-push sinteticos ---
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const USER = { id: 'user-1', email: 'agente@example.test' };

function loadEdge(slug, {
  access = { activo: true, role: 'agente' }, lead = { id: 7, Telefono: '+34 600 111 222', GESTION: 'Agendado' },
  leadError = null, subs = [{ id: 1, endpoint: 'https://push.example.test/1', p256dh: 'k', auth: 'a' }],
  aircallUsers = [{ id: 99, email: USER.email }], vapid = { data: 'synthetic-vapid', error: null },
} = {}) {
  let handler;
  const queries = [], fetches = [], pushes = [];
  const builder = table => {
    const q = { table, eqs: [] };
    queries.push(q);
    const result = () => {
      if (table === 'user_access') return { data: access, error: null };
      if (table === 'leads') return { data: lead, error: leadError };
      if (table === 'vault.decrypted_secrets') return { data: { decrypted_secret: 'synthetic' }, error: null };
      if (table === 'push_subscriptions') return { data: subs, error: null };
      return { data: null, error: null };
    };
    const api = {
      select(cols) { q.select = cols; return api; },
      eq(col, val) { q.eqs.push([col, val]); return api; },
      delete() { q.delete = true; return api; },
      maybeSingle: async () => result(),
      single: async () => result(),
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    return api;
  };
  const service = {
    auth: { getUser: async token => (token === 'valid' ? { data: { user: USER }, error: null } : { data: null, error: { message: 'bad jwt' } }) },
    from: builder,
    rpc: async name => { queries.push({ rpc: name }); return name === 'get_vapid_private_key' ? vapid : { data: true, error: null }; },
  };
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', AIRCALL_API_ID: 'id', AIRCALL_API_TOKEN: 'tok' };
  const code = transformSync(source(`supabase/functions/${slug}/index.ts`).replace(/^import .*;\s*$/gm, ''), { loader: 'ts', target: 'es2022' }).code;
  vm.runInNewContext(code, {
    Deno: { env: { get: name => env[name] }, serve: fn => { handler = fn; }, readTextFileSync() { throw new Error('no file'); } },
    createClient: () => service, Response, Request, URL, btoa, JSON,
    console: { log() {}, warn() {}, error() {} },
    webpush: { setVapidDetails() {}, sendNotification: async (sub, body) => { pushes.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); } },
    fetch: async (url, init = {}) => {
      fetches.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
      if (String(url).includes('/users?')) return new Response(JSON.stringify({ users: aircallUsers }), { status: 200 });
      return new Response('{}', { status: 200 });
    },
  });
  const request = async (payload, token = 'valid') => {
    const res = await handler(new Request('https://example.test', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { request, queries, fetches, pushes };
}

const accessQuery = e => e.queries.find(q => q.table === 'user_access');

test('S2 aircall-dial: usuario CRM activo marca el telefono guardado del lead, ignora el del cliente', async () => {
  const e = loadEdge('aircall-dial');
  const r = await e.request({ leadId: 7, phone: '000999888777' });
  assert.deepEqual(r, { status: 200, body: { ok: true } });
  assert.deepEqual(accessQuery(e).eqs, [['user_id', USER.id]]);
  assert.ok(!e.queries.some(q => q.rpc === 'is_active_user'));
  assert.deepEqual(e.queries.find(q => q.table === 'leads').eqs, [['id', 7]]);
  const dial = e.fetches.find(f => f.url.endsWith('/users/99/dial'));
  assert.deepEqual(dial.body, { number: '34600111222' });
});

test('S2 aircall-dial: inactivo, sin acceso o rol trafficker -> 403 sin llamar a Aircall', async () => {
  for (const access of [{ activo: false, role: 'agente' }, null, { activo: true, role: 'trafficker' }]) {
    const e = loadEdge('aircall-dial', { access });
    assert.deepEqual(await e.request({ leadId: 7 }), { status: 403, body: { error: 'forbidden' } });
    assert.equal(e.fetches.length, 0);
  }
});

test('S2 aircall-dial: lead inexistente -> 404; lead sin telefono -> 400; sin marcar', async () => {
  let e = loadEdge('aircall-dial', { lead: null });
  assert.deepEqual(await e.request({ leadId: 7 }), { status: 404, body: { error: 'lead_not_found' } });
  assert.equal(e.fetches.length, 0);
  e = loadEdge('aircall-dial', { lead: { id: 7, Telefono: '' } });
  assert.deepEqual(await e.request({ leadId: 7 }), { status: 400, body: { error: 'invalid_phone' } });
  assert.equal(e.fetches.length, 0);
});

test('S2 aircall-dial: se conserva 401 sin token valido y 400 con leadId invalido', async () => {
  let e = loadEdge('aircall-dial');
  assert.deepEqual(await e.request({ leadId: 7 }, 'bad'), { status: 401, body: { error: 'unauthorized' } });
  e = loadEdge('aircall-dial');
  assert.deepEqual(await e.request({ leadId: 'x' }), { status: 400, body: { error: 'invalid_lead_id' } });
  assert.equal(e.fetches.length, 0);
});

test('S3 notify-lead-change: usuario CRM activo notifica created/updated como antes', async () => {
  let e = loadEdge('notify-lead-change');
  assert.deepEqual(await e.request({ eventType: 'updated', leadId: 7 }), { status: 200, body: { ok: true, sent: 1, removed: 0 } });
  assert.deepEqual(accessQuery(e).eqs, [['user_id', USER.id]]);
  assert.deepEqual(e.pushes, [{ endpoint: 'https://push.example.test/1', body: { title: 'Gestión de Leads', body: 'Un lead cambió a Agendado.', url: '/?lead=7', tag: 'lead-7' } }]);
  e = loadEdge('notify-lead-change');
  assert.equal((await e.request({ eventType: 'created', leadId: 7 })).status, 200);
  assert.equal(e.pushes[0].body.body, 'Se registró un nuevo lead.');
});

test('S3 notify-lead-change: inactivo, sin acceso o trafficker -> 403 sin enviar', async () => {
  for (const access of [{ activo: false, role: 'admin' }, null, { activo: true, role: 'trafficker' }]) {
    const e = loadEdge('notify-lead-change', { access });
    assert.deepEqual(await e.request({ eventType: 'updated', leadId: 7 }), { status: 403, body: { error: 'forbidden' } });
    assert.equal(e.pushes.length, 0);
  }
});

test('S3 notify-lead-change: eventType desconocido -> 400 y lead inexistente -> 404, sin enviar', async () => {
  let e = loadEdge('notify-lead-change');
  assert.deepEqual(await e.request({ eventType: 'deleted', leadId: 7 }), { status: 400, body: { error: 'invalid_event_type' } });
  assert.equal(e.pushes.length, 0);
  e = loadEdge('notify-lead-change', { lead: null });
  assert.deepEqual(await e.request({ eventType: 'updated', leadId: 7 }), { status: 404, body: { error: 'lead_not_found' } });
  assert.equal(e.pushes.length, 0);
});

test('S3 notify-lead-change: se conserva 401 sin token valido y 400 con leadId invalido', async () => {
  let e = loadEdge('notify-lead-change');
  assert.deepEqual(await e.request({ eventType: 'updated', leadId: 7 }, 'bad'), { status: 401, body: { error: 'unauthorized' } });
  e = loadEdge('notify-lead-change');
  assert.deepEqual(await e.request({ eventType: 'updated', leadId: 0 }), { status: 400, body: { error: 'invalid_lead_id' } });
});

test('S4: list_campaign_metrics v1 exige usuario activo sin cambiar firma ni grants', () => {
  const sql = source('supabase/migrations/202611010001_list_campaign_metrics_active_guard.sql');
  assert.match(sql, /create or replace function public\.list_campaign_metrics\(p_campaign_name text\)\s+returns setof public\.campaign_metrics_history/);
  assert.match(sql, /security definer\s+set search_path = public/);
  assert.match(sql, /if not public\.is_active_user\(\) then\s+raise exception using errcode = '42501', message = 'active_user_required';/);
  assert.match(sql, /revoke all on function public\.list_campaign_metrics\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.list_campaign_metrics\(text\) to authenticated;/);
  assert.match(source('scripts/test-campaign-postgres.sh'), /202611010001_\*\.sql/);
  assert.match(source('supabase/tests/campaign_metrics_test.sql'), /Inactive user listed legacy metrics/);
});

test('S5: herramientas de build en devDependencies y parches aplicados', () => {
  const pkg = JSON.parse(source('package.json'));
  for (const dep of ['vite', '@tailwindcss/vite']) {
    assert.equal(pkg.dependencies?.[dep], undefined, `${dep} no es dependencia de runtime`);
    assert.ok(pkg.devDependencies[dep], `${dep} en devDependencies`);
  }
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@fullcalendar/core', '@fullcalendar/daygrid', '@fullcalendar/timegrid']);
  const lock = source('pnpm-lock.yaml');
  for (const [name, version] of [['vite', '8.3.6'], ['tailwindcss', '4.3.5'], ['@fullcalendar/daygrid', '6.1.22'], ['@fullcalendar/timegrid', '6.1.22']]) {
    assert.match(lock, new RegExp(`\\n  '?${name.replace('/', '\\/')}@${version.replace(/\./g, '\\.')}'?:`), `${name}@${version} en lockfile`);
  }
});

test('S5: CI ejecuta las pruebas PostgreSQL de campañas con la imagen fijada', () => {
  const ci = source('.github/workflows/ci.yml');
  const image = source('scripts/test-campaign-postgres.sh').match(/public\.ecr\.aws\/supabase\/postgres:[\w.]+/)[0];
  const [, tag] = image.split(':');
  assert.ok(ci.includes(`image=${image}`) && ci.includes('docker pull $image'), 'pull de la imagen fijada');
  assert.ok(ci.includes(`docker tag supabase/postgres:${tag} $image`), 'fallback Docker Hub con la misma etiqueta');
  assert.ok(ci.indexOf('docker pull $image') < ci.indexOf('run: bash scripts/test-campaign-postgres.sh'), 'pull antes del script');
  assert.match(ci, /run: bash scripts\/test-campaign-postgres\.sh/);
});

test('S2/S3: roles CRM, proyecciones y fallo de lectura del lead', async () => {
  for (const slug of ['aircall-dial', 'notify-lead-change']) {
    const payload = { leadId: 7, eventType: 'updated' };
    for (const role of ['admin', 'agente', 'supervisor']) {
      const e = loadEdge(slug, { access: { activo: true, role } });
      assert.equal((await e.request(payload)).status, 200);
      assert.equal(accessQuery(e).select, 'activo, role');
      assert.deepEqual(accessQuery(e).eqs, [['user_id', USER.id]]);
      assert.equal(e.queries.find(q => q.table === 'leads').select, slug === 'aircall-dial' ? 'id, "Telefono"' : 'id, "GESTION"');
    }
    const e = loadEdge(slug, { leadError: { code: 'database_error' } });
    assert.deepEqual(await e.request(payload), { status: 500, body: { error: 'lead_lookup_failed' } });
    assert.equal(e.fetches.length + e.pushes.length, 0);
  }
});

test('S7 notify-lead-change: lee la clave VAPID por RPC service_role, no por la tabla vault via PostgREST', async () => {
  const e = loadEdge('notify-lead-change');
  assert.equal((await e.request({ eventType: 'updated', leadId: 7 })).status, 200);
  assert.ok(e.queries.some(q => q.rpc === 'get_vapid_private_key'));
  assert.ok(!e.queries.some(q => String(q.table || '').includes('vault')));
  assert.doesNotMatch(source('supabase/functions/notify-lead-change/index.ts'), /from\('vault\./);
});

test('S7 notify-lead-change: sin clave VAPID o con error de RPC -> 500 sin enviar', async () => {
  for (const vapid of [{ data: null, error: null }, { data: null, error: { code: 'PGRST202' } }, { data: '', error: null }]) {
    const e = loadEdge('notify-lead-change', { vapid });
    assert.deepEqual(await e.request({ eventType: 'updated', leadId: 7 }), { status: 500, body: { error: 'vapid_secret_unavailable' } });
    assert.equal(e.pushes.length, 0);
  }
});

test('S7: RPC get_vapid_private_key solo para service_role, definer con search_path vacio', () => {
  const sql = source('supabase/migrations/202611010002_vapid_private_key_rpc.sql');
  assert.match(sql, /create or replace function public\.get_vapid_private_key\(\)\s+returns text/);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /from vault\.decrypted_secrets\s+where name = 'vapid_private_key'/);
  assert.match(sql, /revoke all on function public\.get_vapid_private_key\(\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.get_vapid_private_key\(\) to service_role;/);
  assert.doesNotMatch(sql, /grant execute[^;]*to (anon|authenticated)/);
});

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const baseline = process.env.BACKEND_INTEGRITY_BASELINE === '1';
const migrationPath = 'supabase/migrations/202609300005_backend_integrity.sql';
const edgePath = 'supabase/functions/authorize-user/index.ts';
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const head = (path) => execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8' });
const migration = baseline ? '' : read(migrationPath);
const migrations = readdirSync(new URL('supabase/migrations/', root))
  .filter((name) => name.endsWith('.sql') && name < '202609300005')
  .sort().map((name) => read(`supabase/migrations/${name}`)).join('\n');
const effectiveSQL = migrations + '\n' + migration;
const edge = baseline ? head(edgePath) : read(edgePath);

// Assertions inspect the actual latest SQL definitions, not a JS reimplementation.
// They do NOT execute PostgreSQL or prove runtime concurrency/transaction behavior.
function definition(name, sql = effectiveSQL) {
  const pattern = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?as (\\$\\w*\\$)([\\s\\S]*?)\\1;`, 'gi');
  const matches = [...sql.matchAll(pattern)];
  assert.ok(matches.length, `Missing SQL definition: ${name}`);
  return matches.at(-1)[0];
}

const bodyFingerprint = (body) => createHash('md5').update(body.replace(/\s+/g, ' ').trim()).digest('hex');
const functionBody = (sql) => sql.match(/as (\$\w*\$)([\s\S]*?)\1;/i)[2];
function guard(name) {
  const match = migration.match(new RegExp(`do \\$${name}\\$([\\s\\S]*?)\\$${name}\\$;`, 'i'));
  assert.ok(match, `Missing fail-closed guard: ${name}`);
  return match[1];
}

test('rename guard pins canonical HEAD and final wrapper bodies, tolerating only whitespace', () => {
  const sql = guard('create_lead_guard');
  const canonical = functionBody(definition('create_lead', head('supabase/migrations/202609290001_campaign_stats.sql')));
  const wrapper = functionBody(definition('create_lead', migration));
  for (const [name, body] of [['canonical_body_md5', canonical], ['wrapper_body_md5', wrapper]]) {
    const fingerprint = sql.match(new RegExp(`${name} constant text := '([a-f0-9]{32})'`));
    assert.ok(fingerprint, `Missing ${name}`);
    assert.equal(fingerprint[1], bodyFingerprint(body));
    assert.equal(fingerprint[1], bodyFingerprint(`\n  ${body.replace(/\s+/g, '  \n')}  `));
    assert.notEqual(fingerprint[1], bodyFingerprint(body.replace('return ', 'perform ')), 'semantic drift changes fingerprint');
  }
  assert.match(sql, /md5\(btrim\(regexp_replace\(target\.prosrc, '\[\[:space:\]\]\+', ' ', 'g'\)\)\)/);
});

test('repeat path validates helper and wrapper without ever renaming the wrapper', () => {
  const sql = guard('create_lead_guard');
  assert.match(sql, /helper_oid oid := to_regprocedure\('public\.create_lead_record\(jsonb\)'\)/);
  assert.match(sql, /wrapper_oid oid := to_regprocedure\('public\.create_lead\(jsonb\)'\)/);
  assert.match(sql, /if wrapper_oid is null then[\s\S]*raise exception[\s\S]*create_lead_missing/);
  assert.match(sql, /coalesce\(helper_oid, wrapper_oid\)/);
  assert.match(sql, /expected_body_md5 := case when target\.oid = helper_oid or helper_oid is null then canonical_body_md5 else wrapper_body_md5 end/);
  assert.match(sql, /if helper_oid is null then\s+alter function public\.create_lead\(jsonb\) rename to create_lead_record;\s+else/);
  const repeat = sql.split(/\belse\s+-- Reejecucion/)[1];
  assert.ok(repeat, 'Missing explicit repeat branch');
  assert.doesNotMatch(repeat, /alter function|rename to/i);
  assert.equal((migration.match(/rename to create_lead_record/gi) ?? []).length, 1);
  assert.match(repeat, /aclexplode[\s\S]*helper_acl_drift/);
  assert.match(repeat, /aclexplode[\s\S]*wrapper_acl_drift/);
});

test('function guard rejects signature, owner, definer, return, config and body drift before rename', () => {
  const sql = guard('create_lead_guard');
  for (const field of ['proowner', 'prolang', 'prokind', 'prorettype', 'proretset', 'prosecdef', 'proargnames', 'pronargdefaults', 'provariadic', 'proisstrict', 'provolatile', 'proparallel', 'proconfig', 'prosrc']) {
    assert.ok(sql.includes(`target.${field}`), `Missing metadata check: ${field}`);
  }
  assert.match(sql, /current_user <> 'postgres'/);
  assert.match(sql, /'public\.leads'::regtype/);
  assert.match(sql, /pg_language where lanname = 'plpgsql'/);
  assert.match(sql, /message = 'create_lead_definition_drift'/);
  assert.ok(sql.indexOf('create_lead_definition_drift') < sql.indexOf('alter function'));
});

test('bootstrap repeat validates the existing private schema before touching its rows', () => {
  const sql = guard('bootstrap_guard');
  assert.match(sql, /if to_regclass\('public\.authorize_bootstrap'\) is null then\s+create table if not exists public\.authorize_bootstrap/);
  assert.match(sql, /relkind[\s\S]*relowner[\s\S]*relrowsecurity[\s\S]*relforcerowsecurity/);
  assert.match(sql, /not c\.relhasrules/);
  for (const catalog of ['pg_attribute', 'pg_attrdef', 'pg_constraint', 'pg_policy', 'pg_trigger', 'pg_inherits']) {
    assert.ok(sql.includes(catalog), `Missing bootstrap schema check: ${catalog}`);
  }
  assert.match(sql, /'singleton'[\s\S]*'boolean'::regtype[\s\S]*'true'/);
  assert.match(sql, /'created_at'[\s\S]*'timestamptz'::regtype[\s\S]*'now\(\)'/);
  assert.match(sql, /PRIMARY KEY \(singleton\)/);
  assert.match(sql, /CHECK \(singleton\)/);
  for (const [type, constraint] of [['p', 'PRIMARY KEY'], ['c', 'CHECK']]) {
    assert.ok(sql.includes(`and c.contype = '${type}' and pg_catalog.pg_get_constraintdef(c.oid, true) = '${constraint} (singleton)'`));
  }
  assert.equal((sql.match(/or not exists \(select 1 from pg_catalog\.pg_constraint/g) ?? []).length, 2, 'require both PK and CHECK, not two checks');
  assert.match(sql, /aclexplode[\s\S]*authorize_bootstrap_schema_drift/);
  assert.match(migration, /select true where exists \(select 1 from public\.user_access where role = 'admin'\)\s+on conflict \(singleton\) do nothing;/);
  assert.ok(migration.indexOf('authorize_bootstrap_schema_drift') < migration.indexOf('select true where exists'));
  assert.doesNotMatch(sql, /delete from|truncate|drop |update public\./i);
  assert.doesNotMatch(migration, /delete from public\.authorize_bootstrap|truncate|drop table/i);
});

test('monthly rollup removes only PUBLIC and anon execution, preserving service and active-user contract', () => {
  const sql = read('supabase/migrations/202609300004_campaign_monthly_rollup_year.sql');
  for (const role of ['public', 'anon']) {
    assert.ok(sql.includes(`revoke all on function public.campaign_monthly_rollup(int, text) from ${role};`));
  }
  assert.match(sql, /grant execute on function public\.campaign_monthly_rollup\(int, text\) to authenticated;/);
  assert.match(sql, /if not public\.is_active_user\(\) then/);
  assert.doesNotMatch(sql, /revoke[^;]*service_role|is_admin_user\(\)/);
});

test('standalone create rejects AGENDAD*, owner-only helper reuses the canonical INSERT', () => {
  const plain = definition('create_lead');
  assert.match(plain, /like 'AGENDAD%'[\s\S]*appointment_required_for_agendado_transition/);
  assert.match(plain, /return public\.create_lead_record\(p_lead\)/);
  assert.match(migration, /alter function public\.create_lead\(jsonb\) rename to create_lead_record/);
  assert.match(migration, /revoke all on function public\.create_lead_record\(jsonb\) from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /insert into public\.leads\s*\(/i);
  assert.doesNotMatch(migration, /set_config|current_setting.*agend|exception when others/i);
});

test('create with appointment is still one transaction; update wrapper remains canonical', () => {
  const create = definition('create_lead_with_appointment');
  assert.match(create, /jsonb_typeof\(p_lead\) is distinct from 'object'/);
  assert.match(create, /created := public\.create_lead_record\(p_lead\);[\s\S]*perform public\.create_lead_appointment\(created\.id/);
  assert.doesNotMatch(create, /exception\s+when|commit;|rollback;/i);
  const canonical = head('supabase/migrations/202609290001_campaign_stats.sql');
  assert.equal(definition('update_lead_with_appointment'), definition('update_lead_with_appointment', canonical));
  assert.doesNotMatch(migration, /campaign_monthly_rollup|agendados/i);
});

test('appointment writes require CRM actor and active locked lead before mutation', () => {
  for (const name of ['create_lead_appointment', 'set_lead_appointment_status', 'reschedule_lead_appointment']) {
    const body = definition(name);
    assert.match(body, /if not public\.is_crm_user\(\) then/);
    const leadLock = body.match(/(?:select \* into lead_record|perform 1) from public\.leads[\s\S]*?archived_at is null for update;/);
    assert.ok(leadLock, `${name}: missing active lead lock`);
    const write = body.search(/(?:insert into|update) public\.lead_appointments/);
    assert.ok(body.indexOf(leadLock[0]) < write, `${name}: lead must be locked before write`);
    if (name !== 'create_lead_appointment') {
      const appointmentLock = body.match(/select \* into (?:updated|old_appointment) from public\.lead_appointments[\s\S]*?for update;/);
      assert.ok(appointmentLock);
      assert.ok(body.indexOf(leadLock[0]) < body.indexOf(appointmentLock[0]), 'lead then appointment lock order');
      assert.match(appointmentLock[0], /public\.is_admin_user\(\) or advisor_user_id = auth\.uid\(\)/);
      assert.doesNotMatch(appointmentLock[0], /is_supervisor/);
    }
  }
  const set = definition('set_lead_appointment_status');
  assert.ok(set.indexOf('archived_at is null for update') < set.indexOf('if updated.status = p_status then return updated'));
  const reschedule = definition('reschedule_lead_appointment');
  assert.match(reschedule, /status = 'PROGRAMADA' for update/);
  assert.match(reschedule, /set status = 'REPROGRAMADA'[\s\S]*insert into public\.lead_appointments/);
  assert.doesNotMatch(reschedule, /exception\s+when/);
});

test('all new appointments use active CRM advisors (including supervisor)', () => {
  for (const name of ['create_lead_appointment', 'reschedule_lead_appointment']) {
    const body = definition(name);
    assert.match(body, /and activo = true and role in \('admin', 'agente', 'supervisor'\)\s+for share;/);
    assert.ok(body.indexOf("message = 'advisor_not_active'") < body.indexOf('insert into public.lead_appointments'));
  }
  assert.match(definition('create_lead_appointment'), /case when access\.role = 'admin' and p_advisor_user_id is not null/);
});

test('report-name API resolves strictly and rejects missing/null/ambiguous identities', () => {
  const body = definition('upsert_daily_report_note');
  assert.match(body, /p_report_date date, p_autor_name text, p_problemas text, p_observaciones text/);
  assert.match(body, /select user_id into strict target_user_id/);
  assert.match(body, /when too_many_rows then raise exception.*advisor_name_ambiguous/);
  assert.match(body, /when no_data_found then raise exception.*advisor_not_found/);
  assert.match(body, /if target_user_id is null then raise exception/);
  assert.doesNotMatch(body, /limit 1/i);
  assert.match(body, /target_user_id := access\.user_id/);
  assert.match(body, /on conflict \(report_date, autor_user_id\) do update/);
});

test('history dates the actual Miami change, ignores client date and actorless migrations', () => {
  const body = definition('record_lead_gestion');
  assert.match(body, /if auth\.uid\(\) is null then return new/);
  assert.match(body, /\(now\(\) at time zone 'America\/New_York'\)::date/);
  assert.doesNotMatch(body, /Fecha Última Gestión|regexp_match|make_date/);
  assert.match(migrations, /when \(OLD\."GESTION" is distinct from NEW\."GESTION"\)/);
});

test('email sync propagates uniqueness failures to Auth instead of silently diverging', () => {
  const body = definition('sync_user_access_email');
  assert.match(body, /update public\.user_access set email = target, updated_at = now\(\)\s+where user_id = new\.id and email is distinct from target/);
  assert.doesNotMatch(body, /not exists|exception|target is null/);
  assert.match(body, /target is not distinct from lower\(btrim\(old\.email\)\)/);
  assert.match(migrations, /after update of email on auth\.users/);
});

test('bootstrap is service-only internally, durably consumed, serialized with ordinary writes', () => {
  const body = definition('bootstrap_admin_user');
  assert.match(body, /security definer set search_path = ''/);
  assert.match(body, /current_setting\('role', true\) is distinct from 'service_role'/);
  assert.match(body, /auth\.role\(\) is distinct from 'service_role'/);
  assert.ok(body.indexOf('service_role_required') < body.indexOf('lock table public.user_access'));
  assert.match(body, /lock table public\.user_access in share row exclusive mode/);
  assert.ok(body.indexOf('lock table public.user_access') < body.indexOf('if exists'));
  assert.match(body, /exists \(select 1 from public\.authorize_bootstrap\)/);
  assert.match(body, /from auth\.users where id = p_user_id and lower\(btrim\(email\)\) = target_email/);
  assert.match(body, /if p_user_id is null then return true/);
  assert.ok(body.indexOf('insert into public.user_access') < body.indexOf('insert into public.authorize_bootstrap'));
  assert.doesNotMatch(body, /exception\s+when|p_token|bootstrap_token/i);
  assert.match(migration, /select true where exists \(select 1 from public\.user_access where role = 'admin'\)/);
  assert.match(migration, /revoke all on public\.authorize_bootstrap from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function public\.bootstrap_admin_user\(uuid, text, text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.bootstrap_admin_user\(uuid, text, text\) to service_role/);
});

const syntheticBootstrap = 'b'.repeat(40);
function loadHandler({ bootstrapOpen = true, rpcError = null, finalRpcData = true, finalRpcError = null, inviteError = null, pages = [], admin = true } = {}) {
  const calls = { rpc: [], upserts: [], invites: [], recoveries: [], pages: [], logs: [] };
  const service = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'actor', email: 'actor@example.invalid' } }, error: null }),
      resetPasswordForEmail: async (email) => { calls.recoveries.push(email); return { error: null }; },
      admin: {
        inviteUserByEmail: async (email) => {
          calls.invites.push(email);
          return inviteError ? { data: null, error: inviteError } : { data: { user: { id: 'invited-user' } }, error: null };
        },
        listUsers: async ({ page }) => {
          calls.pages.push(page);
          return pages[page - 1] ?? { data: { users: [] }, error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return {
        data: args.p_user_id === null ? bootstrapOpen : finalRpcData,
        error: args.p_user_id === null ? rpcError : finalRpcError,
      };
    },
    from: (table) => {
      assert.equal(table, 'user_access');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { role: admin ? 'admin' : 'agente' }, error: null }),
        upsert: async (row, options) => { calls.upserts.push({ row, options }); return { error: null }; },
      };
      return query;
    },
  };
  let handler;
  const env = { SUPABASE_URL: 'https://test.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', AUTHORIZE_BOOTSTRAP_TOKEN: syntheticBootstrap };
  const javascript = stripTypeScriptTypes(edge.replace(/^import .*;\s*$/m, ''));
  vm.runInNewContext(javascript, {
    Deno: { env: { get: (name) => env[name] }, serve: (callback) => { handler = callback; } },
    createClient: () => service,
    Request, Response,
    console: Object.fromEntries(['log', 'warn', 'error'].map((method) => [method, (...args) => calls.logs.push(args)])),
  });
  assert.equal(typeof handler, 'function');
  const request = (payload = {}, headers = { 'x-bootstrap-token': syntheticBootstrap }) => handler(new Request('https://test.example.invalid/authorize-user', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email: ' Person@Example.invalid ', nombre: ' Person ', role: 'admin', ...payload }),
  }));
  return { request, calls };
}

async function accepted(response) {
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
}

test('real Edge handler gates token then sends bootstrap only to RPC, never direct upsert', async () => {
  const { request, calls } = loadHandler();
  await accepted(await request());
  assert.equal(calls.rpc.length, 2);
  assert.equal(calls.rpc[0].args.p_user_id, null);
  assert.equal(calls.rpc[1].name, 'bootstrap_admin_user');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc[1].args)), { p_user_id: 'invited-user', p_email: 'person@example.invalid', p_nombre: 'Person' });
  assert.equal(calls.upserts.length, 0);
  assert.ok(!JSON.stringify(calls.rpc).includes(syntheticBootstrap));
  assert.ok(!JSON.stringify(calls.logs).includes(syntheticBootstrap));
});

test('closed bootstrap and RPC failure stay 202, with no invitations or fallback writes', async () => {
  for (const config of [{ bootstrapOpen: false }, { rpcError: { message: 'synthetic failure' } }]) {
    const { request, calls } = loadHandler(config);
    await accepted(await request());
    assert.equal(calls.invites.length, 0);
    assert.equal(calls.upserts.length, 0);
  }
});

test('final bootstrap conflict stays 202 and never falls back to a non-atomic upsert', async () => {
  for (const config of [{ finalRpcError: { message: 'synthetic conflict' } }, { finalRpcData: false }]) {
    const { request, calls } = loadHandler(config);
    await accepted(await request());
    assert.equal(calls.rpc.length, 2);
    assert.equal(calls.upserts.length, 0);
  }
});

test('bootstrap rejects non-admin role and invalid token without any provisioning', async () => {
  for (const [payload, headers] of [[{ role: 'supervisor' }, undefined], [{}, { 'x-bootstrap-token': 'wrong' }]]) {
    const { request, calls } = loadHandler();
    await accepted(await request(payload, headers));
    assert.equal(calls.invites.length, 0);
    assert.equal(calls.rpc.length, 0);
    assert.equal(calls.upserts.length, 0);
  }
});

test('authorized ordinary admin preserves supervisor role; unauthorized bearer stays 202', async () => {
  const { request, calls } = loadHandler();
  await accepted(await request({ role: 'supervisor' }, { Authorization: 'Bearer synthetic-admin' }));
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.upserts[0].row.role, 'supervisor');
  const unauthorized = loadHandler({ admin: false });
  await accepted(await unauthorized.request({}, { Authorization: 'Bearer synthetic-non-admin' }));
  assert.equal(unauthorized.calls.invites.length, 0);
  assert.equal(unauthorized.calls.upserts.length, 0);
});

test('existing Auth user beyond 1000 retains recovery and paginated lookup (T5)', async () => {
  const { request, calls } = loadHandler({
    inviteError: { message: 'already registered' },
    pages: [
      { data: { users: Array.from({ length: 1000 }, (_, i) => ({ id: `other-${i}`, email: `other-${i}@example.invalid` })) }, error: null },
      { data: { users: [{ id: 'existing-user', email: 'person@example.invalid' }] }, error: null },
    ],
  });
  await accepted(await request({}, { Authorization: 'Bearer synthetic-admin' }));
  assert.deepEqual(calls.pages, [1, 2]);
  assert.deepEqual(calls.recoveries, ['person@example.invalid']);
  assert.equal(calls.upserts[0].row.user_id, 'existing-user');
});

test('invalid email remains non-enumerating and unknown role remains 400', async () => {
  const { request, calls } = loadHandler();
  await accepted(await request({ email: 'invalid' }));
  const invalidRole = await request({ role: 'invented' });
  assert.equal(invalidRole.status, 400);
  assert.deepEqual(await invalidRole.json(), { error: 'invalid_role' });
  assert.equal(calls.invites.length, 0);
});

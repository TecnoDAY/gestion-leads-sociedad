import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const logic = () => import('../../src/legacy/team-presence.js');
const now = Date.parse('2026-11-13T12:00:00Z');
const ago = ms => new Date(now - ms).toISOString();

// Execute real public UI handlers, following panel-admin-cierre.test.mjs.
function handler(name) {
  const html = read('index.html');
  const match = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(html);
  assert.ok(match, name);
  const start = match.index;
  for (let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Invalid handler: ${name}`);
}

test('presence: inclusive 3-minute boundary, absent and missing/invalid signals', async () => {
  const { presenceStatus } = await logic();
  assert.equal(presenceStatus(ago(179999), now), 'online');
  assert.equal(presenceStatus(ago(180000), now), 'online');
  assert.equal(presenceStatus(ago(180001), now), 'away');
  for (const value of [null, undefined, '', 'invalid']) assert.equal(presenceStatus(value, now), 'unknown');
  assert.equal(presenceStatus(ago(-1000), now), 'online'); // client clock skew: never negative elapsed time
});

test('presence: grouping and counts preserve all people, never mutate RPC rows', async () => {
  const { groupPresence, presenceSummary } = await logic();
  const rows = Object.freeze([
    Object.freeze({ nombre: 'Ana', last_seen_at: ago(1) }),
    Object.freeze({ nombre: 'Luis', last_seen_at: ago(180001) }),
    Object.freeze({ nombre: 'Sin señal', last_seen_at: null }),
  ]);
  const groups = groupPresence(rows, now);
  assert.deepEqual(Object.values(groups).map(g => g.length), [1, 1, 1]);
  assert.equal(groups.online[0], rows[0]);
  assert.equal(presenceSummary(groups), '1 en línea · 1 ausentes · 1 sin datos');
  assert.equal(presenceSummary(groupPresence([], now)), '0 en línea · 0 ausentes · 0 sin datos');
});

test('presence: relative-time seconds/minutes/hours/days and clock skew', async () => {
  const { presenceRelativeTime } = await logic();
  for (const [ms, label] of [[0, 'hace 0 s'], [59000, 'hace 59 s'], [60000, 'hace 1 min'], [3600000, 'hace 1 h'], [86400000, 'hace 1 día'], [172800000, 'hace 2 días'], [-1000, 'hace 0 s']]) {
    assert.equal(presenceRelativeTime(ago(ms), now), label);
  }
  assert.equal(presenceRelativeTime(null, now), 'sin datos');
});

test('presence: safe cards, explicit statuses, roles, last signal and empty state', async () => {
  const { teamPresenceHtml, groupPresence } = await logic();
  const html = teamPresenceHtml(groupPresence([
    { nombre: '<img src=x onerror="alert(1)"> & \'', role: '<admin>', last_seen_at: ago(1) },
    { nombre: 'Ana López', role: 'agente', last_seen_at: ago(240000) },
    { nombre: '', role: 'trafficker', last_seen_at: null, email: 'must-not-render@example.test' },
  ], now), now);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#039;/);
  assert.match(html, /&lt;admin&gt;/);
  assert.doesNotMatch(html, /<img|<admin>|must-not-render|Desconectada|Trabajando/);
  for (const text of ['En línea', 'Ausentes', 'Ausente', 'Sin datos', 'Última vez hace 4 min', 'AL', 'Sin nombre']) assert.ok(html.includes(text), text);
  assert.match(teamPresenceHtml(groupPresence([], now), now), /No hay personas activas en el equipo\./);
});

test('presence RPC: active caller only, active team left join, no private columns or retry errors', () => {
  const sql = read('supabase/migrations/202611130001_team_presence.sql');
  assert.match(sql, /create or replace function public\.list_team_presence\(\)/i);
  const columns = sql.match(/returns table\s*\(([^)]+)\)/i)?.[1];
  assert.ok(columns);
  assert.equal(columns.replace(/\s+/g, ' ').trim(), 'user_id uuid, nombre text, role text, last_seen_at timestamptz');
  assert.doesNotMatch(columns, /email/i);
  for (const re of [/security definer/i, /set search_path = public/i, /\bstable\b/i, /if not public\.is_active_user\(\)/i, /errcode = '42501'/i, /left join public\.crm_task_presence/i, /where ua\.activo = true/i, /revoke all on function public\.list_team_presence\(\) from public, anon/i, /grant execute on function public\.list_team_presence\(\) to authenticated/i]) assert.match(sql, re);
  assert.doesNotMatch(sql, /40001|40P01|\binsert\b|\bupdate\b|\bdelete\b/i);
});

test('Usuarios: every active role sees both entry points; catalogs remain admin only', () => {
  const fn = handler('setAppAuthenticated');
  for (const role of ['admin', 'agente', 'supervisor', 'trafficker']) {
    const nodes = new Map();
    const document = {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { classList: { toggle: (_cls, hidden) => { nodes.get(id).hidden = hidden; } } });
        return nodes.get(id);
      },
      querySelectorAll: () => [],
    };
    const context = { document, window: {}, configureUsersTabs() {} };
    vm.runInNewContext(`(${fn})`, context)({ id: 'u', email: 'test' }, { role, activo: true, nombre: 'Ana' });
    assert.equal(nodes.get('btnAdminUsers').hidden, false, role);
    assert.equal(nodes.get('btnMoreAdminUsers').hidden, false, role);
    assert.equal(nodes.get('btnCatalogs').hidden, role !== 'admin', role);
  }
  assert.doesNotMatch(read('index.html').match(/<button[^>]*id="btnMoreAdminUsers"[^>]*>/)?.[0] || '', /data-admin-only/);
});

test('Usuarios tabs: Equipo default; Accesos admin only, with unchanged guarded RPC loaders', () => {
  const html = read('index.html');
  assert.match(html, /role="tablist" aria-label="Secciones de Usuarios"/);
  assert.match(html, /id="usersTeamTab"[^>]*role="tab"[^>]*aria-controls="usersTeamPanel"/);
  assert.match(html, /<template id="usersAccessTemplate">/);
  assert.match(handler('configureUsersTabs'), /if \(isAdmin\)/);
  assert.match(handler('selectUsersTab'), /!isAdmin/);
  for (const name of ['loadAuthorizedUsers', 'loadAgentSessionsReport', 'setUserActive', 'setIdleTimeout', 'openChangeEmail', 'handleChangeEmail', 'handleAuthorizeUser']) assert.match(handler(name), /!isAdmin/);
});

function teamUi(admin = false) {
  const nodes = new Map();
  function element(id) {
    if (nodes.has(id)) return nodes.get(id);
    const el = { id, textContent: '', innerHTML: '', hidden: false, tabIndex: 0, disabled: false, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      replaceChildren() { this.textContent = this.innerHTML = ''; },
      remove() { nodes.delete(id); },
    };
    nodes.set(id, el);
    return el;
  }
  for (const id of ['usersTeamTab', 'usersTeamPanel', 'usersTabs', 'teamPresenceStatus', 'teamPresenceRefresh', 'teamPresenceUpdated', 'teamPresenceSummary', 'teamPresenceGroups']) element(id);
  const shell = { append: () => { element('usersAccessPanel'); } };
  element('usersTabs').append = () => { element('usersAccessTab'); };
  for (const id of ['usersAccessTabTemplate', 'usersAccessTemplate']) element(id).content = { cloneNode: () => ({}) };
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: id => nodes.get(id) || null, querySelector: () => shell },
    currentUser: { id: 'user' }, currentAccess: { activo: true, updated_at: 'v1' }, isAdmin: admin,
    sessionGeneration: 1, teamPresenceRequest: 0, teamPresenceRows: null, teamPresenceUpdatedAt: null,
    teamPresenceTimer: null, usersReturnFocus: null, clearInterval() {},
    supabaseClient: { rpc: name => { calls.push(name); return Promise.resolve({ data: [], error: null }); } },
    renderTeamPresence() {}, loadAuthorizedUsers: () => calls.push('admin_manage_user_access'),
    loadAgentSessionsReport: () => calls.push('admin_agent_sessions_report'),
    console: { warn() {} },
  });
  for (const name of ['configureUsersTabs', 'selectUsersTab', 'loadTeamPresence', 'resetTeamPresence']) vm.runInContext(handler(name), context);
  return { context, nodes, calls, element };
}

test('admin preservation: Accesos mounts existing controls and both report loaders still run', () => {
  const { context, nodes, calls } = teamUi(true);
  context.configureUsersTabs();
  assert.ok(nodes.has('usersAccessTab') && nodes.has('usersAccessPanel'));
  assert.equal(nodes.get('usersTeamTab').attributes['aria-selected'], 'true');
  assert.equal(nodes.get('usersAccessPanel').hidden, true);
  assert.deepEqual(calls, []);
  context.selectUsersTab('access');
  assert.equal(nodes.get('usersAccessTab').attributes['aria-selected'], 'true');
  assert.equal(nodes.get('usersAccessTab').tabIndex, 0);
  assert.equal(nodes.get('usersTeamPanel').hidden, true);
  assert.equal(nodes.get('usersAccessPanel').hidden, false);
  assert.deepEqual(calls, ['admin_manage_user_access', 'admin_agent_sessions_report']);
});

test('live admin downgrade removes a previously mounted Accesos view without admin RPCs', () => {
  const { context, nodes } = teamUi(true);
  context.configureUsersTabs();
  context.selectUsersTab('access');
  let configured = 0;
  context.configureUsersTabs = () => { configured++; };
  context.document.querySelectorAll = () => [];
  for (const node of nodes.values()) node.classList = { toggle() {} };
  context.window = {};
  vm.runInContext(handler('setAppAuthenticated'), context);
  context.setAppAuthenticated({ id: 'user' }, { role: 'agente', activo: true, nombre: 'Ana' });
  assert.equal(configured, 1, 'authentication reconfigures tabs when admin permission is revoked');
  // Execute the same real configurator with the downgraded role.
  vm.runInContext(handler('configureUsersTabs'), context);
  context.configureUsersTabs();
  assert.equal(nodes.has('usersAccessTab'), false);
  assert.equal(nodes.has('usersAccessPanel'), false);
  assert.equal(nodes.get('usersTeamPanel').hidden, false);
});

test('non-admin: neither Accesos DOM nor admin RPCs, even if selection is invoked directly', () => {
  const { context, nodes, calls } = teamUi(false);
  context.configureUsersTabs();
  context.selectUsersTab('access');
  assert.equal(nodes.has('usersAccessTab'), false);
  assert.equal(nodes.has('usersAccessPanel'), false);
  assert.equal(nodes.get('usersTeamTab').attributes['aria-selected'], 'true');
  assert.deepEqual(calls, []);
});

test('presence loading, success, retryable error and session fencing use only the safe RPC', async () => {
  const { context, nodes, calls } = teamUi();
  let resolve;
  context.supabaseClient.rpc = name => { calls.push(name); return new Promise(done => { resolve = done; }); };
  const load = context.loadTeamPresence();
  assert.equal(nodes.get('teamPresenceStatus').textContent, 'Cargando equipo…');
  assert.equal(nodes.get('teamPresenceRefresh').disabled, true);
  resolve({ data: [], error: null });
  await load;
  assert.equal(nodes.get('teamPresenceStatus').textContent, 'Equipo actualizado. No hay personas activas.');
  assert.equal(nodes.get('teamPresenceRefresh').disabled, false);
  assert.ok(context.teamPresenceUpdatedAt);
  const updatedAt = context.teamPresenceUpdatedAt;
  const failed = context.loadTeamPresence();
  resolve({ data: null, error: { code: '42501' } });
  await failed;
  assert.equal(nodes.get('teamPresenceStatus').textContent, 'No se pudo cargar el equipo. Pulsa Actualizar para reintentar.');
  assert.equal(nodes.get('teamPresenceStatus').attributes.role, 'alert');
  assert.equal(context.teamPresenceUpdatedAt, updatedAt);
  assert.equal(nodes.get('teamPresenceRefresh').disabled, false);
  const stale = context.loadTeamPresence();
  context.sessionGeneration++;
  context.resetTeamPresence();
  resolve({ data: [{ nombre: 'Previous session' }], error: null });
  await stale;
  assert.equal(context.teamPresenceRows, null);
  assert.equal(context.teamPresenceUpdatedAt, null);
  assert.equal(nodes.get('teamPresenceGroups').innerHTML, '');
  assert.deepEqual(calls, ['list_team_presence', 'list_team_presence', 'list_team_presence']);
});

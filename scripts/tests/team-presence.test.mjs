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

let presentationApi;
function teamUi(admin = false) {
  const nodes = new Map();
  function element(id) {
    if (nodes.has(id)) return nodes.get(id);
    const el = { id, textContent: '', innerHTML: '', hidden: false, tabIndex: 0, disabled: false, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      replaceChildren() { this.textContent = this.innerHTML = ''; },
      remove() { nodes.delete(id); },
      focus() { context.document.activeElement = this; },
      dataset: {},
    };
    nodes.set(id, el);
    return el;
  }
  for (const id of ['usersTeamTab', 'usersTeamPanel', 'usersTabs', 'teamPresenceStatus', 'teamPresenceRefresh', 'teamPresenceUpdated', 'teamPresenceSummary', 'teamPresenceGroups', 'teamPresenceHistory', 'teamPresenceHistoryBody', 'teamPresenceHistoryTitle']) element(id);
  const shell = { append: () => { element('usersAccessPanel'); } };
  element('usersTabs').append = () => { element('usersAccessTab'); };
  for (const id of ['usersAccessTabTemplate', 'usersAccessTemplate']) element(id).content = { cloneNode: () => ({}) };
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: id => nodes.get(id) || null, querySelector: () => shell },
    currentUser: { id: 'user' }, currentAccess: { activo: true, updated_at: 'v1' }, isAdmin: admin,
    sessionGeneration: 1, teamPresenceRequest: 0, teamPresenceRows: null, teamPresenceUpdatedAt: null,
    teamPresenceTimer: null, usersReturnFocus: null, clearInterval() {},
    presenceHistoryRequest: 0, presenceHistoryUserId: null,
    window: { teamPresenceApi: presentationApi },
    closePresenceHistory() {},
    renderPresenceHistory() {},
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
  assert.equal(nodes.get('teamPresenceRefresh').disabled, false, 'reset releases the previous loading state');
  assert.equal(nodes.get('teamPresenceGroups').innerHTML, '');
  assert.deepEqual(calls, ['list_team_presence', 'list_team_presence', 'list_team_presence']);
});

test('T1: changing access while loading never leaves Actualizar disabled', async () => {
  const { context, nodes } = teamUi();
  let finish;
  context.supabaseClient.rpc = () => new Promise(resolve => { finish = resolve; });
  const pending = context.loadTeamPresence();
  context.currentAccess.updated_at = 'v2';
  finish({ data: [{ nombre: 'Stale' }], error: null });
  await pending;
  assert.equal(context.teamPresenceRows, null, 'stale result stays discarded');
  assert.equal(nodes.get('teamPresenceRefresh').disabled, false);
  assert.equal(nodes.get('teamPresenceStatus').textContent, 'El acceso cambió. Pulsa Actualizar para volver a cargar el equipo.');
});

test('presence counters: minutes, hours, days, invalid values and clock skew', async () => {
  const { presenceDuration, presenceCounter } = await logic();
  for (const [seconds, text] of [[0, '0 min'], [59, '0 min'], [60, '1 min'], [8100, '2 h 15 min'], [86400, '1 día'], [9 * 86400, '9 días'], [-5, '0 min'], [NaN, '0 min']]) {
    assert.equal(presenceDuration(seconds), text);
  }
  const person = { last_seen_at: ago(1000), current_period_started_at: ago(8100000) };
  assert.equal(presenceCounter(person, 'online', now), 'desde 04:45 · 2 h 15 min');
  assert.equal(presenceCounter(person, 'online', now + 60000), 'desde 04:45 · 2 h 16 min');
  assert.equal(presenceCounter({ last_seen_at: ago(2700000) }, 'away', now), 'desde 06:15 · 45 min');
  assert.equal(presenceCounter({ last_seen_at: ago(9 * 86400000) }, 'away', now), 'desde 4 nov, 07:00 · 9 días');
  // Más de 24 h: conserva la hora de inicio y el contador sigue avanzando por minuto.
  const longAway = { last_seen_at: ago(25.5 * 3600000) };
  assert.equal(presenceCounter(longAway, 'away', now), 'desde 12 nov, 05:30 · 1 día 1 h 30 min');
  assert.equal(presenceCounter(longAway, 'away', now + 3600000), 'desde 12 nov, 05:30 · 1 día 2 h 30 min');
  assert.equal(presenceCounter({ last_seen_at: ago(1) }, 'online', now), 'Inicio del periodo sin registrar');
  assert.equal(presenceCounter({ current_period_started_at: ago(-60000) }, 'online', now), 'desde 07:01 · 0 min');
  assert.equal(presenceCounter({}, 'unknown', now), '');
  assert.equal(presenceDuration(86400 + 8100), '1 día 2 h 15 min');
});

test('history cards: active admin/supervisor only, safe attributes and expanded state', async () => {
  const { canViewPresenceHistory, teamPresenceHtml, groupPresence } = await logic();
  const rows = [{ user_id: 'u', nombre: 'Ana', last_seen_at: ago(1), current_period_started_at: ago(8100000) }];
  for (const role of ['admin', 'supervisor', 'agente', 'trafficker']) {
    assert.equal(canViewPresenceHistory({ role, activo: true }), ['admin', 'supervisor'].includes(role));
    const html = teamPresenceHtml(groupPresence(rows, now), now, { role, activo: true }, 'u');
    assert.equal(html.includes('<button'), ['admin', 'supervisor'].includes(role));
    if (role === 'admin' || role === 'supervisor') {
      assert.match(html, /aria-expanded="true" aria-controls="teamPresenceHistory"/);
      assert.match(html, /data-ev="click:togglePresenceHistory\(this\)"/);
    }
    assert.match(html, /En línea · desde 04:45 · 2 h 15 min/);
  }
  assert.equal(canViewPresenceHistory({ role: 'admin', activo: false }), false);
  assert.equal(canViewPresenceHistory(null), false);
});

test('history rendering: Hoy/Ayer, Miami times, ongoing, weekly labels, empty and escaped data', async () => {
  const { presenceHistoryHtml } = await logic();
  const data = {
    days: [
      { date: '2026-11-13', periods: [{ state: 'online', started_at: '2026-11-13T14:12:00Z', ended_at: '2026-11-13T16:27:00Z', seconds: 8100, ongoing: true }] },
      { date: '2026-11-12', periods: [{ state: 'away', started_at: '2026-11-12T18:00:00Z', ended_at: '2026-11-12T18:45:00Z', seconds: 2700 }] },
    ],
    weeks: Array.from({ length: 4 }, () => ({ start_date: '2026-11-09', end_date: '2026-11-15', online_seconds: 8100, away_seconds: 2700 })),
  };
  const html = presenceHistoryHtml(data);
  for (const text of ['Hoy', 'Ayer', '09:12 – ahora', '13:00 – 13:45', 'En línea', 'Ausente', '2 h 15 min', '45 min', 'Resumen semanal', 'Esta semana', 'Semana anterior', 'Hace 2 semanas', 'Hace 3 semanas', '9 nov', '15 nov', 'Ausente = tiempo entre la primera conexión y la última desconexión del día. En línea = CRM abierto; no indica trabajo. Historial desde que se activó el registro.']) assert.ok(html.includes(text), text);
  assert.match(presenceHistoryHtml({ days: [], weeks: [] }), /Aún no hay historial registrado/);
  assert.match(presenceHistoryHtml({ ...data, days: [{ date: '<img src=x>', periods: [] }] }), /&lt;img src=x&gt;/);
  assert.doesNotMatch(presenceHistoryHtml({ ...data, days: [{ date: '<img src=x>', periods: [] }] }), /<img/);
});

async function historyUi(role = 'admin') {
  presentationApi = await logic();
  const ui = teamUi(role === 'admin');
  Object.assign(ui.context.currentAccess, { role });
  ui.context.teamPresenceRows = [{ user_id: 'target', nombre: '<Ana>' }];
  for (const name of ['renderPresenceHistory', 'closePresenceHistory', 'togglePresenceHistory', 'usersPanelKeydown']) vm.runInContext(handler(name), ui.context);
  const button = ui.element('team-person-target');
  button.dataset.userId = 'target';
  return { ...ui, button };
}

test('history public handler: roles gate RPC; loading, success, Escape focus and error/empty states', async () => {
  for (const role of ['agente', 'trafficker']) {
    const { context, button, calls } = await historyUi(role);
    await context.togglePresenceHistory(button);
    assert.deepEqual(calls, []);
    assert.equal(context.presenceHistoryUserId, null);
  }
  for (const role of ['admin', 'supervisor']) {
    const { context, button, nodes, calls } = await historyUi(role);
    let finish;
    context.supabaseClient.rpc = (name, args) => { calls.push([name, args.p_user_id]); return new Promise(resolve => { finish = resolve; }); };
    const pending = context.togglePresenceHistory(button);
    assert.equal(nodes.get('teamPresenceHistory').hidden, false);
    assert.equal(nodes.get('teamPresenceHistoryBody').textContent, 'Cargando historial…');
    assert.equal(nodes.get('teamPresenceHistoryTitle').textContent, 'Historial de <Ana>');
    finish({ data: { days: [], weeks: [] }, error: null });
    await pending;
    assert.match(nodes.get('teamPresenceHistoryBody').innerHTML, /Aún no hay historial registrado/);
    assert.deepEqual(calls, [['get_presence_history', 'target']]);
    context.usersPanelKeydown({ key: 'Escape', preventDefault() {} });
    assert.equal(nodes.get('teamPresenceHistory').hidden, true);
    assert.equal(context.document.activeElement, button);
    assert.equal(context.presenceHistoryUserId, null);
    const failure = context.togglePresenceHistory(button);
    finish({ data: null, error: { code: '42501' } });
    await failure;
    assert.match(nodes.get('teamPresenceHistoryBody').textContent, /No se pudo cargar el historial/);
    assert.equal(nodes.get('teamPresenceHistoryBody').attributes.role, 'alert');
  }
});

test('history: close/session switch/live downgrade fence late RPC responses', async () => {
  for (const reason of ['close', 'session', 'downgrade']) {
    const { context, button, nodes } = await historyUi();
    let finish;
    context.supabaseClient.rpc = () => new Promise(resolve => { finish = resolve; });
    const pending = context.togglePresenceHistory(button);
    if (reason === 'close') context.closePresenceHistory(false);
    if (reason === 'session') { context.sessionGeneration++; context.resetTeamPresence(); }
    if (reason === 'downgrade') { context.currentAccess.role = 'agente'; context.closePresenceHistory(false); }
    finish({ data: { days: [], weeks: [] }, error: null });
    await pending;
    assert.equal(nodes.get('teamPresenceHistory').hidden, true);
    assert.equal(nodes.get('teamPresenceHistoryBody').innerHTML, '');
  }
});

test('history: inactive callers and unknown cards never request history', async () => {
  const { context, button, calls } = await historyUi();
  context.currentAccess.activo = false;
  await context.togglePresenceHistory(button);
  context.currentAccess.activo = true;
  button.dataset.userId = 'not-in-list';
  await context.togglePresenceHistory(button);
  assert.deepEqual(calls, []);
  assert.equal(context.presenceHistoryUserId, null);
});

test('history: real live supervisor downgrade clears an open history immediately', async () => {
  const { context, button, nodes } = await historyUi('supervisor');
  await context.togglePresenceHistory(button);
  assert.equal(nodes.get('teamPresenceHistory').hidden, false);
  context.window.closePresenceHistory = context.closePresenceHistory;
  context.window.renderTeamPresence = context.renderTeamPresence;
  context.document.querySelectorAll = () => [];
  for (const node of nodes.values()) node.classList = { toggle() {} };
  vm.runInContext(handler('setAppAuthenticated'), context);
  context.setAppAuthenticated({ id: 'user' }, { role: 'agente', activo: true });
  assert.equal(nodes.get('teamPresenceHistory').hidden, true);
  assert.equal(nodes.get('teamPresenceHistoryBody').innerHTML, '');
});

test('presence: counter re-renders preserve focused cards and never request data', async () => {
  const { context, button, nodes, calls } = await historyUi();
  context.teamPresenceUpdatedAt = new Date(now).toISOString();
  context.teamPresenceRows[0].last_seen_at = ago(240000);
  button.focus();
  vm.runInContext(handler('renderTeamPresence'), context);
  context.renderTeamPresence();
  context.renderTeamPresence();
  assert.equal(context.document.activeElement, button);
  assert.deepEqual(calls, []);
  assert.match(nodes.get('teamPresenceGroups').innerHTML, /aria-expanded="false"/);
  assert.match(handler('toggleAdminUsers'), /setInterval\(renderTeamPresence, 30000\)/);
});

test('periods migration: secured RPC-only table, preserved heartbeat, serialized merge and retention', () => {
  const sql = read('supabase/migrations/202611140001_presence_periods.sql');
  assert.match(sql, /^.*\bbegin;/is);
  assert.match(sql, /commit;\s*$/i);
  for (const re of [/create table if not exists public\.crm_presence_periods/i, /id bigserial primary key/i, /user_id uuid not null references auth\.users\(id\) on delete cascade/i, /started_at timestamptz not null/i, /last_seen_at timestamptz not null/i, /\(user_id, last_seen_at desc\)/i, /\(last_seen_at\)/i, /enable row level security/i, /revoke all on public\.crm_presence_periods from public, anon, authenticated/i]) assert.match(sql, re);
  assert.doesNotMatch(sql, /create policy|40001|40P01|\bemail\b/i);
  const heartbeat = sql.match(/create or replace function public\.crm_task_heartbeat\(\)[\s\S]*?\$\$;/i)?.[0];
  assert.ok(heartbeat);
  for (const re of [/returns void/i, /security definer/i, /set search_path = public/i, /ua\.role in \('agente', 'supervisor', 'admin'\)/i, /crm_access_required/i, /pg_advisory_xact_lock\(hashtextextended\('crm_task_presence:'/i, /insert into public\.crm_task_presence/i, /on conflict \(user_id\) do update set last_seen_at = excluded.last_seen_at/i, /interval '5 minutes'/i, /update public\.crm_presence_periods/i, /insert into public\.crm_presence_periods/i, /delete from public\.crm_presence_periods[\s\S]*auth\.uid\(\)[\s\S]*interval '35 days'/i]) assert.match(heartbeat, re);
  assert.ok(heartbeat.indexOf('pg_advisory_xact_lock') < heartbeat.indexOf('insert into public.crm_task_presence'));
  for (const name of ['crm_task_heartbeat()', 'list_team_presence()', 'get_presence_history(uuid)']) {
    assert.ok(sql.includes(`revoke all on function public.${name} from public, anon`), name);
    assert.ok(sql.includes(`grant execute on function public.${name} to authenticated`), name);
  }
  const history = sql.match(/create or replace function public\.get_presence_history[\s\S]*?\$\$;/i)?.[0];
  assert.ok(history);
  for (const re of [/security definer/i, /\bstable\b/i, /set search_path = public/i, /ua\.user_id = auth\.uid\(\)/i, /ua\.activo = true/i, /ua\.role in \('admin', 'supervisor'\)/i, /errcode = '42501'/i, /America\/New_York/, /date_trunc\('week'/i, /interval '3 minutes'/i, /online_seconds/, /away_seconds/, /greatest\(/i, /least\(/i]) assert.match(history, re);
  assert.match(sql, /drop function if exists public\.list_team_presence\(\)/i);
  assert.match(sql, /current_period_started_at timestamptz/i);
  assert.match(sql, /if not public\.is_active_user\(\)/i);
  assert.match(history, /generate_series\(0, 3\)/i, 'four weeks');
  assert.match(history, /monday - n \* 7/i, 'weekly date boundaries, not fixed-duration intervals');
  assert.match(history, /greatest\(p\.started_at, d\.day_start\)/i);
  assert.match(history, /least\(p\.ended_at, d\.day_end\)/i);
  assert.match(history, /max\(ended_at\) - min\(started_at\)/i, 'away excludes time outside the daily span');
  assert.match(history, /lag\(ended_at\) over \(partition by day/i, 'daily internal gaps only');
  assert.match(history, /d\.day >= clock\.today - 1/i, 'Hoy and Ayer');
});

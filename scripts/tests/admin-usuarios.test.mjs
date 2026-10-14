// Fase 33: caracterizacion del panel de administracion (usuarios autorizados y
// actividad de asesoras) extraido a src/legacy/admin.js.
// GOLDEN: renderAuthorizedUsers, loadAuthorizedUsers, loadAgentSessionsReport y
// handleChangeEmail de HEAD (git show) corren en sandbox vm contra un DOM falso
// (contenedores con setter innerHTML que registra writes, input.value y
// getElementById opcional) con reloj fijo, y deben coincidir byte a byte con
// los wrappers del arbol de trabajo delegando en el modulo. Samples: roles
// admin/agente con idle on/off, activo/inactivo, nombre sin email, email sin
// nombre, busquedas con acentos/mayusculas, sesiones activas/stale/ended/
// begin-only y los codigos de changeEmailMessages con su fallback.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { escapeHtml, escapeAttr } from '../../src/legacy/helpers.js';
import * as adminApi from '../../src/legacy/admin.js';

const root = new URL('../..', import.meta.url).pathname;
// Golden anclado al ultimo commit donde index.html llevaba estas piezas
// INLINE (idleMiami, changeEmailMessages, loadAgentSessionsReport sin
// delegar): la fase 33 las movio a admin.js, asi que 'HEAD' ya no sirve
// como fuente a partir del commit de la fase (898f88f queda fijo en la
// historia local; si se reescribiera, el golden deberia re-serializarse).
const headHtml = execSync('git show 898f88f:index.html', { cwd: root, encoding: 'utf8' });
const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const scriptOf = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function loadCurrentAccess'));
const headScript = scriptOf(headHtml);
const treeScript = scriptOf(treeHtml);

// Extrae la funcion real (equilibrando llaves via vm.Script), patron de fases previas.
function extractFunction(name, src, label) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(match, `${name} ausente en ${label}`);
  for (let end = src.indexOf('}', match.index); end !== -1; end = src.indexOf('}', end + 1)) {
    const candidate = src.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name} de ${label}`);
}

// --- Reloj fijo: la unica fuente de Date.now en el sandbox -------------------
const IDLE_LIMIT = 300000; // espejo de IDLE_LIMIT_MS en index.html (linea 2007)
const REAL_FIXED = Date.parse('2026-10-10T18:00:00.000Z');
const RealDate = Date;
class FixedDate extends RealDate { static now() { return REAL_FIXED; } }
const ago = ms => new RealDate(REAL_FIXED - ms).toISOString();

// --- DOM falso funcional ------------------------------------------------------
function crearDom(ids) {
  const elements = new Map();
  const writes = [];
  for (const id of ids) {
    const el = {
      id, value: '', textContent: '', focused: 0, _innerHTML: '', _added: [], _removed: [],
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) { this._innerHTML = v; writes.push({ id, html: v }); },
      classList: {
        add: c => { el._added.push(c); },
        remove: c => { el._removed.push(c); },
        contains: () => false,
      },
      focus() { el.focused++; },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    elements.set(id, el);
  }
  return {
    writes,
    el: id => elements.get(id),
    document: { getElementById: id => elements.get(id) || null, querySelector: () => null, querySelectorAll: () => [] },
  };
}

// El mock es funcional, no vacio: lucide se registra via window y el wrapper
// debe seguir llamando createIcons() exactamente como HEAD.
function baseContext({ ids = [], globals = {} } = {}) {
  const dom = crearDom(ids);
  const icons = { called: 0 };
  const lucide = { createIcons: () => { icons.called++; } };
  const ctx = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    Date: FixedDate,
    escapeHtml, escapeAttr,
    adminApi,
    IDLE_LIMIT_MS: IDLE_LIMIT,
    isAdmin: true,
    sessionGeneration: 1,
    currentUser: { id: 'sesion-1' },
    currentAccess: { role: 'admin', updated_at: 'v1' },
    authorizedUsersList: [],
    window: { lucide },
    lucide,
    supabaseClient: null,
    ...globals,
    document: dom.document,
  });
  return { ctx, dom, icons };
}

const fuenteUsuarios = (src, label) =>
  [extractFunction('renderAuthorizedUsers', src, label), extractFunction('loadAuthorizedUsers', src, label)].join('\n');

const fuenteSessions = (src, label) => {
  const helpers = src === headScript
    ? `${extractFunction('idleMiami', src, label)}\n${extractFunction('isRecentAgentSession', src, label)}\n`
    : '';
  return helpers + extractFunction('loadAgentSessionsReport', src, label);
};

// En HEAD, handleChangeEmail depende del literal changeEmailMessages y readFunctionErrorCode;
// en el arbol, de adminApi.mensajeCambioCorreo (el modulo aporta su propio literal).
const headMessagesLiteral = (/const changeEmailMessages = \{[\s\S]*?\};/).exec(headScript)?.[0] || '';
const fuenteChangeEmail = (src, label) => [
  ...(src === headScript ? [headMessagesLiteral] : []),
  extractFunction('handleChangeEmail', src, label),
  extractFunction('readFunctionErrorCode', src, label),
  extractFunction('closeChangeEmail', src, label),
].join('\n');

// --- Samples de usuarios autorizados ------------------------------------------
const USERS = [
  { user_id: 'u1', email: 'jess@x.com', nombre: 'Jessica O’Neil', role: 'agente', activo: true, idle_timeout_enabled: true },
  { user_id: 'u1', email: 'loli@x.com', nombre: 'Loli', role: 'agente', activo: true, idle_timeout_enabled: false },
  { user_id: "a'b\"c&<>", email: 'admin@x.com', nombre: 'Admin ¿Qué?', role: 'admin', activo: true, idle_timeout_enabled: true },
  { user_id: 'u4', email: 'sinnombre@x.com', nombre: '', role: 'agente', activo: false },
  { user_id: 'u5', email: null, nombre: 'Sin Correo', role: 'supervisor', activo: false, idle_timeout_enabled: true },
  { user_id: 'u6', email: '<img src=x onerror=alert(1)>', role: 'agente', activo: true },
  { user_id: 'u7', email: 'nada@x.com', nombre: 'Nada', role: 'admin', activo: false, idle_timeout_enabled: false },
];
const SEARCHES = ['', '   ', 'jess', 'ADMIN@X.COM', 'á', '¿qué?', 'super', 'no-match', '<img', '’', 'cierre'];

function goldenRender(src, label, users, search) {
  const { ctx, dom, icons } = baseContext({
    ids: ['authorizedUsers', 'userSearch', 'userSearchCount'],
    globals: { authorizedUsersList: structuredClone(users) },
  });
  dom.el('userSearch').value = search;
  vm.runInContext(fuenteUsuarios(src, label), ctx);
  ctx.renderAuthorizedUsers();
  return {
    html: dom.el('authorizedUsers').innerHTML,
    conteo: dom.el('userSearchCount').textContent,
    writes: dom.writes.map(w => `${w.id}:${w.html}`),
    icons: icons.called,
  };
}

async function goldenLoad(src, label, users, { search = '', rpcError = null, cambiarGeneracion = false, sinContenedor = false } = {}) {
  const { ctx, dom, icons } = baseContext({
    ids: sinContenedor ? ['userSearch', 'userSearchCount'] : ['authorizedUsers', 'userSearch', 'userSearchCount'],
    globals: { authorizedUsersList: [] },
  });
  dom.el('userSearch').value = search;
  let rpcs = 0;
  ctx.supabaseClient = { rpc: async () => { rpcs++; if (cambiarGeneracion) ctx.sessionGeneration++; return { data: users, error: rpcError }; } };
  vm.runInContext(fuenteUsuarios(src, label), ctx);
  const promise = ctx.loadAuthorizedUsers();
  const cargando = dom.el('authorizedUsers')?.innerHTML ?? null;
  await promise;
  return {
    cargando,
    html: dom.el('authorizedUsers')?.innerHTML ?? null,
    conteo: dom.el('userSearchCount').textContent,
    writes: dom.writes.map(w => `${w.id}:${w.html}`),
    // cache puede ser un [] creado dentro del contexto vm (otro realm): se
    // normaliza a datos puros para que deepStrictEqual compare contenido.
    cache: JSON.parse(JSON.stringify(ctx.authorizedUsersList ?? null)),
    rpcs,
    icons: icons.called,
  };
}

// --- Samples de sesiones de asesoras -------------------------------------------
const SESSIONS = [
  { user_id: 'a1', agent_name: 'Ana', active: true, started_at: ago(2 * 3600e3), last_activity_at: ago(60e3) },
  { user_id: 'a1', agent_name: 'Ana', active: true, started_at: ago(6 * 3600e3), last_activity_at: ago(10 * 60e3) },
  { user_id: 'b2', agent_name: 'Bea', active: false, started_at: ago(3 * 3600e3), last_activity_at: ago(5 * 60e3), ended_at: ago(60e3) },
  { user_id: 'c3', agent_name: null, active: true, started_at: ago(60e3), last_activity_at: null },
  { user_id: null, agent_name: 'Cy', active: false, started_at: ago(2 * 3600e3), last_activity_at: null, ended_at: ago(60e3) },
  { user_id: 'd4', agent_name: 'Dee', active: true, started_at: ago(IDLE_LIMIT), last_activity_at: ago(IDLE_LIMIT) },
  { user_id: 'e5', agent_name: 'Eve', active: true, started_at: ago(IDLE_LIMIT - 1), last_activity_at: ago(IDLE_LIMIT - 1) },
  { user_id: 'f6', agent_name: 'Fin', active: false, started_at: 'fecha-invalida' },
  {},
  { user_id: 'g7', agent_name: 'Gis', active: true, started_at: ago(IDLE_LIMIT), last_activity_at: null },
  { user_id: 'h8', agent_name: 'Ha—Olé', active: true, started_at: ago(7 * 24 * 3600e3), last_activity_at: ago(7 * 24 * 3600e3) },
];

async function goldenSessions(src, label, data, { rpcError = null, cambiarGeneracion = false, isAdmin = true, sinCliente = false } = {}) {
  const { ctx, dom, icons } = baseContext({ ids: ['agentSessionsBody'], globals: { isAdmin } });
  let rpcs = 0;
  if (!sinCliente) ctx.supabaseClient = { rpc: async () => { rpcs++; if (cambiarGeneracion) ctx.sessionGeneration++; return { data, error: rpcError }; } };
  vm.runInContext(fuenteSessions(src, label), ctx);
  await ctx.loadAgentSessionsReport();
  return {
    html: dom.el('agentSessionsBody').innerHTML,
    writes: dom.writes.map(w => w.html),
    rpcs,
    icons: icons.called,
  };
}

// --- Samples de cambio de correo ------------------------------------------------
const EMAIL_CODES = ['invalid_email', 'same_email', 'email_taken', 'email_rate_limit', 'user_not_found', 'change_rejected', 'internal', 'codigo_nuevo', null];

async function goldenChangeEmail(src, label, invokeResult) {
  const { ctx, dom } = baseContext({ ids: ['changeEmailNew', 'changeEmailStatus', 'changeEmailTarget', 'changeEmailBox'] });
  dom.el('changeEmailNew').value = ' NUEVO@x.com ';
  const toasts = [];
  const btn = { disabled: false };
  ctx.showToast = (...a) => toasts.push(a);
  ctx.changeEmailTarget = { userId: 'u9', email: 'viejo@x.com' };
  ctx.supabaseClient = { functions: { invoke: async () => invokeResult } };
  const event = { preventDefault() {}, target: { querySelector: sel => (sel === 'button[type="submit"]' ? btn : null) } };
  vm.runInContext(fuenteChangeEmail(src, label), ctx);
  await ctx.handleChangeEmail(event);
  return {
    status: dom.el('changeEmailStatus').textContent,
    enviado: dom.el('changeEmailNew').value,
    toasts,
    boxRemoved: dom.el('changeEmailBox')._removed,
    boxAdded: dom.el('changeEmailBox')._added,
    btnDisabled: btn.disabled,
    target: ctx.changeEmailTarget,
  };
}

const INVOCACIONES = [
  ...EMAIL_CODES.map(code => ({ nombre: `code:${String(code)}`, resultado: { data: { accepted: false, error: code }, error: null } })),
  { nombre: 'contexto email_taken', resultado: { data: null, error: { context: { json: async () => ({ error: 'email_taken' }) } } } },
  { nombre: 'contexto codigo raro', resultado: { data: null, error: { context: { json: async () => ({ error: 'zzz' }) } } } },
  { nombre: 'contexto ilegible', resultado: { data: null, error: { context: { json: async () => { throw new Error('cuerpo ya leido'); } } } } },
  { nombre: 'sin contexto', resultado: { data: null, error: {} } },
  { nombre: 'aceptado', resultado: { data: { accepted: true }, error: null } },
];

// --- Golden: el arbol reproduce a HEAD byte a byte ------------------------------
test('golden renderAuthorizedUsers: 7 usuarios x 11 busquedas coinciden con HEAD', async () => {
  for (const search of SEARCHES) {
    const esperado = goldenRender(headScript, 'HEAD', USERS, search);
    const actual = goldenRender(treeScript, 'árbol de trabajo', USERS, search);
    assert.deepEqual(actual, esperado, `discrepancia con HEAD en render search=${JSON.stringify(search)}`);
  }
});

test('golden renderAuthorizedUsers: casos extremos de lista coinciden con HEAD', async () => {
  const casos = [
    { nombre: 'lista vacia', users: [] },
    { nombre: 'idle_timeout_enabled ausente (respuesta antigua)', users: [{ user_id: 'z1', email: 'z@x.com', nombre: 'Zoe', role: 'agente', activo: true }] },
    { nombre: 'campos todos null', users: [{ user_id: null, email: null, nombre: null, role: null, activo: null }] },
  ];
  for (const { nombre, users } of casos) {
    for (const search of ['', 'z']) {
      const esperado = goldenRender(headScript, 'HEAD', users ?? [], search);
      const actual = goldenRender(treeScript, 'árbol', users ?? [], search);
      assert.deepEqual(actual, esperado, `discrepancia con HEAD: ${nombre} search=${JSON.stringify(search)}`);
    }
  }
});

test('golden loadAuthorizedUsers: cargando, error, exito, generacion y contenedor ausente coinciden con HEAD', async () => {
  const flujos = [
    { nombre: 'exito', args: { users: USERS } },
    { nombre: 'exito con search', args: { users: USERS, search: 'JESS' } },
    { nombre: 'error', args: { users: null, rpcError: { message: 'x' } } },
    { nombre: 'respuesta de sesion antigua', args: { users: USERS, cambiarGeneracion: true } },
    { nombre: 'contenedor ausente', args: { users: USERS, sinContenedor: true } },
    { nombre: 'lista no array del RPC', args: { users: 'raro' } },
  ];
  for (const { nombre, args } of flujos) {
    const esperado = await goldenLoad(headScript, 'HEAD', args.users, args);
    const actual = await goldenLoad(treeScript, 'árbol', args.users, args);
    assert.deepEqual(actual, esperado, `discrepancia con HEAD: load ${nombre}`);
  }
});

test('golden loadAgentSessionsReport: mezcla activa/stale/ended/begin-only coincide con HEAD', async () => {
  const flujos = [
    { nombre: 'mezcla completa', args: { data: SESSIONS } },
    { nombre: 'vacio', args: { data: [] } },
    { nombre: 'data no array', args: { data: 'raro' } },
    { nombre: 'error del RPC', args: { data: null, rpcError: { message: 'x' } } },
    { nombre: 'generacion cambiada', args: { data: SESSIONS, cambiarGeneracion: true } },
    { nombre: 'sin supabaseClient', args: { data: SESSIONS, sinCliente: true } },
    { nombre: 'no admin', args: { data: SESSIONS, isAdmin: false } },
  ];
  for (const { nombre, args } of flujos) {
    const esperado = await goldenSessions(headScript, 'HEAD', args.data, args);
    const actual = await goldenSessions(treeScript, 'árbol', args.data, args);
    assert.deepEqual(actual, esperado, `discrepancia con HEAD: sessions ${nombre}`);
  }
  // El golden de HEAD debe mostrar los tres estados y ambos plurales.
  const dorado = await goldenSessions(headScript, 'HEAD', SESSIONS, {});
  assert.match(dorado.writes[1], /Últimos 7 días · \d+ asesoras · \d+ activas<\/p><div class="users-session-list">/);
  assert.match(dorado.writes[1], /text-emerald-600">Activa/);
  assert.match(dorado.writes[1], /text-amber-600">Sin actividad reciente/);
  assert.match(dorado.writes[1], /text-slate-500">Sin sesión activa/);
  assert.match(dorado.writes[1], /1 sesión<\/span>/);
  assert.match(dorado.writes[1], /2 sesiones<\/span>/);
  assert.equal(dorado.rpcs, 1);
  assert.equal(dorado.icons, 1, 'el wrapper conserva lucide.createIcons()');
});

test('golden handleChangeEmail: los codigos y el fallback coinciden con HEAD', async () => {
  for (const { nombre, resultado } of INVOCACIONES) {
    const esperado = await goldenChangeEmail(headScript, 'HEAD', resultado);
    const actual = await goldenChangeEmail(treeScript, 'árbol', resultado);
    assert.deepEqual(actual, esperado, `discrepancia con HEAD: changeEmail ${nombre}`);
  }
});

// --- Piezas puras del modulo ------------------------------------------------------
test('el modulo exporta las piezas prometidas y changeEmailMessages es el objeto de HEAD', () => {
  for (const nombre of ['filterAuthorizedUsers', 'usuariosConteoText', 'authorizedUsersRowHtml', 'authorizedUsersHtml',
    'authorizedUsersEmptyHtml', 'authorizedUsersLoadingHtml', 'authorizedUsersErrorHtml', 'agentSessionsByAdvisor',
    'agentSessionsListHtml', 'isRecentAgentSession', 'idleMiami', 'changeEmailMessages', 'mensajeCambioCorreo']) {
    assert.ok(typeof adminApi[nombre] === (nombre === 'changeEmailMessages' ? 'object' : 'function'), `${nombre} ausente en admin.js`);
  }
  // El objeto se construyo en otro realm (vm): structuredClone lo trae al
  // realm del test para que deepStrictEqual compare prototipos compatibles.
  const headMessages = structuredClone(vm.runInNewContext(`(${/\{[\s\S]*?\}/.exec(headMessagesLiteral)[0]})`));
  assert.deepEqual(adminApi.changeEmailMessages, headMessages);
});

test('filterAuthorizedUsers normaliza, tolera nulls y conserva items por referencia', () => {
  const a = { user_id: 'a', email: 'Ana@X.com', nombre: null, role: 'agente' };
  const b = { user_id: 'b', email: null, nombre: 'Álvaro', role: 'admin' };
  const c = { user_id: 'c', email: 'otro@x.com', nombre: 'Bea', role: 'supervisor' };
  assert.deepEqual(adminApi.filterAuthorizedUsers([a, b, c], ' ana@x.com '), [a]);
  assert.deepEqual(adminApi.filterAuthorizedUsers([a, b, c], 'ÁLVARO'), [b], 'lowercase respeta acentos literales');
  assert.deepEqual(adminApi.filterAuthorizedUsers([a, b, c], ''), [a, b, c]);
  assert.deepEqual(adminApi.filterAuthorizedUsers(null, 'x'), []);
  assert.equal(adminApi.filterAuthorizedUsers([a, b], 'ana')[0], a, 'no clona los items');
});

test('usuariosConteoText y empty/loading/error son los literales de HEAD', () => {
  assert.equal(adminApi.usuariosConteoText([{}, {}, {}], 1205), '3 de 1205 usuarios');
  assert.equal(adminApi.usuariosConteoText([], 0), '0 de 0 usuarios');
  assert.equal(adminApi.authorizedUsersEmptyHtml('x'), '<p class="text-slate-500">No hay coincidencias.</p>');
  assert.equal(adminApi.authorizedUsersEmptyHtml(''), '<p class="text-slate-500">No hay usuarios.</p>');
  assert.equal(adminApi.authorizedUsersLoadingHtml(), '<p class="text-slate-500">Cargando usuarios...</p>');
  assert.equal(adminApi.authorizedUsersHtml([], ''), '<p class="text-slate-500">No hay usuarios.</p>');
  assert.equal(
    adminApi.authorizedUsersErrorHtml(),
    '<div role="alert" class="flex flex-wrap items-center gap-3 text-rose-300"><p>No se pudieron cargar los usuarios.</p><button type="button" data-ev="click:loadAuthorizedUsers()" class="min-h-11 rounded-lg border border-rose-400 px-3 py-2 font-semibold hover:bg-rose-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">Reintentar</button></div>',
  );
  // La subfila idle SOLO existe para rol agente.
  const admin = adminApi.authorizedUsersRowHtml({ user_id: 'x1', email: 'a@x.com', nombre: 'A', role: 'admin', activo: true, idle_timeout_enabled: false });
  assert.doesNotMatch(admin, /users-row-idle|setIdleTimeout/);
  const agente = adminApi.authorizedUsersRowHtml({ user_id: 'x2', email: 'g@x.com', nombre: 'G', role: 'agente', activo: true, idle_timeout_enabled: false });
  assert.match(agente, /users-row-actions users-row-idle/);
  assert.match(agente, /setIdleTimeout\('x2', true\)/);
  // escapeAttr en el id dentro de data-ev, con el booleano invertido.
  const raro = adminApi.authorizedUsersRowHtml({ user_id: `a'b"c&<>`, email: 'r@x.com', role: 'agente', activo: false, idle_timeout_enabled: true });
  assert.match(raro, /setIdleTimeout\('a&#039;b&quot;c&amp;&lt;&gt;', false\)/);
  assert.match(raro, /setUserActive\('a&#039;b&quot;c&amp;&lt;&gt;', true\)/);
});

test('isRecentAgentSession y agentSessionsByAdvisor: reglas de fecha distintas y orden por actividad', () => {
  const s = (extra = {}) => ({ user_id: 'u', agent_name: 'A', active: true, started_at: ago(6 * 3600e3), last_activity_at: ago(60e3), ...extra });
  assert.equal(adminApi.isRecentAgentSession(s(), REAL_FIXED, IDLE_LIMIT), true);
  assert.equal(adminApi.isRecentAgentSession(s({ last_activity_at: ago(IDLE_LIMIT) }), REAL_FIXED, IDLE_LIMIT), false, 'exactamente en el limite NO es reciente');
  assert.equal(adminApi.isRecentAgentSession(s({ last_activity_at: ago(IDLE_LIMIT - 1) }), REAL_FIXED, IDLE_LIMIT), true);
  assert.equal(adminApi.isRecentAgentSession(s({ active: false }), REAL_FIXED, IDLE_LIMIT), false);
  assert.equal(adminApi.isRecentAgentSession(s({ last_activity_at: null }), REAL_FIXED, IDLE_LIMIT), false, 'sin last_activity, started hace 6h: viejo');
  assert.equal(adminApi.isRecentAgentSession({ active: true, started_at: ago(60e3), last_activity_at: null }, REAL_FIXED, IDLE_LIMIT), true, 'begin-only usa started_at');
  assert.equal(adminApi.isRecentAgentSession({ active: true, last_activity_at: 'fecha-invalida' }, REAL_FIXED, IDLE_LIMIT), false);
  // activity usa last_activity || ended || started (NOTO: ended no entra en isRecent).
  const ended = { user_id: 'e', agent_name: 'E', active: false, started_at: ago(2 * 3600e3), ended_at: ago(60e3) };
  assert.equal(adminApi.isRecentAgentSession(ended, REAL_FIXED, IDLE_LIMIT), false, 'ended reciente con active:false no es recent');
  const entradas = adminApi.agentSessionsByAdvisor([ended], REAL_FIXED, IDLE_LIMIT);
  assert.equal(entradas[0].activity, REAL_FIXED - 60e3, 'la actividad maxima si usa ended_at');
  assert.deepEqual(entradas[0], { name: 'E', count: 1, active: false, stale: false, activity: REAL_FIXED - 60e3 });
  // agrupacion: misma key suma; stale por la abierta no reciente; active solo
  // si alguna ABIERTA es reciente; orden estable por actividad desc.
  const mezcla = adminApi.agentSessionsByAdvisor([
    s({ user_id: 'z', agent_name: 'Zoe', active: false, last_activity_at: ago(10 * 60e3) }),
    s({ user_id: 'z', agent_name: 'Zoe', active: true, last_activity_at: ago(24 * 3600e3) }),
    { user_id: null, agent_name: 'Key', active: false },
    {},
  ], REAL_FIXED, IDLE_LIMIT);
  assert.deepEqual(mezcla.map(e => e.name), ['Zoe', 'Key', '-'], 'orden por activity desc con empates estables');
  assert.equal(mezcla[0].count, 2);
  assert.equal(mezcla[0].active, false, 'la sesion reciente esta cerrada: no cuenta como activa');
  assert.equal(mezcla[0].stale, true, 'la sesion abierta antigua marca stale');
  assert.deepEqual(adminApi.agentSessionsByAdvisor([], REAL_FIXED, IDLE_LIMIT), []);
  assert.deepEqual(adminApi.agentSessionsByAdvisor(null, REAL_FIXED, IDLE_LIMIT), []);
});

test('agentSessionsListHtml produce encabezado, filas y estado vacio literales', () => {
  const entradas = [
    { name: 'Ana', count: 2, active: true, stale: true, activity: REAL_FIXED },
    { name: '<b>X</b>', count: 1, active: false, stale: true, activity: 0 },
    { name: 'Y', count: 3, active: false, stale: false, activity: REAL_FIXED - 3600e3 },
  ];
  const html = adminApi.agentSessionsListHtml(entradas, REAL_FIXED);
  assert.match(html, /^<p class="font-semibold text-slate-600">Últimos 7 días · 3 asesoras · 1 activas<\/p><div class="users-session-list">/);
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.match(html, /text-emerald-600">Activa/);
  assert.match(html, /text-amber-600">Sin actividad reciente/);
  assert.match(html, /text-slate-500">Sin sesión activa/);
  assert.match(html, /1 sesión<\/span>/);
  assert.match(html, /Última actividad: -<\/span>/, 'activity 0 cae en idleMiami("-")');
  assert.equal(adminApi.agentSessionsListHtml([], REAL_FIXED), '<p class="text-slate-500">Sin sesiones de asesoras en los últimos 7 días.</p>');
  assert.equal(adminApi.agentSessionsListHtml(null, REAL_FIXED), '<p class="text-slate-500">Sin sesiones de asesoras en los últimos 7 días.</p>');
});

test('idleMiami replica al monolito en valores normales, vacios y rotos', () => {
  const headIdleMiami = vm.runInNewContext(`${extractFunction('idleMiami', headScript, 'HEAD')}; idleMiami`);
  for (const ts of [null, undefined, 0, NaN, 'fecha-invalida', REAL_FIXED, ago(1234), '2026-10-10T18:00:00.000Z']) {
    assert.equal(adminApi.idleMiami(ts), headIdleMiami(ts), `idleMiami(${String(ts)})`);
  }
  assert.equal(adminApi.idleMiami(REAL_FIXED), '10/10/2026, 14:00', 'hora de Miami (EDT) con cero padding');
});

test('mensajeCambioCorreo conserva el fallback del caller para codigos desconocidos', async () => {
  for (const code of Object.keys(adminApi.changeEmailMessages)) {
    assert.equal(adminApi.mensajeCambioCorreo(code), adminApi.changeEmailMessages[code]);
  }
  for (const code of ['codigo_nuevo', '', null, undefined]) {
    assert.equal(adminApi.mensajeCambioCorreo(code), 'No se pudo solicitar el cambio de correo.');
  }
  // El golden del caller confirma el literal: el camino 'codigo_nuevo' usa el fallback.
  const esperado = await goldenChangeEmail(headScript, 'HEAD', { data: { accepted: false, error: 'codigo_nuevo' }, error: null });
  assert.equal(esperado.status, adminApi.mensajeCambioCorreo('codigo_nuevo'));
});

// --- Forma de los wrappers y salud del modulo -------------------------------------
test('wrappers del arbol: sin plantillas ni agrupacion inline, delegando en adminApi', () => {
  const render = extractFunction('renderAuthorizedUsers', treeScript, 'árbol');
  const load = extractFunction('loadAuthorizedUsers', treeScript, 'árbol');
  const sessions = extractFunction('loadAgentSessionsReport', treeScript, 'árbol');
  const change = extractFunction('handleChangeEmail', treeScript, 'árbol');
  for (const [nombre, fuente] of [['render', render], ['load', load], ['sessions', sessions]]) {
    assert.match(fuente, /adminApi\./, `${nombre} debe delegar en src/legacy/admin.js`);
    assert.doesNotMatch(fuente, /`/, `${nombre} no debe conservar plantillas`);
  }
  assert.doesNotMatch(render, /users-row|<div|\.filter\(|\.map\(/);
  assert.doesNotMatch(sessions, /users-session|advisors|\.sort\(|\.map\(|isRecentAgentSession/);
  assert.match(load, /adminApi\.authorizedUsersLoadingHtml\(\)/);
  assert.match(load, /adminApi\.authorizedUsersErrorHtml\(\)/);
  assert.match(change, /adminApi\.mensajeCambioCorreo\(code\)/);
  assert.match(sessions, /lucide\.createIcons\(\)/, 'el wrapper conserva lucide');
  assert.match(sessions, /IDLE_LIMIT_MS\)/, 'IDLE_LIMIT_MS del monolito se pasa como parametro');
  assert.match(sessions, /<p role="status">Cargando actividad…<\/p>/, 'el aviso de carga de actividad sigue siendo literal del wrapper');
});

test('admin.js es puro: sin window/document/localStorage ni IDLE_LIMIT_MS en el codigo', () => {
  const fuenteModulo = readFileSync(new URL('../../src/legacy/admin.js', import.meta.url), 'utf8');
  const sinComentarios = fuenteModulo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .split('\n').filter(linea => !linea.includes('typeof window')).join('\n');
  assert.doesNotMatch(sinComentarios, /\bwindow\b/, 'solo la linea de registro puede nombrar window');
  assert.doesNotMatch(sinComentarios, /\bdocument\b/);
  assert.doesNotMatch(sinComentarios, /localStorage|sessionStorage/);
  assert.doesNotMatch(sinComentarios, /IDLE_LIMIT_MS/, 'el umbral entra por parametro, no como global');
  assert.doesNotMatch(sinComentarios, /authorizedUsersList|isAdmin|sessionGeneration/);
  assert.match(fuenteModulo, /import \{ escapeHtml, escapeAttr \} from '\.\/helpers\.js';/, 'sin duplicar los escapes');
  assert.match(fuenteModulo, /if \(typeof window !== 'undefined'\) window\.adminApi = \{/, 'mismo patron de registro que catalogos.js');
});

test('index.html carga admin.js como modulo tras catalogos.js', () => {
  assert.match(treeHtml, /<script type="module" src="\/src\/legacy\/catalogos\.js"><\/script>\n\s*<script type="module" src="\/src\/legacy\/admin\.js"><\/script>/);
  assert.doesNotMatch(treeScript, /function idleMiami|function isRecentAgentSession|const changeEmailMessages =/, 'las piezas puras ya no viven en el monolito');
});

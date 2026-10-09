// Funciones reales del HTML, promesas controladas y datos sintéticos; sin red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function validateCurrentSession'));
function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  assert.ok(match, `Función real ausente: ${name}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}
const names = ['clearSessionState', 'closeInvalidSession', 'validateCurrentSession', 'loadCurrentAccess',
  'setAppAuthenticated', 'enterAuthenticatedSession', 'handleSignOut', 'setDashboardTabState', 'switchTab',
  'closeViewLeadModal', 'openViewLeadModal', 'findLeadByOrigin', 'getField', 'escapeHtml', 'escapeAttr',
  'fetchRowsByIdCursor', 'fetchPagedResult', 'loadLeadNotes', 'loadLeadGestiones',
  'resetReportePeriodo', 'setReporteVista', 'periodoPresetRange', 'setPeriodoPreset', 'periodoRangeKey', 'periodoValidDate',
  'buildPeriodSummary', 'validatePeriodoSummary', 'loadReportePeriodo', 'renderReportePeriodo', 'periodoPct',
  'markPeriodoReportDirty', 'updatePeriodoCsvState',
  'loadPeriodoActividad', 'validatePeriodoActividad', 'renderPeriodoActividad',
  'consolidateLeadsById', 'compareLeadIdsDescending', 'parseFechaLead',
  'stopIdleTracking', 'endAgentSessionLocally', 'startAgentActivityTracking'];
const sessionCacheNames = ['loadHistoricoData', 'performLoadHistoricoData', 'loadLeadsData', 'performLoadLeadsData',
  'getExactLeadsCount', 'fetchLeadsByIdCursor', 'fetchHistoricoByIdCursor', 'consolidateLeadsById',
  'compareLeadIdsDescending', 'withOrigin', 'haveSameLeadIds', 'loadCatalogs', 'refreshCatalogs',
  'handleRealtimeEvent', 'applyRealtimeEvent', 'upsertLeadInState', 'removeLeadFromState'];
const callbackStart = script.indexOf('if (supabaseClient) {\n      supabaseClient.auth.onAuthStateChange');
assert.ok(callbackStart >= 0);
const authSubscription = script.slice(callbackStart, script.indexOf('function setDashboardTabState', callbackStart));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const user = id => ({ id, email: `${id}@example.invalid` });
const access = (id, role = 'agente') => ({ user_id: id, activo: true, updated_at: id, role });
const sessionResult = id => ({ data: { session: { user: user(id) } }, error: null });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function frontend({ realSessionCaches = false, controlledLeadIO = false } = {}) {
  const elements = new Map(), timers = [], queries = [], sessionQueue = [], rpcQueue = [], accessQueue = [];
  const queryWaiters = [];
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const el = { className: '', innerHTML: '', textContent: '', value: '', reset() {},
      replaceChildren() { this.innerHTML = ''; this.textContent = ''; } };
    el.classList = {
      contains: name => el.className.split(/\s+/).includes(name),
      toggle(name, force) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean));
        const add = force ?? !classes.has(name);
        if (add) classes.add(name); else classes.delete(name);
        el.className = [...classes].join(' ');
      },
      add(...names) { names.forEach(name => this.toggle(name, true)); },
      remove(...names) { names.forEach(name => this.toggle(name, false)); },
    };
    elements.set(id, el);
    return el;
  }
  let callback, signOuts = 0;
  const next = (queue, fallback) => queue.length ? queue.shift().promise : Promise.resolve(fallback);
  const client = {
    auth: {
      getSession: () => next(sessionQueue, sessionResult('A')),
      signOut: async () => { signOuts++; },
      onAuthStateChange: fn => { callback = fn; },
    },
    removeChannel() {},
    rpc: () => next(rpcQueue, { data: true, error: null }),
    from(table) {
      let cursor = false, head = false, columns;
      const builder = { select(selectedColumns, options) { columns = selectedColumns; head = options?.head === true; return this; },
        eq() { return this; }, is() { return this; }, order() { return this; },
        lt() { cursor = true; return this; }, range() { return this; },
        maybeSingle: () => next(accessQueue, { data: access('A'), error: null }),
        then(resolve, reject) {
          if (realSessionCaches && table === 'leads' && !controlledLeadIO) {
            return Promise.resolve(head ? { count: 0, error: null } : { data: [], error: null }).then(resolve, reject);
          }
          if (cursor && !controlledLeadIO) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          const request = deferred(); queries.push({ table, head, columns, cursor, userId: c.currentUser?.id, ...request });
          queryWaiters.filter(waiter => waiter.index === queries.length - 1).forEach(waiter => waiter.resolve(queries.at(-1)));
          return request.promise.then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const c = vm.createContext({
    console: { warn() {}, log() {}, error() {} }, window: {}, document: { body: element('body'), getElementById: element, querySelectorAll: () => [] },
    setTimeout: fn => timers.push(fn), supabaseClient: client,
    sessionGeneration: 0, viewLeadGeneration: 0, authValidationPromise: null, sessionInitializationPromise: null,
    currentUser: null, currentAccess: null, isAdmin: false, isTrafficker: false, isSupervisor: false, isSupabaseLive: false,
    pendingPasswordSetup: false, realtimeChannel: null, realtimeSetupPromise: null, allLeads: [], allHistorico: [],
    filteredLeads: [], dataSource: 'actual', historicoLoaded: false, historicoLoadPromise: null, currentViewId: null,
    currentViewOrigin: 'actual', currentEditOrigin: 'actual', totalDatabaseCount: 0, pendingRealtimeEvents: [],
    leadNotesCache: [], leadGestionesCache: [], leadAppointmentsCache: [], editingNoteId: null,
    leadAppointmentAdvisors: [], pendingAppointmentMutations: new Map(), loadLeadsPromise: null, isLoadingLeads: false,
    newLeadRequestGeneration: 0, newLeadAdvisorGeneration: 0, newLeadSubmitting: false, editLeadRequestGeneration: 0,
    editLeadAdvisorGeneration: 0, editLeadSubmitting: false, editLeadPreviousGestion: '', editAdvisorsLoading: false,
    citasRequestGeneration: 0, reporteRequestGeneration: 0, reporteDayAdvisors: [], reporteDayData: [],
    periodoRequestGeneration: 0, periodoData: null, periodoLoadedKey: '', reporteVistaActiva: 'diario',
    periodoSourceRevision: 0, periodoLoadedRevision: -1, periodoRefreshTimer: null,
    periodoActividadData: null, periodoActividadKey: '', periodoActividadGeneration: 0,
    agentSessionId: null, idleWarnTimer: null, idleTickTimer: null, idleListenersOn: false, idleLastTouchSent: 0,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    campanasRequestGeneration: 0, campanasData: [], campaignStatsMap: new Map(), currentMainTab: 'dashboard',
    helpReturnFocus: null, histCharts: {}, resetCitasPanel() {}, miamiToday: () => '2026-09-30',
    setupRealtimeListener: async () => true, loadLeadsData: async () => true, refreshCatalogs: async () => {},
    initCampanas() {}, initReporteDiario() {}, initCitasPanel() {}, renderHistoricalAnalytics() {}, openSetPassword() {},
    formatPhone: value => value, normalizePhone: value => value, renderGestionBadge: () => '', isAgendadoGestion: () => false,
    loadLeadAppointments: async () => {},
    catalogRows: { mes: [], campana: [], medio: [], gestion: [], agente: [] },
    showLoadingState() {}, updateConnectionStatus() {}, showToast() {}, clearTimeout() {}, window: {},
  });
  const renders = [];
  for (const name of ['populateCatalogSelects', 'populateFilterOptions', 'applyFilters']) {
    c[name] = () => { renders.push(name); element(name).textContent = JSON.stringify(c.catalogRows); };
  }
  c.renderLeadNotes = () => { element('leadNotesList').innerHTML = JSON.stringify(c.leadNotesCache); };
  c.renderLeadGestiones = () => { element('leadGestionesList').innerHTML = JSON.stringify(c.leadGestionesCache); };
  vm.runInContext(names.map(extractFunction).join('\n') + '\n' + authSubscription, c);
  if (realSessionCaches) vm.runInContext(sessionCacheNames.map(extractFunction).join('\n'), c);
  return { c, element, client, timers, queries, renders, sessionQueue, rpcQueue, accessQueue,
    waitForQuery: index => queries[index] ? Promise.resolve(queries[index])
      : new Promise(resolve => queryWaiters.push({ index, resolve })),
    emit: (event, id) => callback(event, id ? { user: user(id) } : null), signOuts: () => signOuts };
}

test('período: cierre real de sesión limpia controles y estado cargado; B parte de cero', async () => {
  const f = frontend(), c = f.c;
  c.currentUser = user('A'); c.currentAccess = access('A'); c.currentMainTab = 'reporte'; c.reporteVistaActiva = 'periodo';
  c.isSupabaseLive = true;
  c.allLeads = [{ id: 1, Fecha: '01/10/2026', Medio: 'Instagram', 'Campaña': 'Demo', GESTION: 'Cierre' }];
  f.element('periodoDesde').value = '2026-10-01'; f.element('periodoHasta').value = '2026-10-07';
  await c.loadReportePeriodo();
  assert.equal(c.periodoData.total, 1); assert.equal(c.periodoLoadedKey, '2026-10-01|2026-10-07');
  c.clearSessionState();
  assert.equal(c.periodoData, null); assert.equal(c.periodoLoadedKey, ''); assert.equal(c.reporteVistaActiva, 'diario');
  assert.equal(f.element('reporteVista').value, 'diario'); assert.equal(f.element('periodoDesde').value, '');
  assert.equal(f.element('periodoHasta').value, ''); assert.equal(f.element('periodoAviso').textContent, '');
  assert.equal(f.element('reportePeriodo').classList.contains('hidden'), true);
  assert.equal(f.element('reporteDiarioVista').classList.contains('hidden'), false);
  // La sesión siguiente no hereda fechas ni datos del período de A.
  c.currentUser = user('B'); c.currentAccess = access('B'); c.currentMainTab = 'reporte'; c.reporteVistaActiva = 'periodo';
  c.isSupabaseLive = true; c.allLeads = [];
  f.element('periodoDesde').value = '2026-10-01'; f.element('periodoHasta').value = '2026-10-07';
  await c.loadReportePeriodo();
  assert.equal(c.periodoData.total, 0); assert.equal(c.periodoLoadedKey, '2026-10-01|2026-10-07');
});

test('período: selector real alterna wrappers y mes por defecto sin mover controles diarios', async () => {
  const f = frontend(), c = f.c;
  f.element('reporteFecha').value = '2026-09-29'; f.element('reporteAsesora').value = 'advisor-A';
  await c.setReporteVista('periodo');
  assert.equal(f.element('reporteDiarioVista').classList.contains('hidden'), true);
  assert.equal(f.element('reportePeriodo').classList.contains('hidden'), false);
  assert.equal(f.element('periodoDesde').value, '2026-09-01'); assert.equal(f.element('periodoHasta').value, '2026-09-30');
  await c.setReporteVista('diario');
  assert.equal(f.element('reporteDiarioVista').classList.contains('hidden'), false);
  assert.equal(f.element('reportePeriodo').classList.contains('hidden'), true);
  assert.equal(f.element('reporteFecha').value, '2026-09-29'); assert.equal(f.element('reporteAsesora').value, 'advisor-A');
});

for (const stage of ['getSession', 'is_active_user', 'user_access']) {
  for (const boundary of ['logout', 'account']) {
    for (const outcome of ['success', 'invalid', 'reject']) {
      test(`validate ${stage}: ${outcome} antiguo tras ${boundary} no restaura/borra sesión`, async () => {
        const f = frontend(), { c } = f, request = deferred();
        c.setAppAuthenticated(user('A'), access('A'));
        const queue = stage === 'getSession' ? f.sessionQueue : stage === 'is_active_user' ? f.rpcQueue : f.accessQueue;
        queue.push(request);
        const pending = c.validateCurrentSession();
        await tick();
        if (boundary === 'logout') await c.handleSignOut();
        else { f.emit('SIGNED_IN', 'B'); c.setAppAuthenticated(user('B'), access('B')); }
        const generation = c.sessionGeneration, closes = f.signOuts();
        if (outcome === 'reject') request.reject(new Error('synthetic old failure'));
        else if (stage === 'getSession') request.resolve(outcome === 'success' ? sessionResult('A') : { data: { session: null }, error: null });
        else request.resolve({ data: outcome === 'invalid' ? null : stage === 'is_active_user' ? true : access('A'), error: null });
        assert.equal(await pending, false);
        assert.equal(c.currentUser?.id ?? null, boundary === 'logout' ? null : 'B');
        assert.equal(c.sessionGeneration, generation);
        assert.equal(f.signOuts(), closes);
      });
    }
  }
}

test('rechazo de validación antigua no limpia promesa nueva ni duplica getSession', async () => {
  const f = frontend(), old = deferred(), fresh = deferred();
  f.sessionQueue.push(old);
  const first = f.c.validateCurrentSession();
  await f.c.handleSignOut();
  f.sessionQueue.push(fresh);
  const second = f.c.validateCurrentSession();
  const identity = f.c.authValidationPromise;
  assert.notEqual(identity, null);
  old.reject(new Error('synthetic old failure'));
  await first;
  assert.equal(f.c.authValidationPromise, identity);
  const duplicate = f.c.validateCurrentSession();
  assert.equal(f.c.authValidationPromise, identity);
  fresh.resolve(sessionResult('A'));
  assert.equal(await second, true);
  assert.equal(await duplicate, true);
  assert.equal(f.c.authValidationPromise, null);
});

for (const stage of ['access', 'realtime', 'leads', 'catalogs']) {
  for (const outcome of ['success', 'reject']) {
    test(`enter ${stage}: ${outcome} antiguo no continúa tras cambio de cuenta`, async () => {
      const f = frontend(), old = deferred(), fresh = deferred();
      if (stage === 'access') f.accessQueue.push(old);
      if (stage === 'realtime') f.c.setupRealtimeListener = () => old.promise;
      if (stage === 'leads') f.c.loadLeadsData = () => old.promise;
      if (stage === 'catalogs') f.c.refreshCatalogs = () => old.promise;
      const first = f.c.enterAuthenticatedSession(user('A'), stage === 'access' ? null : access('A'));
      await tick();
      f.emit('SIGNED_IN', 'B');
      f.c.setupRealtimeListener = async () => true;
      let leadLoads = 0;
      f.c.loadLeadsData = async () => { leadLoads++; };
      f.c.refreshCatalogs = () => fresh.promise;
      const second = f.c.enterAuthenticatedSession(user('B'), access('B'));
      await tick();
      const identity = f.c.sessionInitializationPromise;
      assert.equal(f.c.currentUser?.id, 'B');
      if (outcome === 'reject') old.reject(new Error('synthetic old failure'));
      else old.resolve(stage === 'access' ? { data: access('A'), error: null } : true);
      assert.equal(await first, false);
      assert.equal(f.c.currentUser?.id, 'B');
      assert.equal(f.c.sessionInitializationPromise, identity);
      assert.equal(leadLoads, 1);
      fresh.resolve();
      assert.equal(await second, true);
      assert.equal(f.c.sessionInitializationPromise, null);
    });
  }
}

test('cierre inválido demorado no cambia mensaje de la cuenta nueva', async () => {
  const f = frontend(), delay = deferred();
  f.client.auth.signOut = () => delay.promise;
  const pending = f.c.closeInvalidSession('mensaje antiguo');
  f.emit('SIGNED_IN', 'B');
  f.c.setAppAuthenticated(user('B'), access('B'));
  f.element('loginStatus').textContent = 'mensaje nuevo';
  delay.resolve();
  await pending;
  assert.equal(f.element('loginStatus').textContent, 'mensaje nuevo');
});

test('trafficker demorado no cambia pestaña tras logout', async () => {
  const f = frontend(), delay = deferred();
  f.c.refreshCatalogs = () => delay.promise;
  const pending = f.c.enterAuthenticatedSession(user('A'), access('A', 'trafficker'));
  await f.c.handleSignOut();
  delay.resolve();
  assert.equal(await pending, false);
  assert.equal(f.c.currentMainTab, 'dashboard');
});

for (const outcome of ['success', 'error', 'reject']) {
  test(`notas/gestiones ${outcome}: A → cerrar → mismo ID descarta primera solicitud`, async () => {
    const f = frontend();
    f.c.setAppAuthenticated(user('A'), access('A'));
    f.c.allLeads = [{ id: 7, Nombre: 'Sintético' }];
    f.c.openViewLeadModal(7, 'actual');
    await tick();
    const old = f.queries.splice(0);
    assert.equal(old.length, 2);
    f.c.closeViewLeadModal();
    f.c.openViewLeadModal(7, 'actual');
    await tick();
    f.queries.forEach(q => q.resolve({ data: [{ id: 2, note: 'nueva', created_at: '2026-09-30', fecha_gestion: '2026-09-30' }], error: null }));
    await tick();
    const notes = f.element('leadNotesList').innerHTML, gestiones = f.element('leadGestionesList').innerHTML;
    old.forEach(q => outcome === 'reject' ? q.reject(new Error('synthetic old failure')) : q.resolve({
      data: outcome === 'error' ? null : [{ id: 1, note: 'antigua', created_at: '2026-09-29' }],
      error: outcome === 'error' ? { message: 'synthetic old failure' } : null,
    }));
    await tick();
    assert.equal(f.c.leadNotesCache[0].id, 2);
    assert.equal(f.c.leadGestionesCache[0].id, 2);
    assert.equal(f.element('leadNotesList').innerHTML, notes);
    assert.equal(f.element('leadGestionesList').innerHTML, gestiones);
  });
}

test('switchTab conserva ocultación CRM del trafficker y pestañas del agente', () => {
  const f = frontend(), ids = ['tabBtnDashboard', 'tabBtnHistorico', 'tabBtnReporte', 'tabBtnCitas'];
  f.c.setAppAuthenticated(user('A'), access('A', 'trafficker'));
  for (const tab of ['campanas', 'dashboard', 'citas', 'reporte', 'historico', 'campanas']) {
    f.c.switchTab(tab);
    ids.forEach(id => assert.equal(f.element(id).classList.contains('hidden'), true, `${tab}: ${id}`));
  }
  f.c.setAppAuthenticated(user('A'), access('A'));
  f.c.switchTab('dashboard');
  ids.forEach(id => assert.equal(f.element(id).classList.contains('hidden'), false));
});

test('validación actual válida/inválida conserva comportamiento', async () => {
  const f = frontend();
  assert.equal(await f.c.validateCurrentSession(), true);
  assert.equal(f.c.currentUser.id, 'A');
  f.rpcQueue.push({ promise: Promise.resolve({ data: false, error: null }) });
  assert.equal(await f.c.validateCurrentSession(), false);
  assert.equal(f.c.currentUser, null);
  assert.equal(f.signOuts(), 1);
});

test('invitación conserva pendingPasswordSetup y no entra hasta definir contraseña', async () => {
  const f = frontend();
  f.c.pendingPasswordSetup = true;
  let prompts = 0;
  f.c.openSetPassword = () => { prompts++; };
  f.emit('INITIAL_SESSION', 'A');
  assert.equal(f.c.pendingPasswordSetup, true);
  assert.equal(await f.c.validateCurrentSession(), false);
  assert.equal(f.c.currentUser, null);
  assert.equal(prompts, 1);
});

test('timer de autenticación obsoleto no revalida después de logout', async () => {
  const f = frontend();
  f.emit('SIGNED_IN', 'A');
  await f.c.handleSignOut();
  let validations = 0;
  f.c.validateCurrentSession = () => { validations++; };
  f.timers.forEach(fn => fn());
  assert.equal(validations, 0);
});

test('rechazo de validación vigente sigue rechazando y libera su promesa', async () => {
  const f = frontend(), failure = deferred();
  f.sessionQueue.push(failure);
  const pending = f.c.validateCurrentSession();
  failure.reject(new Error('synthetic current failure'));
  await assert.rejects(pending, /synthetic current failure/);
  assert.equal(f.c.authValidationPromise, null);
});

for (const loader of ['loadHistoricoData', 'loadLeadsData']) {
  for (const outcome of ['success', 'error', 'reject']) {
    test(`${loader} real: finally antiguo ${outcome} conserva promesa y deduplicación de B`, async () => {
      const f = frontend({ realSessionCaches: true }), { c } = f;
      c.setAppAuthenticated(user('A'), access('A'));
      const first = c[loader]();
      const old = await f.waitForQuery(0);
      assert.equal(f.queries.length, 1);
      assert.equal(old.table, 'leads_historico');
      c.clearSessionState();
      c.setAppAuthenticated(user('B'), access('B'));
      const second = c[loader]();
      const fresh = await f.waitForQuery(1);
      assert.equal(f.queries.length, 2);
      const field = loader === 'loadHistoricoData' ? 'historicoLoadPromise' : 'loadLeadsPromise';
      const identity = c[field], historyIdentity = c.historicoLoadPromise;
      if (outcome === 'reject') old.reject(new Error('synthetic old failure'));
      else old.resolve({ data: outcome === 'error' ? null : [{ id: 1 }],
        error: outcome === 'error' ? { message: 'synthetic old failure' } : null });
      assert.equal(await first, false);
      assert.equal(c[field], identity);
      assert.equal(c.historicoLoadPromise, historyIdentity);
      const duplicate = c[loader]();
      assert.equal(duplicate, second);
      await tick();
      assert.equal(f.queries.length, 2);
      fresh.resolve({ data: [], error: null });
      assert.equal(await second, true);
      assert.equal(await duplicate, true);
      assert.equal(c[field], null);
      assert.equal(c.historicoLoadPromise, null);
      assert.equal(c.currentUser.id, 'B');
      assert.equal(c.allHistorico.length, 0);
    });
  }
}

for (const pausedStage of ['initialCount', 'loadedLeads', 'reconciledIds', 'finalCount']) {
  test(`loadLeadsData real: A pendiente en ${pausedStage} no borra UPDATE ni reintenta sobre B`, async () => {
    const f = frontend({ realSessionCaches: true, controlledLeadIO: true }), { c } = f;
    let queryIndex = 0;
    const nextQuery = async (userId, { head = false, columns = '*', cursor = false, table = 'leads' } = {}) => {
      const request = await f.waitForQuery(queryIndex++);
      assert.equal(request.userId, userId);
      assert.equal(request.table, table);
      assert.equal(request.head, head);
      assert.equal(request.columns, columns);
      assert.equal(request.cursor, cursor);
      return request;
    };
    const count = async userId => nextQuery(userId, { head: true });
    const rows = async (userId, data, columns = '*') => {
      (await nextQuery(userId, { columns })).resolve({ data, error: null });
      (await nextQuery(userId, { columns, cursor: true })).resolve({ data: [], error: null });
    };
    const stale = { id: 7, Nombre: 'STALE' }, updated = { id: 7, Nombre: 'UPDATED' };
    c.setAppAuthenticated(user('A'), access('A'));
    const first = c.loadLeadsData();
    let old = await count('A');
    if (pausedStage !== 'initialCount') {
      old.resolve({ count: 1, error: null });
      if (pausedStage === 'loadedLeads') old = await nextQuery('A');
      else {
        await rows('A', [stale]);
        if (pausedStage === 'reconciledIds') old = await nextQuery('A', { columns: 'id' });
        else {
          await rows('A', [{ id: 7 }], 'id');
          old = await count('A');
        }
      }
    }

    c.clearSessionState();
    c.setAppAuthenticated(user('B'), access('B'));
    const second = c.loadLeadsData(), identity = c.loadLeadsPromise;
    (await count('B')).resolve({ count: 1, error: null });
    await rows('B', [stale]);
    await rows('B', [{ id: 7 }], 'id');
    const freshCount = await count('B');
    const event = { eventType: 'UPDATE', new: updated };
    c.handleRealtimeEvent(event);
    const eventQueue = c.pendingRealtimeEvents, requests = f.queries.length;
    assert.equal(eventQueue.length, 1);
    assert.equal(eventQueue[0], event);
    old.resolve(old.head ? { count: pausedStage === 'finalCount' ? 2 : 1, error: null }
      : { data: [], error: null });
    await tick();
    assert.equal(f.queries.length, requests, 'A no inicia consultas ni reintentos con la sesión B');
    assert.equal(c.pendingRealtimeEvents, eventQueue, 'A no sustituye la cola de B');
    assert.equal(c.pendingRealtimeEvents[0], event, 'B conserva el UPDATE pendiente');
    assert.equal(await first, false);
    assert.equal(c.loadLeadsPromise, identity);
    assert.equal(c.isLoadingLeads, true);
    assert.equal(c.loadLeadsData(), second);

    // Solo B puede vaciar su cola al reintentar y leer la fila ya actualizada.
    freshCount.resolve({ count: 1, error: null });
    (await count('B')).resolve({ count: 1, error: null });
    await rows('B', [updated]);
    await rows('B', [{ id: 7 }], 'id');
    (await count('B')).resolve({ count: 1, error: null });
    (await nextQuery('B', { table: 'leads_historico' })).resolve({ data: [], error: null });
    assert.equal(await second, true);
    assert.equal(c.allLeads.length, 1);
    assert.equal(c.allLeads[0].Nombre, 'UPDATED');
    assert.equal(c.currentUser.id, 'B');
    assert.equal(c.totalDatabaseCount, 1);
    assert.equal(c.loadLeadsPromise, null);
    assert.equal(c.pendingRealtimeEvents.length, 0);
    assert.equal(f.queries.length, queryIndex);
  });
}

for (const loader of ['loadCatalogs', 'refreshCatalogs']) {
  for (const boundary of ['logout', 'account', 'user', 'access']) {
    for (const outcome of ['success', 'error', 'reject']) {
      test(`${loader} real: ${outcome} antiguo tras ${boundary} no muta catálogos ni repinta`, async () => {
        const f = frontend({ realSessionCaches: true }), { c } = f;
        c.setAppAuthenticated(user('A'), access('A'));
        const first = c[loader]();
        await tick();
        assert.equal(f.queries.length, 1);
        const old = f.queries[0];
        assert.equal(old.table, 'lead_catalogs');
        if (boundary === 'logout') await c.handleSignOut();
        if (boundary === 'account') { c.clearSessionState(); c.setAppAuthenticated(user('B'), access('B')); }
        if (boundary === 'user') c.setAppAuthenticated(user('B'), access('B'));
        if (boundary === 'access') c.currentAccess = { ...access('A'), updated_at: 'new-access' };
        if (boundary !== 'logout') {
          const second = c.refreshCatalogs();
          await tick();
          f.queries[1].resolve({ data: [{ id: 2, kind: 'campana', value: 'nueva', active: true }], error: null });
          await second;
          assert.equal(c.catalogRows.campana[0].value, 'nueva');
          assert.equal(f.renders.length, 3);
        }
        const identity = c.catalogRows, snapshot = JSON.stringify(identity), renders = f.renders.length;
        const dom = f.element('populateCatalogSelects').textContent;
        if (outcome === 'reject') old.reject(new Error('synthetic old failure'));
        else old.resolve({ data: outcome === 'error' ? null : [{ id: 1, kind: 'campana', value: 'antigua', active: true }],
          error: outcome === 'error' ? { message: 'synthetic old failure' } : null });
        await first;
        assert.equal(c.catalogRows, identity);
        assert.equal(JSON.stringify(c.catalogRows), snapshot);
        assert.equal(f.renders.length, renders);
        assert.equal(f.element('populateCatalogSelects').textContent, dom);
      });
    }
  }
}

for (const loader of ['loadCatalogs', 'refreshCatalogs']) {
  for (const outcome of ['success', 'error', 'reject']) {
    test(`${loader} real vigente: conserva éxito, fallback de error y rechazo`, async () => {
      const f = frontend({ realSessionCaches: true }), { c } = f;
      c.setAppAuthenticated(user('A'), access('A'));
      const pending = c[loader]();
      await tick();
      const request = f.queries[0];
      if (outcome === 'reject') {
        request.reject(new Error('synthetic current failure'));
        await assert.rejects(pending, /synthetic current failure/);
        assert.equal(f.renders.length, 0);
      } else {
        request.resolve({ data: outcome === 'error' ? null : [{ id: 1, kind: 'campana', value: 'actual', active: true }],
          error: outcome === 'error' ? { message: 'synthetic current failure' } : null });
        const result = await pending;
        if (loader === 'loadCatalogs') assert.equal(result, outcome === 'success');
        assert.equal(c.catalogRows.campana.length, outcome === 'success' ? 1 : 0);
        assert.equal(f.renders.length, loader === 'refreshCatalogs' ? 3 : 0);
      }
    });
  }
}

// Ejecuta funciones reales del HTML y handlers Edge con datos sintéticos, sin red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const baseline = process.argv.includes('--baseline');
const source = path => baseline ? execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }) : readFileSync(path, 'utf8');
const html = source('index.html');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('async function loadCitas'));
// El parser nativo de Node confirma el cierre de cada función; no copia su lógica.
function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  if (!match) return '';
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}
const constants = ['MONTH_CHRONO', 'GESTION_STATE_GROUPS'].map(name => {
  const start = script.indexOf(`const ${name} =`);
  return script.slice(start, script.indexOf(';', start) + 1);
});
const names = [
  'getField', 'compareLeadIdsDescending', 'consolidateLeadsById', 'withOrigin', 'getLeadOrigin', 'getVisibleBaseLeads',
  'fetchRowsByIdCursor', 'fetchPagedResult', 'fetchRowsByIds', 'fetchLeadsByIdCursor', 'fetchHistoricoByIdCursor',
  'loadCitas', 'clearCitasResults', 'validAppointmentId', 'appointmentSessionValid', 'loadLeadAppointments',
  'loadLeadNotes', 'loadLeadGestiones', 'applyFilters', 'resetAllFilters', 'populateFilterOptions', 'populateSelect', 'setDataSource',
  'activeCatalogValues', 'catalogOptions', 'parseFechaLead', 'normalizeLeadMonth', 'leadReportDate', 'isInscritoDataDura',
  'histMonthKey', 'histMonthLabel', 'sortHistMonthKeys', 'normalizeGestion', 'groupGestionEstado', 'readHistRange',
  'filterHistoricalLeads', 'populateHistoricalFilterOptions', 'computeHistoricalAggregates', 'escapeHtml', 'escapeAttr',
  'loadReporteDiario', 'csvReporteField', 'downloadCSV', 'exportCurrentLeadsCSV', 'exportHistoricalSummaryCSV',
  'exportReporteDiarioCSV', 'exportCampanasCSV', 'campaignCosteResultado', 'campaignTotals', 'loadCampanas',
  'loadAuthorizedUsers', 'renderAuthorizedUsers', 'fillSelectFromCatalog', 'populateCatalogSelects',
  'openNewLeadModal', 'handleCreateLead', 'handleUpdateLead', 'openEditLeadModal'
];
const frontendSource = [...constants, ...names.map(extractFunction)].join('\n');

function frontend(extra = {}) {
  const elements = new Map(), downloads = [], timers = [], toasts = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', _innerHTML: '', textContent: '', innerText: '', options: [{ value: '' }],
      get innerHTML() { return this._innerHTML; },
      set innerHTML(value) { this._innerHTML = value; this.options = []; this.value = ''; },
       classList: { add() {}, remove() {}, toggle() {} },
      appendChild(option) { this.options.push(option); if (option.selected || this.options.length === 1) this.value = option.value; },
      replaceChildren() { this.innerHTML = ''; },
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    console: { warn() {}, error() {}, log() {} }, Blob,
    URL: { createObjectURL(blob) { downloads.push({ blob }); return 'blob:synthetic'; }, revokeObjectURL(url) { downloads.at(-1).revoked = url; } },
    document: {
      getElementById: element,
      createElement: tag => {
        if (tag === 'option') return {};
        const download = downloads.at(-1) || {};
        return { setAttribute(key, value) { if (!downloads.includes(download)) downloads.push(download); download[key] = value; }, click() { download.clicked = true; } };
      },
      body: { appendChild() {}, removeChild() {} },
    },
    window: {}, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    showToast: (...args) => toasts.push(args), catalogLabel: x => x,
    fillCitasSelect() {}, renderCitas() {}, renderLeadNotes() {}, renderLeadGestiones() {}, renderLeadAppointments() {},
    updateKpis() {}, renderMatrix() {}, renderTable() {}, renderHistoricalAnalytics() {},
    renderReporteBloque: () => '', renderReporteTotal: () => '',
    renderCampanas() {}, canEditCampaigns: () => false,
    isAgendadoGestion: value => value.startsWith('AGENDAD'),
    miamiToday: () => '2026-09-30', miamiDayBounds: date => [date + 'T04:00:00.000Z', date + 'T16:00:00.000Z'],
    supabaseClient: null, currentUser: { id: 'user-test' }, currentAccess: { activo: true, nombre: 'Test', updated_at: 'v1' },
    sessionGeneration: 1, currentMainTab: 'citas', isAdmin: false, isSupervisor: false,
    citasRequestGeneration: 0, citasCache: [], citasRangeKey: '', leadAppointmentsCache: [], leadNotesCache: [], leadGestionesCache: [],
    viewLeadGeneration: 1, currentViewId: 1, dashRangeGen: 0, filterDebounceTimer: null,
    reporteRequestGeneration: 0, reporteDayAdvisors: [], reporteDayData: [], campanasData: [],
    campanasRequestGeneration: 0, campanasLoading: false, campanasContextMonth: '', campaignStatsMap: new Map(),
    allLeads: [], allHistorico: [], filteredLeads: [], dataSource: 'actual', currentPage: 1, authorizedUsersList: [],
    catalogRows: { agente: [], campana: [], medio: [], gestion: [], mes: [] },
    ...extra,
  });
  vm.runInContext(frontendSource, context);
  return { context, element, downloads, timers, toasts };
}

// Mock de PostgREST: aplica filtros/proyección y un max_rows configurable.
function database(tables, { fail, hook, maxRows = 1000 } = {}) {
  const calls = [], rpcCalls = [];
  return {
    calls, rpcCalls,
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: (tables[name] || []).map(r => ({ ...r })), error: null }; },
    from(table) {
      const query = { table, filters: [], orders: [], columns: '*', range: null };
      const builder = {
        select(columns) { query.columns = columns; return this; },
        eq(key, value) { query.filters.push(r => r[key] === value); return this; },
        is(key, value) { query.filters.push(r => (r[key] ?? null) === value); return this; },
        in(key, values) { assert.ok(values.length <= 200, '.in() debe tener lotes acotados'); query.filters.push(r => values.includes(r[key])); return this; },
        lt(key, value) { query.filters.push(r => r[key] < value); return this; },
        gte(key, value) { query.filters.push(r => r[key] >= value); return this; },
        lte(key, value) { query.filters.push(r => r[key] <= value); return this; },
        order(key, options = {}) { query.orders.push([key, options.ascending !== false]); return this; },
        range(from, to) { query.range = [from, to]; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(async () => {
            calls.push(query);
            if (hook) await hook(query, calls.length);
            const failure = fail?.(query, calls.length);
            if (failure) return { data: null, error: typeof failure === 'object' ? failure : { message: 'synthetic failure' } };
            let rows = (tables[table] || []).filter(r => query.filters.every(f => f(r)));
            rows.sort((a, b) => {
              for (const [key, ascending] of query.orders) {
                if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
            const [from, to] = query.range || [0, 999];
            rows = rows.slice(from, Math.min(to + 1, from + maxRows));
            if (query.columns !== '*') rows = rows.map(r => Object.fromEntries(query.columns.split(',').map(c => c.trim()).map(c => [c, r[c]])));
            return { data: rows.map(r => ({ ...r })), error: null };
          }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const rows = (count, data = {}) => Array.from({ length: count }, (_, i) => ({ id: i + 1, ...data }));
const plain = value => JSON.parse(JSON.stringify(value));

test('cursor existente reutilizado: >2000 filas, sin duplicados y orden estable', async () => {
  const db = database({ leads: rows(2005), leads_historico: rows(1205) });
  const { context: c } = frontend({ supabaseClient: db });
  const leads = await c.fetchLeadsByIdCursor();
  assert.equal(leads.length, 2005);
  assert.equal(new Set(leads.map(r => r.id)).size, 2005);
  assert.equal(leads[0].id, 2005);
  assert.equal(leads.at(-1).id, 1);
  const history = await c.fetchHistoricoByIdCursor();
  assert.equal(history.length, 1205);
  assert.equal(c.getLeadOrigin(history[0]), 'historico');
  assert.ok(db.calls.every(q => q.range?.[0] === 0 && q.orders[0][0] === 'id'));
});

test('cursor: error segunda página no devuelve un resultado parcial', async () => {
  const db = database({ leads: rows(1205) }, { fail: (_, n) => n === 2 });
  const { context: c } = frontend({ supabaseClient: db });
  await assert.rejects(c.fetchLeadsByIdCursor(), /synthetic failure/);
  const result = await c.fetchPagedResult(() => ({ order() { return this; }, range() { return Promise.resolve({ data: null, error: { message: 'bad' } }); } }));
  assert.equal(result.data, null);
  assert.match(result.error.message, /bad/);
});

test('cursor real: max_rows=100 recupera 1205 filas hasta página vacía', async () => {
  const db = database({ leads: rows(1205) }, { maxRows: 100 });
  const { context: c } = frontend({ supabaseClient: db });
  const result = await c.fetchRowsByIdCursor(() => db.from('leads').select('id'));
  assert.equal(result.length, 1205);
  assert.equal(new Set(result.map(r => r.id)).size, 1205);
  assert.deepEqual(plain(result.map(r => r.id)), rows(1205).map(r => r.id).reverse());
  assert.equal(db.calls.length, 14, '13 páginas con datos más página vacía');
});

test('cursor real: página corta sin avance no devuelve parcial ni entra en bucle', async () => {
  const { context: c } = frontend();
  let calls = 0;
  const factory = () => ({ lt() { return this; }, order() { return this; }, range() { calls++; return Promise.resolve({ data: [{ id: 1 }] }); } });
  await assert.rejects(c.fetchRowsByIdCursor(factory), /avanzar/);
  assert.equal(calls, 2);
});

test('cursor real: cambio de sesión detiene consultas entre páginas cortas', async () => {
  const f = frontend(), c = f.context;
  const db = database({ leads: rows(1205) }, { maxRows: 100, hook: (_, n) => { if (n === 2) c.sessionGeneration++; } });
  c.supabaseClient = db;
  const result = await c.fetchPagedResult(() => db.from('leads').select('id'));
  assert.equal(result.data, null);
  assert.match(result.error.message, /sesión/);
  assert.equal(db.calls.length, 2);
});

test('buscador real: callback oninput filtra cache >1000 por correo, nombre y rol sin red', async () => {
  const users = rows(1205, { email: 'other@example.test', nombre: 'Other', role: 'agente', activo: true }).map(r => ({ ...r, user_id: `user-${r.id}` }));
  users[1204] = { ...users[1204], email: 'Target@Example.Test', nombre: '<img src=x onerror=alert(1)>', role: 'supervisor' };
  const db = database({ admin_manage_user_access: users });
  const f = frontend({ supabaseClient: db, isAdmin: true }), c = f.context;
  await c.loadAuthorizedUsers();
  const handler = /<input\b[^>]*id="userSearch"[^>]*oninput="([^"]+)"/.exec(html)?.[1];
  assert.ok(handler, 'el input real debe tener callback');
  for (const search of [' target@example.TEST ', '<img', 'SUPERVISOR']) {
    f.element('userSearch').value = search;
    vm.runInContext(handler, c);
    assert.match(f.element('authorizedUsers').innerHTML, /Target@Example.Test/);
    assert.doesNotMatch(f.element('authorizedUsers').innerHTML, /other@example.test|<img/);
    assert.match(f.element('authorizedUsers').innerHTML, /&lt;img/);
    assert.match(f.element('userSearchCount').textContent, /1.*1205/);
  }
  f.element('userSearch').value = 'no-such-user'; vm.runInContext(handler, c);
  assert.match(f.element('authorizedUsers').innerHTML, /No hay coincidencias/);
  f.element('userSearch').value = ''; vm.runInContext(handler, c);
  assert.equal((f.element('authorizedUsers').innerHTML.match(/Cambiar correo/g) || []).length, 1205);
  assert.equal(c.authorizedUsersList.length, 1205, 'filtrar no muta la cache');
  assert.equal(db.rpcCalls.length, 1); assert.equal(db.calls.length, 0);
});

test('usuarios: carga aplica búsqueda vigente y respuesta de sesión antigua no reemplaza cache', async () => {
  const f = frontend({ isAdmin: true }), c = f.context;
  f.element('userSearch').value = 'target';
  c.supabaseClient = database({ admin_manage_user_access: [{ user_id: '1', email: 'other@example.test' }, { user_id: '2', email: 'target@example.test' }] });
  await c.loadAuthorizedUsers();
  assert.match(f.element('authorizedUsers').innerHTML, /target@example.test/);
  assert.doesNotMatch(f.element('authorizedUsers').innerHTML, /other@example.test/);
  c.supabaseClient = { rpc: async () => { c.sessionGeneration++; c.authorizedUsersList = [{ user_id: 'new', email: 'new@example.test' }]; f.element('authorizedUsers').innerHTML = 'new session'; return { data: [{ user_id: 'old', email: 'old@example.test' }], error: null }; } };
  await c.loadAuthorizedUsers();
  assert.equal(c.authorizedUsersList[0].user_id, 'new');
  assert.equal(f.element('authorizedUsers').innerHTML, 'new session');
});

test('cursor: bloque inválido y cursor sin avance fallan explícitamente', async () => {
  const { context: c } = frontend();
  const factory = data => () => ({ lt() { return this; }, order() { return this; }, range() { return Promise.resolve({ data }); } });
  await assert.rejects(c.fetchRowsByIdCursor(factory(null)), /inválido/);
  await assert.rejects(c.fetchRowsByIdCursor(factory([{ missing: true }])), /avanzar/);
  await assert.rejects(c.fetchRowsByIdCursor(factory(rows(1000))), /avanzar/);
});

test('Citas: >1000 citas y leads asociados, desempate por id, archivados y ausentes', async () => {
  const leads = rows(1205, { Mes: 'MARZO', Nombre: 'Test' });
  leads[0].archived_at = '2026-03-01';
  const appointments = rows(1206, { scheduled_at: '2026-03-05T12:00:00.000Z', status: 'CANCELADA' }).map(r => ({ ...r, lead_id: r.id }));
  const db = database({ leads, lead_appointments: appointments });
  const { context: c, element } = frontend({ supabaseClient: db });
  element('citasDesde').value = '2026-03-01'; element('citasHasta').value = '2026-03-31';
  await c.loadCitas();
  assert.equal(c.citasCache.length, 1204);
  assert.equal(c.citasCache[0].id, 1205);
  assert.equal(c.citasCache.at(-1).id, 2);
  assert.match(element('citasAviso').textContent, /1 cita\(s\) sin lead asociado/);
  assert.match(element('citasAviso').textContent, /archivado/);
  assert.ok(db.calls.filter(q => q.table === 'leads').length > 1);
});

for (const failJoin of [false, true]) test(`Citas: error ${failJoin ? 'al asociar leads' : 'segunda página'} muestra aviso sin parcial`, async () => {
  const appointments = rows(1205, { lead_id: 1, scheduled_at: '2026-03-05T12:00:00.000Z' });
  const db = database({ leads: [{ id: 1 }], lead_appointments: appointments }, { fail: (q, n) => failJoin ? q.table === 'leads' : n === 2 });
  const { context: c, element } = frontend({ supabaseClient: db });
  element('citasDesde').value = '2026-03-01'; element('citasHasta').value = '2026-03-31';
  await c.loadCitas();
  assert.equal(c.citasCache.length, 0);
  assert.match(element('citasAviso').textContent, /No se pud/);
});

test('Citas: cambio de sesión durante una página no sobrescribe cache nueva', async () => {
  const f = frontend(); const c = f.context;
  c.supabaseClient = database({ lead_appointments: rows(1205, { scheduled_at: '2026-03-05T12:00:00.000Z' }) }, { hook: (_, n) => { if (n === 2) { c.sessionGeneration++; c.citasCache = [{ id: 'new-session' }]; } } });
  f.element('citasDesde').value = '2026-03-01'; f.element('citasHasta').value = '2026-03-31';
  await c.loadCitas();
  assert.equal(c.citasCache[0].id, 'new-session');
});

for (const [fn, table, cache] of [
  ['loadLeadNotes', 'lead_notes', 'leadNotesCache'],
  ['loadLeadGestiones', 'lead_gestiones', 'leadGestionesCache'],
  ['loadLeadAppointments', 'lead_appointments', 'leadAppointmentsCache'],
]) {
  test(`${fn}: timeline >1000 y desempate estable`, async () => {
    const db = database({ [table]: rows(1205, { lead_id: 1, created_at: '2026-03-05', fecha_gestion: '2026-03-05', scheduled_at: '2026-03-05' }) });
    const { context: c } = frontend({ supabaseClient: db });
    await c[fn](1, { GESTION: 'AGENDADO' });
    assert.equal(c[cache].length, 1205);
    assert.equal(c[cache][0].id, fn === 'loadLeadGestiones' ? 1 : 1205);
    assert.equal(new Set(c[cache].map(r => r.id)).size, 1205);
  });
  test(`${fn}: error y sesión obsoleta no reemplazan datos nuevos`, async () => {
    const f = frontend(), c = f.context;
    c.supabaseClient = database({ [table]: rows(1205, { lead_id: 1 }) }, {
      hook: (_, n) => { if (n === 2) { c.sessionGeneration++; c[cache] = [{ id: 'new' }]; } },
      fail: (_, n) => n === 2,
    });
    await c[fn](1, { GESTION: 'AGENDADO' });
    assert.equal(c[cache][0].id, 'new');
  });
}

test('rango gestiones >1000, origen histórico con id coincidente no se mezcla', async () => {
  const db = database({ lead_gestiones: rows(1205, { fecha_gestion: '2026-03-05' }).map(r => ({ ...r, lead_id: r.id })) });
  const { context: c, element } = frontend({ supabaseClient: db, allLeads: rows(1205), allHistorico: [{ id: 1, __origin: 'historico' }], dataSource: 'todos' });
  element('dashDesde').value = '2026-03-01'; element('dashHasta').value = '2026-03-31';
  await c.applyFilters();
  assert.equal(c.filteredLeads.length, 1205);
  assert.match(element('dashRangeError').innerText, /solo incluye leads actuales/);
});

test('filtro asesora combina con mes, cuenta y se limpia', async () => {
  const f = frontend({ allLeads: [
    { id: 1, Mes: 'MARZO', AGENTE: 'Ana' },
    { id: 2, Mes: 'MARZO', AGENTE: 'Bia' },
    { id: 3, Mes: 'ABRIL', AGENTE: 'Ana' },
  ] });
  f.element('filterAsesora').value = 'Ana'; f.element('filterMes').value = 'MARZO';
  await f.context.applyFilters();
  assert.deepEqual(f.context.filteredLeads.map(l => l.id), [1]);
  assert.match(f.element('activeFiltersCount').innerText, /2 filtros/);
  f.context.resetAllFilters();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.element('filterAsesora').value, '');
  assert.equal(f.context.filteredLeads.length, 3);
});

test('modal de edición usa siempre la fecha Miami de hoy', () => {
  const f = frontend({ allLeads: [{ id: 1, Nombre: 'Lead', 'Fecha Última Gestión ': '01/01/2020' }], editLeadRequestGeneration: 0, editLeadAdvisorGeneration: 0, editAdvisorsLoading: false, editLeadSubmitting: false, editLeadPreviousGestion: '', currentEditOrigin: '' });
  const c = f.context;
  c.findLeadByOrigin = () => c.allLeads[0]; c.hideEditAppointmentFields = () => {};
  c.applyEditAppointmentVisibility = () => {}; c.editLeadNeedsAppointment = () => false;
  f.element('editGestion').options = [{ value: '' }];
  c.openEditLeadModal(1, 'actual');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const today = `${parts.find(p => p.type === 'day').value}/${parts.find(p => p.type === 'month').value}/${parts.find(p => p.type === 'year').value}`;
  assert.equal(f.element('editFechaUltima').value, today);
});

test('filtros y campos automáticos conservan el orden y readonly en HTML', () => {
  const source = html;
  const sourceIndex = source.indexOf('id="dataSourceFilter"');
  const dateIndex = source.indexOf('id="dashDesde"');
  const advisorIndex = source.indexOf('id="filterAsesora"');
  assert.ok(sourceIndex < dateIndex && dateIndex < advisorIndex);
  assert.match(source.slice(sourceIndex - 500, sourceIndex), /grid/);
  assert.match(source, /id="editFechaUltima"[^>]*readonly[^>]*opacity-70/);
  assert.match(source, /id="editUltimoAgente"[^>]*readonly[^>]*opacity-70/);
});

test('rango incompleto no finge filtrar ni consulta, error y sesión obsoleta no pintan parcial', async () => {
  const f = frontend({ allLeads: [{ id: 1 }], filteredLeads: [{ id: 'previous' }] }), c = f.context;
  c.supabaseClient = database({});
  f.element('dashDesde').value = '2026-03-01';
  await c.applyFilters();
  assert.equal(c.filteredLeads[0].id, 'previous');
  assert.equal(c.supabaseClient.calls.length, 0);
  assert.match(f.element('dashRangeError').innerText, /no se ha aplicado/);
  f.element('dashHasta').value = '2026-03-31';
  c.supabaseClient = database({}, { fail: () => true });
  await c.applyFilters();
  assert.equal(c.filteredLeads[0].id, 'previous');
  assert.match(f.element('dashRangeError').innerText, /Error al consultar/);
  c.supabaseClient = database({}, { hook: () => { c.sessionGeneration++; c.filteredLeads = [{ id: 'new' }]; }, fail: () => true });
  await c.applyFilters();
  assert.equal(c.filteredLeads[0].id, 'new');
});

test('opciones por origen actual/histórico/todos y OTRO seleccionable', async () => {
  const { context: c, element } = frontend({
    allLeads: [{ id: 1, Mes: 'MARZO', Campaña: 'Actual' }],
    allHistorico: [{ id: 1, Mes: 'OTRO', Campaña: 'Anterior' }],
  });
  c.setDataSource('historico');
  assert.equal(element('filterCampana').options.at(-1).value, 'Anterior');
  assert.equal(element('filterMes').options.at(-1).value, 'OTRO');
  c.setDataSource('actual');
  assert.equal(element('filterCampana').options.at(-1).value, 'Actual');
  c.setDataSource('todos');
  assert.ok(element('filterCampana').options.some(o => o.value === 'Anterior'));
  assert.ok(element('filterCampana').options.some(o => o.value === 'Actual'));
  c.dataSource = 'historico'; element('histFilterMes').value = 'OTRO';
  assert.equal(c.filterHistoricalLeads().data.length, 1);
  c.populateHistoricalFilterOptions();
  assert.match(element('histFilterMes').innerHTML, /value="OTRO"/);
});

test('fechas completas, bisiesto, fechas incompletas/invalidas y mes OTRO honestos', () => {
  const { context: c } = frontend();
  for (const date of ['29/02/2024', '29-02-24', '2024-02-29']) assert.equal(c.parseFechaLead({ Fecha: date }), Date.UTC(2024, 1, 29));
  for (const date of ['', '12/03', '31/02/2026', '2026-13-01', '1/2/', '1/2/2026junk', '2026-02-03-extra']) assert.equal(c.parseFechaLead({ Fecha: date }), null, date);
  assert.equal(c.normalizeLeadMonth({ Fecha: '12/03' }), 'OTRO');
  assert.equal(c.normalizeLeadMonth({ Fecha: '2026-03-12' }), 'MARZO');
  const agg = c.computeHistoricalAggregates([{ Fecha: '1/3/2025' }, { Fecha: '1/3/2026' }, { Fecha: '12/03', Mes: 'MARZO' }, { Mes: 'OTRO' }]);
  assert.deepEqual(plain(agg.activeMonths), ['2025-03', '2026-03', 'SIN-FECHA·MARZO', 'OTRO']);
  assert.equal(c.histMonthLabel('SIN-FECHA·MARZO'), 'MARZO (sin fecha)');
});

test('Data Dura usa mes y año del reporte, no hoy; sin año no lo inventa', () => {
  const { context: c } = frontend();
  assert.equal(c.isInscritoDataDura({ Mes: 'MARZO', Fecha: '1/3/2026' }, '2026-03-05'), false);
  assert.equal(c.isInscritoDataDura({ Mes: 'MARZO', Fecha: '1/3/2025' }, '2026-03-05'), true);
  assert.equal(c.isInscritoDataDura({ Mes: 'FEBRERO', Fecha: '1/2/2026' }, '2026-03-05'), true);
  assert.equal(c.isInscritoDataDura({ Mes: 'MARZO', Fecha: '1/3' }, '2026-03-05'), false);
  assert.equal(c.isInscritoDataDura({ Mes: 'OTRO' }, '2026-03-05'), false);
  assert.equal(c.isInscritoDataDura({ Mes: 'MARZO' }, 'not-a-date'), false);
});

test('atribución mensual real: Mes canónico prevalece; Fecha aporta año y respaldo', () => {
  const leads = [
    { Mes: 'FEBRERO', Fecha: '1/3/2026', GESTION: 'INSCRITO' },
    { Mes: ' febrero ', Fecha: '1/3/2025' },
    { Mes: 'desconocido', Fecha: '1/3/2026' },
    { Mes: 'FEBRERO', Fecha: '31/2/2026' },
    { Mes: 'desconocido', Fecha: 'invalida' },
  ];
  const { context: c, element } = frontend({ allLeads: leads });
  assert.deepEqual(leads.map(l => c.normalizeLeadMonth(l)), ['FEBRERO', 'FEBRERO', 'MARZO', 'FEBRERO', 'OTRO']);
  assert.deepEqual(leads.map(l => c.histMonthKey(l)), ['2026-02', '2025-02', '2026-03', 'SIN-FECHA·FEBRERO', 'OTRO']);
  element('histFilterMes').value = 'FEBRERO'; element('histFilterAnio').value = '2026';
  const filtered = c.filterHistoricalLeads().data;
  assert.equal(filtered.length, 1);
  const agg = c.computeHistoricalAggregates(filtered);
  assert.deepEqual(plain(agg.activeMonths), ['2026-02']);
  assert.equal(agg.monthlyStats['2026-02'].total, 1);
  assert.equal(c.histMonthLabel(agg.activeMonths[0]), 'FEBRERO 2026');
  element('histFilterAnio').value = '';
  assert.deepEqual(plain(c.computeHistoricalAggregates(c.filterHistoricalLeads().data).activeMonths), ['2025-02', '2026-02', 'SIN-FECHA·FEBRERO']);
});

test('histórico real mantiene Inscritos/Agendados y nueve columnas, sin indicador Data Dura nuevo', () => {
  const leads = [
    { Mes: 'FEBRERO', Fecha: '1/3/2026', GESTION: 'INSCRITO' },
    { Mes: 'FEBRERO', Fecha: '1/2/2026', GESTION: 'AGENDADO CANCELADO' },
    { Mes: 'FEBRERO', Fecha: '1/2/2025', GESTION: 'INSCRITA' },
  ];
  const f = frontend({ allLeads: leads }), c = f.context;
  const agg = c.computeHistoricalAggregates(c.filterHistoricalLeads().data);
  assert.deepEqual(plain(agg.activeMonths), ['2025-02', '2026-02']);
  assert.equal(agg.monthlyStats['2026-02'].inscritos, 1);
  assert.equal(agg.monthlyStats['2026-02'].agendados, 1, 'no redefine el estado AGENDAD*');
  assert.equal(agg.monthlyStats['2025-02'].inscritos, 1);
  for (const stats of Object.values(agg.monthlyStats)) assert.equal(Object.hasOwn(stats, 'inscritosDura'), false);
  const table = /<table\b[^>]*>(?:(?!<\/table>)[\s\S])*id="histMonthlyTableBody"[\s\S]*?<\/table>/.exec(html)?.[0];
  assert.ok(table);
  assert.equal((table.match(/<th\b/g) || []).length, 9);
  assert.doesNotMatch(table, /Inscritos Data Dura/);
  // Ejecuta el renderer real de tabla/KPI; los canvas no forman parte de esta regresión.
  const getElementById = c.document.getElementById;
  c.document.getElementById = id => id.startsWith('chart') ? null : getElementById(id);
  c.document.documentElement = { dataset: { theme: 'dark' } };
  c.Chart = { defaults: { font: {} } }; c.window.Chart = c.Chart;
  vm.runInContext([extractFunction('updateHistRangeNotice'), extractFunction('renderHistoricalAnalytics')].join('\n'), c);
  c.renderHistoricalAnalytics();
  assert.equal(f.element('histKpiInscritos').textContent, '2');
  assert.equal(f.element('histKpiAgendados').textContent, '1');
  const renderedRows = f.element('histMonthlyTableBody').innerHTML.match(/<tr\b[\s\S]*?<\/tr>/g);
  assert.equal(renderedRows.length, 2);
  for (const row of renderedRows) assert.equal((row.match(/<td\b/g) || []).length, 9);
  c.allLeads = []; c.renderHistoricalAnalytics();
  assert.match(f.element('histMonthlyTableBody').innerHTML, /colspan="9"/);
});

test('select de catálogo unifica SEPTIEMBRE con su forma canónica (regresión duplicado)', () => {
  const f = frontend(), c = f.context;
  const sel = f.element('newMes');
  // Simula las opciones estáticas en MAYÚSCULAS: valor actual es una de ellas.
  sel.appendChild({ value: 'AGOSTO' }); sel.appendChild({ value: 'SEPTIEMBRE', selected: true });
  assert.equal(sel.value, 'SEPTIEMBRE');
  vm.runInContext(extractFunction('fillSelectFromCatalog'), c);
  c.fillSelectFromCatalog('newMes', ['Agosto', 'Septiembre']);
  const values = plain(f.element('newMes').options.map(o => o.value));
  assert.deepEqual(values, ['Agosto', 'Septiembre'], 'un solo Septiembre y en forma canónica');
  assert.equal(f.element('newMes').value, 'Septiembre', 'la selección migró a la forma del catálogo');
  // Valor genuinamente desconocido: se conserva como opción adicional seleccionada.
  sel.appendChild({ value: 'SEPTIEMBRE' }); // tras innerHTML reset queda vacío
  f.element('newMes').innerHTML = '';
  f.element('newMes').appendChild({ value: 'TEMPORADA', selected: true });
  c.fillSelectFromCatalog('newMes', ['Agosto', 'Septiembre']);
  assert.deepEqual(plain(f.element('newMes').options.at(-1).value), 'TEMPORADA');
  assert.equal(f.element('newMes').value, 'TEMPORADA');
});

test('Nuevo Lead selecciona mes Miami y restablece campaña en cada apertura', () => {
  const f = frontend({
    miamiToday: () => '2026-10-15',
    catalogRows: { agente: [], campana: [{ value: 'Sin definir', active: true }], medio: [], gestion: [], mes: [{ value: 'Septiembre', active: true }, { value: 'Octubre', active: true }] },
    toggleNewAppointmentFields() {}, loadNewLeadAppointmentAdvisors() {},
  });
  const c = f.context;
  f.element('newMes').appendChild({ value: 'ENERO' });
  f.element('newMes').appendChild({ value: 'Septiembre' });
  f.element('newMes').appendChild({ value: 'Octubre' });
  f.element('newCampana').value = 'Anterior';
  c.openNewLeadModal();
  assert.equal(f.element('newMes').value, 'Octubre');
  assert.equal(f.element('newCampana').value, 'Sin definir');
});

test('histórico instancia los 8 gráficos con claves año-mes (regresión monthLabels)', () => {
  const leads = [
    { Mes: 'ENERO', Fecha: '1/1/2025', GESTION: 'INSCRITO', Campaña: 'Casting', Medio: 'WhatsApp', 'Agente ': 'Ana' },
    { Mes: 'ENERO', Fecha: '2/1/2025', GESTION: 'NO CONTESTA', Campaña: 'Casting', Medio: 'WhatsApp', 'Agente ': 'Ana' },
    { Mes: 'FEBRERO', Fecha: '1/2/2025', GESTION: 'AGENDADO', Campaña: 'Weston', Medio: 'Instagram', 'Agente ': 'Loli' },
  ];
  const f = frontend({ allLeads: leads }), c = f.context;
  // Canvas sintéticos y un Chart falso que captura la configuración real.
  const configs = [], canvases = new Map();
  const getElementById = c.document.getElementById;
  c.document.getElementById = id => {
    if (id.startsWith('chart')) {
      if (!canvases.has(id)) canvases.set(id, { id });
      return canvases.get(id);
    }
    return getElementById(id);
  };
  c.document.documentElement = { dataset: { theme: 'dark' } };
  class FakeChart {
    constructor(canvas, config) { configs.push({ canvasId: canvas.id, config }); this.canvas = canvas; }
    destroy() {}
  }
  FakeChart.defaults = { font: {} };
  c.Chart = FakeChart; c.window.Chart = FakeChart;
  c.histCharts = {};
  vm.runInContext([
    extractFunction('updateHistRangeNotice'),
    extractFunction('renderHistoricalAnalytics'),
  ].join('\n'), c);
  // renderHistoricalAnalytics usa la variable global histCharts del contexto.
  c.renderHistoricalAnalytics();
  assert.equal(configs.length, 8, `esperaba 8 gráficos, hubo ${configs.length}`);
  const byId = Object.fromEntries(configs.map(e => [e.canvasId, e.config]));
  assert.deepEqual(plain(byId.chartMonthlyEvolution.data.labels), ['ENERO 2025', 'FEBRERO 2025']);
  assert.deepEqual(plain(byId.chartMonthlyEvolution.data.datasets.find(d => d.label === 'Total Leads Captados').data), [2, 1]);
  assert.deepEqual(plain(byId.chartMonthlyEvolution.data.datasets.find(d => d.label === 'Inscritos Matriculados').data), [1, 0]);
  assert.deepEqual(plain(byId.chartConversionTrend.data.datasets[0].data), [50.0, 0]);
  assert.ok(byId.chartCampaignPerformance.data.labels.includes('Casting'));
  assert.ok(byId.chartFunnel.data.labels[0].startsWith('Recibidos: 3'));
  assert.equal(f.element('histKpiTotalLeads').textContent, '3');
});

test('histórico renderiza KPIs y tabla aunque Chart.js no esté disponible', () => {
  const leads = [{ Mes: 'ENERO', Fecha: '1/1/2025', GESTION: 'INSCRITO', Campaña: 'Casting' }];
  const f = frontend({ allLeads: leads }), c = f.context;
  const getElementById = c.document.getElementById;
  c.document.getElementById = id => id.startsWith('chart') ? undefined : getElementById(id);
  c.document.documentElement = { dataset: { theme: 'dark' } };
  delete c.window.Chart; delete c.Chart;
  c.histCharts = {};
  vm.runInContext([
    extractFunction('updateHistRangeNotice'),
    extractFunction('renderHistoricalAnalytics'),
  ].join('\n'), c);
  c.renderHistoricalAnalytics();
  assert.equal(f.element('histKpiTotalLeads').textContent, '1');
  assert.match(f.element('histMonthlyTableBody').innerHTML, /ENERO 2025/);
});

test('reporte diario real calcula Data Dura para la fecha seleccionada, no para hoy ni para el histórico', async () => {
  const leads = [
    { id: 1, Mes: 'MARZO', Fecha: '1/3/2026' },
    { id: 2, Mes: 'MARZO', Fecha: '1/3/2026' },
    { id: 3, Mes: 'MARZO', Fecha: '1/3/2025' },
    { id: 4, Mes: 'FEBRERO', Fecha: '1/2/2026' },
    { id: 5, Mes: 'OTRO' },
    { id: 6, Mes: 'FEBRERO', Fecha: '1/2/2025' },
  ];
  const dates = ['2026-03-05', '2026-02-05', '2025-03-05'];
  const gestiones = dates.flatMap((fecha, index) => leads.map(l => ({ id: index * leads.length + l.id, lead_id: l.id, autor_name: 'Test', fecha_gestion: fecha, gestion_nueva: l.id === 6 ? 'AGENDADO' : 'INSCRITO' })));
  const citas = dates.map((fecha, index) => ({ id: index + 1, advisor_name: 'Test', status: 'CANCELADA', scheduled_at: `${fecha}T12:00:00.000Z` }));
  const f = frontend({ supabaseClient: database({ leads, lead_gestiones: gestiones, lead_appointments: citas }), currentMainTab: 'reporte' });
  for (const [index, fecha] of dates.entries()) {
    f.element('reporteFecha').value = fecha;
    await f.context.loadReporteDiario();
    assert.equal(f.context.reporteDayData.length, 1);
    const block = f.context.reporteDayData[0];
    assert.equal(block.inscritos, 5, fecha);
    assert.equal(block.inscritosDura, [2, 3, 3][index], fecha);
    assert.equal(block.agendados, 1, 'conserva el conteo diario previo de citas');
  }
});

function reportFixture(options = {}) {
  const gestiones = rows(1205, { autor_name: 'Test', fecha_gestion: '2026-03-05', gestion_nueva: 'INSCRITO', created_at: '2026-03-05' }).map(r => ({ ...r, lead_id: r.id }));
  const leads = rows(1205, { Mes: 'MARZO', Fecha: '1/3/2026', Medio: 'Whatsapp' });
  leads[0].Fecha = '1/3/2025'; leads[1].Mes = 'FEBRERO';
  const db = database({ leads, lead_gestiones: gestiones, lead_appointments: rows(1205, { status: 'CANCELADA', scheduled_at: '2026-03-05T12:00:00.000Z', advisor_name: 'Test' }), daily_report_notes: [{ id: 1, report_date: '2026-03-05', autor_name: 'Test' }] }, options);
  const f = frontend({ supabaseClient: db, currentMainTab: 'reporte' });
  f.element('reporteFecha').value = '2026-03-05';
  return { ...f, db };
}

test('reporte real: pagina gestiones/citas/joins, consulta Mes/Fecha y no cambia Agendados', async () => {
  const { context: c, db } = reportFixture();
  await c.loadReporteDiario();
  assert.equal(c.reporteDayData.length, 1);
  assert.equal(c.reporteDayData[0].gestionados, 1205);
  assert.equal(c.reporteDayData[0].inscritos, 1205);
  assert.equal(c.reporteDayData[0].inscritosDura, 2);
  assert.equal(c.reporteDayData[0].agendados, 1205, 'canceladas siguen contando como antes');
  assert.ok(db.calls.filter(q => q.table === 'leads').every(q => q.columns.includes('Mes') && q.columns.includes('Fecha')));
});

test('reporte agrupa por canal real y usa Sin canal cuando falta', async () => {
  const gestiones = [
    { id: 1, lead_id: 1, autor_name: 'Test', fecha_gestion: '2026-03-05', gestion_nueva: 'CONTACTO', canal: 'Llamada' },
    { id: 2, lead_id: 2, autor_name: 'Test', fecha_gestion: '2026-03-05', gestion_nueva: 'CONTACTO', canal: null },
  ];
  const db = database({ leads: [{ id: 1, Medio: 'Whatsapp' }, { id: 2, Medio: 'Whatsapp' }], lead_gestiones: gestiones });
  const f = frontend({ supabaseClient: db, currentMainTab: 'reporte' }); f.element('reporteFecha').value = '2026-03-05';
  await f.context.loadReporteDiario();
  assert.deepEqual(Object.fromEntries(Object.entries(f.context.reporteDayData[0].groups).map(([k, v]) => [k, v.length])), { Llamada: 1, 'Sin canal': 1 });
});

test('reporte excluye citas data dura de agendados, pero conserva asistencia', async () => {
  const f = reportFixture();
  const appointments = [{ id: 1, advisor_name: 'Test', status: 'ASISTIO', scheduled_at: '2026-03-05T12:00:00.000Z', is_data_dura: true }, { id: 2, advisor_name: 'Test', status: 'NO_ASISTIO', scheduled_at: '2026-03-05T12:00:00.000Z', is_data_dura: false }];
  f.context.supabaseClient = database({ leads: [], lead_gestiones: [], lead_appointments: appointments, daily_report_notes: [] });
  await f.context.loadReporteDiario();
  assert.equal(f.context.reporteDayData[0].agendados, 1); assert.equal(f.context.reporteDayData[0].asistieron, 1); assert.equal(f.context.reporteDayData[0].noAsistieron, 1);
});

test('groupGestionEstado separa variantes data dura', () => {
  const { context: c } = frontend();
  assert.equal(c.groupGestionEstado('AGENDADO DATA DURA'), 'AGENDADO DATA DURA');
  assert.equal(c.groupGestionEstado('AGENDADO DATADURA'), 'AGENDADO DATA DURA');
  assert.equal(c.groupGestionEstado('AGENDADO'), 'AGENDADO');
});

test('reporte reintenta citas sin is_data_dura si el esquema aún no existe', async () => {
  const f = reportFixture({ fail: q => q.table === 'lead_appointments' && q.columns.includes('is_data_dura') ? { code: '42703', message: 'missing column' } : false });
  await f.context.loadReporteDiario();
  const calls = f.db.calls.filter(q => q.table === 'lead_appointments');
  assert.ok(calls.length >= 2); assert.ok(calls.some(q => !q.columns.includes('is_data_dura'))); assert.equal(f.context.reporteDayData[0].agendados, 1205);
});

test('reporte: notas >1000 recuperadas y error segunda página advierte sin parcial', async () => {
  const db = database({ daily_report_notes: rows(1205, { report_date: '2026-03-05', autor_name: 'Test' }) });
  const f = frontend({ supabaseClient: db, currentMainTab: 'reporte' }); f.element('reporteFecha').value = '2026-03-05';
  await f.context.loadReporteDiario();
  assert.equal(f.context.reporteDayData[0].nota.id, 1);
  const errorCase = reportFixture({ fail: q => q.table === 'lead_gestiones' && q.filters.length > 1 });
  await errorCase.context.loadReporteDiario();
  assert.equal(errorCase.context.reporteDayData[0].gestionados, 0);
  assert.match(errorCase.element('reporteAviso').textContent, /Gestiones no disponibles/);
});

test('reporte: cambio de sesión no restaura datos viejos ni en error', async () => {
  let c;
  const f = reportFixture({ hook: q => { if (q.table === 'leads') { c.sessionGeneration++; c.reporteDayData = [{ advisor: 'new' }]; } }, fail: q => q.table === 'leads' }); c = f.context;
  await c.loadReporteDiario();
  assert.equal(c.reporteDayData[0].advisor, 'new');
});

test('Campañas: estadísticas >1000 paginadas, RPC JSONB completo y año/mes intactos', async () => {
  const rollup = rows(1205, { leads_nuevos: 1 }).map(r => ({ ...r, campaign_name: `Campaign ${String(r.id).padStart(4, '0')}` }));
  const stats = rollup.map(r => ({ id: r.id, campaign_name: r.campaign_name, anio: 2026, mes: 'MARZO', gasto: 2 }));
  const db = database({ campaign_monthly_rollup: rollup, campaign_stats: stats });
  const f = frontend({ supabaseClient: db, currentMainTab: 'campanas' }); f.element('campaignMesSel').value = '2026-03';
  await f.context.loadCampanas();
  assert.equal(f.context.campanasData.length, 1205);
  assert.equal(f.context.campaignStatsMap.size, 1205);
  assert.equal(f.context.campaignTotals(f.context.campanasData).leads_nuevos, 1205);
  assert.equal(f.context.campaignTotals(f.context.campanasData).gasto, 2410);
  assert.ok(db.calls.filter(q => q.table === 'campaign_stats').every(q => q.orders[0][0] === 'id'));
  assert.equal(db.rpcCalls.length, 1, 'el RPC es JSONB escalar y no se pagina como tabla');
  assert.deepEqual(plain(db.rpcCalls[0].args), { p_anio: 2026, p_mes: 'MARZO' });
});

test('Campañas: error de página no presenta un reporte parcial; sesión obsoleta se descarta', async () => {
  const rollup = rows(1205).map(r => ({ ...r, campaign_name: `Campaign ${String(r.id).padStart(4, '0')}` }));
  const stats = rollup.map(r => ({ id: r.id, campaign_name: r.campaign_name, anio: 2026, mes: 'MARZO' }));
  const f = frontend({ currentMainTab: 'campanas' }); f.element('campaignMesSel').value = '2026-03';
  f.context.supabaseClient = database({ campaign_monthly_rollup: rollup, campaign_stats: stats }, { fail: q => q.table === 'campaign_stats' && q.filters.length > 2 });
  await f.context.loadCampanas();
  assert.equal(f.context.campanasData.length, 0);
  assert.match(f.element('campanasAviso').textContent, /No se pudieron cargar/);
  f.context.supabaseClient = database({ campaign_monthly_rollup: rollup, campaign_stats: stats }, { hook: q => { if (q.filters.length > 2) { f.context.sessionGeneration++; f.context.campanasData = [{ name: 'new' }]; } } });
  await f.context.loadCampanas();
  assert.equal(f.context.campanasData[0].name, 'new');
});

// Decodificador CSV real (comillas escapadas y saltos dentro de celdas).
function decodeCSV(text) {
  const result = [], row = []; let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field); field = '';
      if (char === '\n') { result.push([...row]); row.length = 0; }
    } else field += char;
  }
  row.push(field); result.push([...row]); return result;
}

test('CSV compartido conserva #, comillas/saltos y neutraliza fórmulas incluso con espacio/tab', () => {
  const { context: c } = frontend();
  const values = ['#lead "texto"\nsegunda línea', '=SUM(A1:A9)', '+1', '-2', '@A1', ' \t=1', 'normal', null];
  const decoded = decodeCSV(values.map(c.csvReporteField).join(','))[0];
  assert.deepEqual(decoded, [values[0], ...values.slice(1, 6).map(v => "'" + v), 'normal', '']);
});

for (const exporter of ['exportCurrentLeadsCSV', 'exportHistoricalSummaryCSV', 'exportReporteDiarioCSV', 'exportCampanasCSV']) test(`${exporter}: Blob decodificado con #, fórmulas, comillas y saltos`, async () => {
  const value = ' \t=SUM(A1:A2) # "cita"\nsegunda línea';
  const f = frontend(), c = f.context;
  c.filteredLeads = [{ id: 1, Nombre: value }];
  c.allLeads = [{ id: 1, Mes: 'MARZO', Fecha: '1/3/2026', Campaña: value, GESTION: 'INSCRITO' }];
  c.reporteDayData = [{ advisor: value, gestionados: 1, agendados: 1, asistieron: 0, noAsistieron: 0, inscritos: 0, inscritosDura: 0 }];
  c.campanasData = [{ name: value, gasto: 1, resultados: 1, alcance: 1, leads_nuevos: 1, agendados: 1, asistieron: 0, inscritos: 0, agendados_previos: 0, pendientes: 0 }];
  c[exporter]();
  assert.equal(f.downloads.length, 1);
  const download = f.downloads[0];
  assert.equal(download.href, 'blob:synthetic'); assert.equal(download.clicked, true);
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await download.blob.arrayBuffer());
  assert.equal(text[0], '\uFEFF');
  const decoded = decodeCSV(text.slice(1));
  // El agregado histórico normaliza campañas con trim antes de exportar.
  const exportedValue = exporter === 'exportHistoricalSummaryCSV' ? value.trim() : value;
  assert.ok(decoded.some(row => row.includes("'" + exportedValue)), JSON.stringify(decoded));
  assert.ok(text.includes('#')); assert.ok(!text.includes('%23'));
  assert.equal(download.revoked, undefined);
  f.timers.forEach(fn => fn()); assert.equal(download.revoked, 'blob:synthetic');
});

function edge(slug, { users = rows(1205, { email: 'other@example.test' }), failPage, collision = false } = {}) {
  const calls = [], upserts = []; let handler, generated = false;
  const service = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'admin', email: 'admin@example.test' } } }),
      resetPasswordForEmail: async () => ({}),
      admin: {
        inviteUserByEmail: async () => ({ error: { message: 'already registered' } }),
        getUserById: async () => ({ data: { user: { email: 'old@example.test' } } }),
        listUsers: async ({ page, perPage }) => {
          calls.push(page); assert.equal(perPage, 1000);
          if (page === failPage) return { error: { message: 'synthetic Auth failure' } };
          return { data: { users: users.slice((page - 1) * perPage, page * perPage) } };
        },
        generateLink: async () => { generated = true; return { data: { properties: { hashed_token: 'synthetic-not-secret' } } }; },
      },
    },
    from() {
      return {
        select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: { role: 'admin', user_id: 'target' } }),
        then: resolve => Promise.resolve({ count: collision ? 1 : 0 }).then(resolve),
        upsert: async payload => { upserts.push(payload); return {}; },
      };
    },
  };
  const code = transformSync(source(`supabase/functions/${slug}/index.ts`).replace(/^import .*;\s*$/m, ''), { loader: 'ts', target: 'es2022' }).code;
  vm.runInNewContext(code, {
    Deno: { env: { get: name => ({ SUPABASE_URL: 'https://example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-not-secret' })[name] }, serve: fn => { handler = fn; } },
    createClient: () => service, Response, URL,
    console: { log() {}, warn() {}, error() {} },
    fetch: async url => new Response(JSON.stringify(url.endsWith('/verify') ? { access_token: 'synthetic' } : {}), { status: 200 }),
  });
  return {
    calls, upserts, generated: () => generated,
    request: payload => handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })),
  };
}

test('authorize-user handler: usuario >1000 encontrado, normalizado, upsert y 202', async () => {
  const users = rows(1205, { email: 'other@example.test' }); users[1204].email = ' Target@Example.Test ';
  const e = edge('authorize-user', { users });
  const response = await e.request({ email: 'target@example.test', nombre: 'Test', role: 'agente' });
  assert.equal(response.status, 202); assert.deepEqual(e.calls, [1, 2]);
  assert.equal(e.upserts[0].user_id, 1205);
});

test('authorize-user handler: no encontrado y error de página conservan 202 sin upsert', async () => {
  for (const failPage of [undefined, 2]) {
    const e = edge('authorize-user', { failPage });
    const response = await e.request({ email: 'target@example.test', nombre: 'Test', role: 'agente' });
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { accepted: true });
    assert.deepEqual(e.calls, [1, 2]); assert.equal(e.upserts.length, 0);
  }
});

for (const column of ['email', 'new_email']) test(`change-user-email handler: colisión >1000 en ${column} bloquea`, async () => {
  const users = rows(1205, { email: 'other@example.test' }); users[1204][column] = ' Target@Example.Test ';
  const e = edge('change-user-email', { users });
  const response = await e.request({ newEmail: 'target@example.test', targetUserId: '00000000-0000-0000-0000-000000000001' });
  assert.equal(response.status, 400); assert.equal((await response.json()).error, 'email_taken');
  assert.deepEqual(e.calls, [1, 2]); assert.equal(e.generated(), false);
});

test('change-user-email handler: error página 2 fail-closed; libre recorre todo y devuelve 202', async () => {
  for (const failPage of [2, undefined]) {
    const e = edge('change-user-email', { failPage });
    const response = await e.request({ newEmail: 'target@example.test', targetUserId: '00000000-0000-0000-0000-000000000001' });
    assert.equal(response.status, failPage ? 500 : 202);
    assert.deepEqual(e.calls, [1, 2]); assert.equal(e.generated(), !failPage);
  }
});

test('Auth: página llena exacta exige consultar página vacía final', async () => {
  const e = edge('authorize-user', { users: rows(2000, { email: 'other@example.test' }) });
  assert.equal((await e.request({ email: 'target@example.test', role: 'agente' })).status, 202);
  assert.deepEqual(e.calls, [1, 2, 3]); assert.equal(e.upserts.length, 0);
});

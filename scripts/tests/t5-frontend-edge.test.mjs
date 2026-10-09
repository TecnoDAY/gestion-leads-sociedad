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
  'activeCatalogValues', 'catalogOptions', 'compareAlphaEs', 'sortAlphaEs', 'sortMonthCatalog', 'parseFechaLead', 'normalizeLeadMonth', 'leadReportDate', 'isInscritoDataDura',
  'histMonthKey', 'histMonthLabel', 'sortHistMonthKeys', 'normalizeGestion', 'groupGestionEstado', 'readHistRange',
  'filterHistoricalLeads', 'populateHistoricalFilterOptions', 'computeHistoricalAggregates', 'escapeHtml', 'escapeAttr',
  'loadReporteDiario', 'renderReporteV2', 'csvReporteField', 'downloadCSV', 'exportCurrentLeadsCSV', 'exportHistoricalSummaryCSV',
  'exportReporteDiarioCSV', 'exportCampanasCSV', 'campaignCosteResultado', 'campaignTotals', 'loadCampanas',
  'saveReporteNota', 'deleteReporteNota', 'reporteNotaErrorMsg',
  'resetReportePeriodo', 'setReporteVista', 'periodoPresetRange', 'setPeriodoPreset', 'periodoRangeKey', 'periodoValidDate',
  'buildPeriodSummary', 'validatePeriodoSummary', 'loadReportePeriodo', 'periodoPct', 'renderReportePeriodo', 'exportReportePeriodoCSV', 'initReporteDiario',
  'markPeriodoReportDirty', 'updatePeriodoCsvState', 'upsertLeadInState', 'removeLeadFromState',
  'loadPeriodoActividad', 'validatePeriodoActividad', 'renderPeriodoActividad', 'periodoTip',
  'loadAuthorizedUsers', 'renderAuthorizedUsers', 'fillSelectFromCatalog', 'populateCatalogSelects',
  'openNewLeadModal', 'handleCreateLead', 'handleUpdateLead', 'openEditLeadModal', 'appointmentDetailsFrom', 'syncNewLeadMes', 'syncNewUltimaGestion',
  'editLeadStaysAgendado', 'setExistingCampusNotice', 'loadEditExistingAppointment', 'appointmentDate', 'appointmentInputISO', 'appointmentLocal', 'appointmentCampusFrom',
  'createLeadAppointment', 'editAppointmentDetails', 'editAppointmentCampus', 'setLeadAppointmentStatus', 'rescheduleLeadAppointment',
  'setAppointmentMutationPending', 'updateLeadAppointmentCreateState', 'deleteLeadAppointment',
  'totalCanalesVisibles',
  'toggleNewAppointmentFields', 'isAgendadoGestion', 'setBlockControls',
  'normalizePhone', 'isNuevoEsteMes', 'checkNewPhoneDuplicate', 'setNewPhoneWarn'
];
const frontendSource = ['let leadAppointmentCreateBlocked = true;', ...constants, ...names.map(extractFunction)].join('\n');

function frontend(extra = {}) {
  const elements = new Map(), downloads = [], timers = [], toasts = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', _innerHTML: '', textContent: '', innerText: '', options: [{ value: '' }],
      querySelector: () => null, querySelectorAll: () => [],
      get innerHTML() { return this._innerHTML; },
      set innerHTML(value) { this._innerHTML = value; this.options = []; this.value = ''; },
       classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
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
      querySelector: () => null,
      querySelectorAll: () => [],
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
    renderCampanas() {}, canEditCampaigns: () => false,
    isAgendadoGestion: value => value.startsWith('AGENDAD'),
    miamiToday: () => '2026-09-30', miamiDayBounds: date => [date + 'T04:00:00.000Z', date + 'T16:00:00.000Z'],
    supabaseClient: null, currentUser: { id: 'user-test' }, currentAccess: { activo: true, nombre: 'Test', updated_at: 'v1' },
    sessionGeneration: 1, currentMainTab: 'citas', isAdmin: false, isSupervisor: false, newPhoneCheckGeneration: 0, newPhoneCheckTimer: null,
    citasRequestGeneration: 0, citasCache: [], citasRangeKey: '', leadAppointmentsCache: [], leadNotesCache: [], leadGestionesCache: [],
    viewLeadGeneration: 1, currentViewId: 1, dashRangeGen: 0, filterDebounceTimer: null,
   reporteRequestGeneration: 0, reporteDayAdvisors: [], reporteDayData: [], reporteDayNotes: [], reporteAsesorasDisponibles: [], reporteLoadedKey: '', campanasData: [],
    periodoRequestGeneration: 0, periodoData: null, periodoLoadedKey: '', reporteVistaActiva: 'diario',
    periodoSourceRevision: 0, periodoLoadedRevision: -1, periodoRefreshTimer: null,
    periodoActividadData: null, periodoActividadKey: '', periodoActividadGeneration: 0,
    isLoadingLeads: false, isSupabaseLive: true,
    campanasRequestGeneration: 0, campanasLoading: false, campanasContextMonth: '', campaignStatsMap: new Map(),
    allLeads: [], allHistorico: [], filteredLeads: [], dataSource: 'actual', currentPage: 1, authorizedUsersList: [],
    leadAppointmentAdvisors: [], newLeadSubmitting: false, newLeadRequestGeneration: 0, newLeadAdvisorGeneration: 0,
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
    async rpc(name, args) { rpcCalls.push({ name, args }); const value = typeof tables[name] === 'function' ? tables[name](args) : tables[name]; return { data: Array.isArray(value) ? value.map(r => ({ ...r })) : value, error: null }; },
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

// Sintetico: no representa octubre real ni el total de una imagen de Sheets.
const periodCatalogs = () => ({
  medio: [
    { value: 'Instagram', active: true },
    { value: 'instagram ', active: true }, // duplicado case-insensitive: una sola fila
    { value: 'Cero', active: true },       // catálogo sin leads: se conserva en cero
    { value: 'Apagado', active: false },   // inactivo: no abre categoría
  ],
  campana: [
    { value: '=Campaña <demo>', active: true },
    { value: 'Cero', active: true },
  ],
  gestion: [
    { value: 'Contactado', active: true },
    { value: 'Mudo', active: true },
  ],
});
const periodLeads = () => [
  { id: 1, Fecha: '2026-10-01', Medio: ' instagram ', 'Campaña': '=campaña <demo>', GESTION: 'contactado' }, // límite desde, trim/ci → catálogo
  { id: 2, Fecha: '7/10/2026', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Sin respuesta' },  // límite hasta, gestión extra
  { id: 2, Fecha: '07/10/2026' },                                                                           // id duplicado: cuenta una vez
  { id: 3, Fecha: '07-10-2026', Medio: '', 'Campaña': '', GESTION: '' },                                     // vacíos → Sin definir
  { id: 4, Fecha: 'basura', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo' },             // fecha inválida → excluido
  { id: 5, Fecha: '2026-09-30', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo' },         // justo antes del rango
  { id: 6, Fecha: '2026-10-06', Medio: 'panfleto', 'Campaña': 'zz-extra', GESTION: 'Contactado' },          // extras fuera de catálogo
  { id: 7, Fecha: '2026-10-07', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo', archived_at: '2026-10-08T00:00:00Z' }, // archivado: excluido
  { id: 8, Fecha: '2026-10-08', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo' },         // justo después del rango
];
function periodFrontend(extra = {}) {
  const f = frontend({ currentMainTab: 'reporte', reporteVistaActiva: 'periodo', miamiToday: () => '2026-10-07', supabaseClient: periodoSinRed().supabaseClient, ...extra });
  f.element('periodoDesde').value = '2026-10-01'; f.element('periodoHasta').value = '2026-10-07';
  return f;
}
const periodoSinRed = () => { const rpcCalls = []; return { rpcCalls, supabaseClient: { rpc: (...args) => { rpcCalls.push(args); throw new Error('no debe haber red'); } } }; };
// Arriba probamos la cohorte sin red; la actividad del periodo SI usa una RPC
// agregada (management_period_summary): par clientes de test para ambos modos.
const periodoActividadFixture = (desde = '2026-10-01', hasta = '2026-10-07') => ({
  desde, hasta,
  gestiones: { total_eventos: 9, leads_unicos: 4, agendados_normales: 2, agendados_data_dura: 1, inscritos_normales: 3, inscritos_data_dura: 0, por_estado: [{ label: 'AGENDADO', eventos: 2, leads: 2 }] },
  canales: { llamadas_normales: 5, llamadas_data_dura: 2, llamada_whatsapp: 1, whatsapp: 1, otros: 0 },
  citas: { programadas_normales: 3, programadas_data_dura: 2, asistieron: 4, no_asistieron: 1, canceladas: 0, reprogramadas: 0, doral_normal: 1, doral_data_dura: 1, weston_normal: 2, weston_data_dura: 0, sin_sede: 1 },
});
const periodoConActividad = () => { const rpcCalls = []; return { rpcCalls, supabaseClient: { rpc: (name, args) => { rpcCalls.push([name, args]); if (name !== 'management_period_summary') throw new Error('rpc inesperada: ' + name); return Promise.resolve({ data: periodoActividadFixture(args.p_desde, args.p_hasta), error: null }); } } }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('buildPeriodSummary: catálogo+extras, dedup id, archivados, límites y matriz coherentes', () => {
  const f = frontend();
  const data = f.context.buildPeriodSummary(periodLeads(), periodCatalogs(), '2026-10-01', '2026-10-07');
  assert.equal(data.total, 4);
  assert.equal(data.fechas_invalidas, 1);
  assert.equal(data.desde, '2026-10-01'); assert.equal(data.hasta, '2026-10-07');
  assert.deepEqual(plain(data.medios), [
    { label: 'Cero', count: 0 }, { label: 'Instagram', count: 2 }, { label: 'panfleto', count: 1 }, { label: 'Sin definir', count: 1 },
  ]);
  assert.deepEqual(plain(data.campanas), [
    { label: '=Campaña <demo>', count: 2 }, { label: 'Cero', count: 0 }, { label: 'Sin definir', count: 1 }, { label: 'zz-extra', count: 1 },
  ]);
  assert.deepEqual(plain(data.gestiones), [
    { label: 'Contactado', count: 2 }, { label: 'Mudo', count: 0 }, { label: 'Sin definir', count: 1 }, { label: 'Sin respuesta', count: 1 },
  ]);
  assert.deepEqual(plain(data.matriz), {
    campanas: ['=Campaña <demo>', 'Cero', 'Sin definir', 'zz-extra'],
    totales_columnas: [2, 0, 1, 1],
    filas: [
      { label: 'Contactado', counts: [1, 0, 0, 1], total: 2 },
      { label: 'Mudo', counts: [0, 0, 0, 0], total: 0 },
      { label: 'Sin definir', counts: [0, 0, 1, 0], total: 1 },
      { label: 'Sin respuesta', counts: [1, 0, 0, 0], total: 1 },
    ],
  });
  assert.deepEqual(plain(data.totales), { medios: 4, campanas: 4, gestiones: 4, matriz: 4 });
  f.context.validatePeriodoSummary(data, '2026-10-01', '2026-10-07');
});

test('buildPeriodSummary: rango invertido o inválido lanza period_range_invalid', () => {
  const f = frontend();
  for (const [a, b] of [['2026-10-08', '2026-10-07'], ['2026-02-30', '2026-10-07'], ['2026-10-31', ''], ['mal', '2026-10-07'], ['', '']]) {
    assert.throws(() => f.context.buildPeriodSummary(periodLeads(), periodCatalogs(), a, b), err => err.message === 'period_range_invalid');
  }
});

test('buildPeriodSummary: período vacío total 0, catálogo en cero y pct 0.00%', () => {
  const f = frontend();
  // Fechas válidas fuera de rango no cuentan como sin fecha; archivados no cuentan nunca.
  const data = f.context.buildPeriodSummary([
    { id: 1, Fecha: '2025-01-15', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo' },
    { id: 2, Fecha: 'basura', Medio: 'Instagram', 'Campaña': '=Campaña <demo>', GESTION: 'Mudo' },
    { id: 3, Fecha: 'basura', archived_at: '2026-01-01T00:00:00Z', Medio: 'Instagram', 'Campaña': 'X', GESTION: 'Y' },
  ], periodCatalogs(), '2026-10-01', '2026-10-07');
  assert.equal(data.total, 0); assert.equal(data.fechas_invalidas, 1);
  assert.deepEqual(plain(data.medios), [{ label: 'Cero', count: 0 }, { label: 'Instagram', count: 0 }, { label: 'Sin definir', count: 0 }]);
  assert.deepEqual(plain(data.matriz.totales_columnas), [0, 0, 0]);
  assert.deepEqual(plain(data.matriz.filas), [
    { label: 'Contactado', counts: [0, 0, 0], total: 0 },
    { label: 'Mudo', counts: [0, 0, 0], total: 0 },
    { label: 'Sin definir', counts: [0, 0, 0], total: 0 },
  ]);
  assert.equal(f.context.periodoPct(0, 0), '0.00%');
  f.context.validatePeriodoSummary(data, '2026-10-01', '2026-10-07');
});

test('período: cálculo local sin RPC; cuatro secciones, ceros, escape y aviso', async () => {
  const { rpcCalls, supabaseClient } = periodoSinRed();
  const f = periodFrontend({ supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  await f.context.loadReportePeriodo();
  // La cohorte no toca la red; la actividad intenta UNA sola RPC agregada y su
  // fallo no borra los cuatro cuadros.
  assert.ok(rpcCalls.every(([name]) => name === 'management_period_summary'));
  const body = f.element('periodoBody').innerHTML;
  assert.equal((body.match(/<section/g) || []).length, 4);
  assert.match(body, /Cero/); assert.match(body, /0\.00%/); assert.match(body, /50\.00%/); assert.match(body, /100\.00%/);
  assert.match(body, /&lt;demo&gt;/); assert.doesNotMatch(body, /<demo>/);
  assert.match(body, /overflow-x-auto/); assert.match(body, /sticky left-0/);
  assert.match(f.element('periodoAviso').textContent, /2026-10-01 a 2026-10-07 \(inclusive\) · 4 leads por fecha de entrada · 1 sin fecha válida \(excluidos\)\./);
  assert.match(f.element('periodoAviso').textContent, /no histórica al cierre/);
  assert.equal(f.context.periodoLoadedKey, '2026-10-01|2026-10-07');
  assert.equal(f.context.periodoData.total, 4);
});

test('período: total cero conserva categorías, cuatro totales y CSV exportable', async () => {
  const { supabaseClient } = periodoConActividad();
  const f = periodFrontend({ supabaseClient, allLeads: [], catalogRows: periodCatalogs() });
  await f.context.loadReportePeriodo();
  await settle();
  assert.doesNotMatch(f.element('periodoBody').innerHTML, /NaN|Infinity|100\.00%/);
  assert.equal((f.element('periodoBody').innerHTML.match(/TOTAL/g) || []).length, 4);
  assert.match(f.element('periodoAviso').textContent, /· 0 leads por fecha de entrada · 0 sin fecha válida \(excluidos\)/);
  f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 1);
});

test('período: rango invertido, ausente o fecha imposible invalida cache sin red', async () => {
  const { rpcCalls, supabaseClient } = periodoSinRed();
  const f = periodFrontend({ supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  for (const [a, b] of [['2026-10-08', '2026-10-07'], ['', '2026-10-07'], ['2026-02-30', '2026-10-07'], ['mal', '2026-10-07']]) {
    f.context.periodoData = { total: 1 }; f.context.periodoLoadedKey = 'old';
    f.element('periodoDesde').value = a; f.element('periodoHasta').value = b;
    await f.context.loadReportePeriodo();
    assert.match(f.element('periodoAviso').textContent, /Rango inválido/);
    assert.equal(f.context.periodoData, null); assert.equal(f.context.periodoLoadedKey, '');
    assert.equal(f.element('periodoBody').innerHTML, '');
  }
  assert.equal(rpcCalls.length, 0);
});

test('período: resumen incoherente o malformado nunca se publica', async () => {
  const changes = [d => d.totales.medios++, d => d.medios[0].count++, d => d.matriz.filas[0].counts[0]++, d => d.matriz.totales_columnas[0]++, d => d.matriz.campanas.reverse(), d => d.hasta = '2026-10-08', d => d.total = -1, d => d.gestiones = null];
  for (const change of changes) {
    const f = periodFrontend({ allLeads: [], catalogRows: periodCatalogs() });
    const data = f.context.buildPeriodSummary([], periodCatalogs(), '2026-10-01', '2026-10-07');
    change(data);
    f.context.buildPeriodSummary = () => data;
    await f.context.loadReportePeriodo();
    assert.match(f.element('periodoAviso').textContent, /totales del reporte no coinciden/);
    assert.equal(f.context.periodoData, null); assert.equal(f.context.periodoLoadedKey, '');
    assert.equal(f.element('periodoBody').innerHTML, '');
    f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 0);
  }
});

test('período: carga incompleta o sin conexión muestra aviso sin datos parciales', async () => {
  for (const extra of [{ isLoadingLeads: true, allLeads: periodLeads() }, { isLoadingLeads: false, isSupabaseLive: false, allLeads: [] }]) {
    const f = periodFrontend(extra);
    await f.context.loadReportePeriodo();
    assert.match(f.element('periodoAviso').textContent, /Cargando todos los leads/);
    assert.equal(f.context.periodoData, null);
    assert.equal(f.element('periodoBody').innerHTML, '');
  }
});

test('período: cálculo obsoleto (rango cambiado en curso) no reemplaza al nuevo', async () => {
  const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs() });
  const real = f.context.buildPeriodSummary;
  let once = false;
  f.context.buildPeriodSummary = (...args) => {
    const data = real(...args);
    if (!once) { once = true; f.element('periodoHasta').value = '2026-10-06'; f.context.loadReportePeriodo(); }
    return data;
  };
  await f.context.loadReportePeriodo();
  assert.equal(f.context.periodoLoadedKey, '2026-10-01|2026-10-06');
  assert.equal(f.context.periodoData.total, 2);
});

test('período: cambios de sesión, acceso, pestaña, vista y filtros durante el cálculo descartan el resultado', async () => {
  for (const change of [f => f.context.sessionGeneration++, f => f.context.currentUser.id = 'other', f => f.context.currentAccess.updated_at = 'v2', f => f.context.currentAccess.activo = false, f => f.context.currentMainTab = 'dashboard', f => f.context.reporteVistaActiva = 'diario', f => f.element('periodoDesde').value = '2026-10-02']) {
    const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs() });
    const real = f.context.buildPeriodSummary;
    f.context.buildPeriodSummary = (...args) => { const data = real(...args); change(f); return data; };
    f.element('periodoAviso').textContent = 'nueva vista';
    await f.context.loadReportePeriodo();
    assert.equal(f.context.periodoData, null);
    assert.equal(f.element('periodoAviso').textContent, 'nueva vista');
  }
});

test('período: sin sesión, acceso, pestaña o vista correcta no publica datos', async () => {
  for (const mutate of [f => f.context.supabaseClient = null, f => f.context.currentUser = null, f => f.context.currentAccess = { activo: false, updated_at: 'v1' }, f => f.context.currentMainTab = 'dashboard', f => f.context.reporteVistaActiva = 'diario']) {
    const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs() });
    mutate(f);
    f.element('periodoAviso').textContent = 'previo';
    await f.context.loadReportePeriodo();
    assert.equal(f.context.periodoData, null);
    assert.equal(f.element('periodoAviso').textContent, 'previo');
  }
});

test('período: error period_range_invalid se traduce y excepción limpia datos previos', async () => {
  const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs(), periodoData: { total: 1 }, periodoLoadedKey: '2026-10-01|2026-10-07' });
  f.context.buildPeriodSummary = () => { throw new Error('period_range_invalid'); };
  await f.context.loadReportePeriodo();
  assert.match(f.element('periodoAviso').textContent, /Rango inválido/);
  assert.equal(f.context.periodoData, null); assert.equal(f.context.periodoLoadedKey, '');
  f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 0);
  const boom = periodFrontend({ allLeads: [], catalogRows: periodCatalogs() });
  boom.context.buildPeriodSummary = () => { throw new Error('boom inesperado'); };
  await boom.context.loadReportePeriodo();
  assert.equal(boom.element('periodoAviso').textContent, 'boom inesperado');
  assert.equal(boom.context.periodoData, null);
});

test('período: CSV usa rango cargado, cuatro secciones, ceros, totales, neutraliza fórmulas y añade actividad+agenda', async () => {
  const { rpcCalls, supabaseClient } = periodoConActividad();
  const f = periodFrontend({ supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  await f.context.loadReportePeriodo();
  // Bloqueo mientras la actividad no se ha resuelto (RPC pendiente).
  let actividadResolve; const pending = new Promise(res => { actividadResolve = res; });
  f.context.supabaseClient = { rpc: () => pending };
  await f.context.loadReportePeriodo();
  f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 0);
  assert.match(f.toasts.at(-1)[0], /actividad del período aún no está cargada/);
  actividadResolve({ data: periodoActividadFixture(), error: null });
  await settle();
  f.context.supabaseClient = supabaseClient;
  f.element('periodoHasta').value = '2026-10-08'; f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 0);
  f.element('periodoHasta').value = '2026-10-07'; f.context.exportReportePeriodoCSV();
  assert.equal(f.downloads[0].download, 'Reporte_Periodo_2026-10-01_2026-10-07.csv');
  const csv = await f.downloads[0].blob.text();
  assert.match(csv, /Desde \(inclusive\).*2026-10-01.*Hasta \(inclusive\).*2026-10-07/);
  assert.match(csv, /Gestión actual; no estado histórico/); assert.match(csv, /"'=Campaña <demo>"/);
  assert.match(csv, /"Cero","0","0\.00%"/); assert.equal((csv.match(/"TOTAL"/g) || []).length, 4);
  assert.match(csv, /"Leads sin fecha válida \(excluidos\)","1"/);
  assert.match(csv, /"Actividad realizada en el período/);
  assert.match(csv, /"Pasados a Agendado Data Dura","1"/);
  assert.match(csv, /"Programadas Data Dura","2"/);
  assert.match(csv, /"AGENDADO","2","2"/);
  f.context.currentAccess.activo = false; f.context.exportReportePeriodoCSV(); assert.equal(f.downloads.length, 1);
  assert.ok(rpcCalls.every(([name]) => name === 'management_period_summary'));
});

test('período: ayudas y encabezados explican leads únicos vs gestiones sin cambiar cifras', async () => {
  const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs() });
  const tip = f.context.periodoTip('leads');
  assert.match(tip, /periodo-tip/); assert.match(tip, /periodo-tip-btn/);
  assert.match(tip, /periodo-tip-panel/); assert.match(tip, /role="tooltip"/);
  assert.match(tip, /aria-describedby="pt-leads"/); assert.match(tip, /id="pt-leads"/);
  assert.match(tip, /Personas activas|Cada lead se cuenta una vez/i); assert.match(tip, /<button type="button"/);
  assert.equal(f.context.periodoTip('clave-inexistente'), '');

  const htmlActividad = f.context.renderPeriodoActividad(periodoActividadFixture());
  assert.doesNotMatch(htmlActividad, /\(leads únicos \/ eventos\)/);
  assert.match(htmlActividad, /Estado<\/th><th[^>]*>Leads únicos/);
  assert.match(htmlActividad, /Total de gestiones/); assert.match(htmlActividad, /no se debe sumar/);
  assert.match(htmlActividad, /AGENDADO<\/th><td[^>]*>2<\/td><td[^>]*>2<\/td>/);
  for (const id of ['pt-gestiones', 'pt-canales', 'pt-citas', 'pt-estadoTabla', 'pt-leadsUnicos', 'pt-totalGestiones', 'pt-dd', 'pt-actividad']) assert.match(htmlActividad, new RegExp(id));

  const htmlCohorte = f.context.renderReportePeriodo(f.context.buildPeriodSummary(periodLeads(), periodCatalogs(), '2026-10-01', '2026-10-07'));
  assert.ok((htmlCohorte.match(/class="periodo-tip/g) || []).length >= 4);
  for (const id of ['pt-medios', 'pt-campanas', 'pt-gestionActual', 'pt-matriz', 'pt-leads', 'pt-pct']) assert.match(htmlCohorte, new RegExp(id));
  assert.ok((htmlCohorte.match(/<section/g) || []).length === 4);

  const actividad = periodoConActividad();
  const csvFrontend = periodFrontend({ supabaseClient: actividad.supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  await csvFrontend.context.loadReportePeriodo(); await settle();
  csvFrontend.context.exportReportePeriodoCSV();
  const csv = await csvFrontend.downloads[0].blob.text();
  assert.match(csv, /"Estado","Leads únicos","Total de gestiones"/);
  assert.doesNotMatch(csv, /"Estado","Leads únicos","Eventos"/);
  assert.match(csv, /"AGENDADO","2","2"/); assert.match(csv, /"Otros o sin canal","0"/);
  assert.match(csv, /"Doral: programadas normales","1"/); assert.match(csv, /"Doral: programadas Data Dura","1"/);
  // Las dos sedes deben exportar cifra, nunca celda vacía (placeholder = undefined = "").
  assert.match(csv, /"Weston: programadas normales","2"/); assert.match(csv, /"Weston: programadas Data Dura","0"/);
  assert.doesNotMatch(csv, /"Weston: programadas (normales|Data Dura)",""/);
  assert.match(csv, /"Nota: Leads únicos cuenta personas distintas; Total de gestiones suma todos los intentos\./);

  assert.match(html, /periodo-tip-panel\s*\{/);
  assert.match(html, /\.periodo-tip:focus-within \.periodo-tip-panel/);
  assert.match(html, /Leads por fecha de entrada:/);
});

test('período: presets calendario Miami incluyen hoy, semana lunes-domingo y cambio de año', async () => {
  const f = periodFrontend(); f.context.loadReportePeriodo = async () => {};
  for (const [preset, expected] of [['mes', ['2026-10-01', '2026-10-07']], ['semana', ['2026-10-05', '2026-10-11']], ['7d', ['2026-10-01', '2026-10-07']], ['30d', ['2026-09-08', '2026-10-07']]]) {
    await f.context.setPeriodoPreset(preset);
    assert.deepEqual([f.element('periodoDesde').value, f.element('periodoHasta').value], expected);
  }
  f.context.miamiToday = () => '2027-01-03';
  assert.deepEqual(plain(f.context.periodoPresetRange('semana')), ['2026-12-28', '2027-01-03']);
  assert.deepEqual(plain(f.context.periodoPresetRange('7d')), ['2026-12-28', '2027-01-03']);
  f.context.miamiToday = () => '2024-03-01';
  assert.deepEqual(plain(f.context.periodoPresetRange('7d')), ['2024-02-24', '2024-03-01']);
});

test('período: selector aislado y reset descartan cargas sin modificar cache diario', async () => {
  const f = periodFrontend({ reporteDayData: [{ marker: 'diario' }] });
  f.context.initReporteDiario = () => { f.context.dailyInit = true; };
  f.context.loadReportePeriodo = async () => { f.context.periodInit = true; };
  await f.context.setReporteVista('diario'); assert.equal(f.context.dailyInit, true);
  await f.context.setReporteVista('periodo'); assert.equal(f.context.periodInit, true);
  f.context.periodoData = { total: 1 }; f.context.periodoLoadedKey = 'loaded';
  const generation = f.context.periodoRequestGeneration;
  f.context.resetReportePeriodo();
  assert.ok(f.context.periodoRequestGeneration > generation);
  assert.equal(f.context.reporteVistaActiva, 'diario'); assert.equal(f.context.periodoData, null);
  assert.equal(f.context.periodoLoadedKey, ''); assert.equal(f.element('periodoDesde').value, '');
  assert.deepEqual(plain(f.context.reporteDayData), [{ marker: 'diario' }]);
  assert.match(extractFunction('clearSessionState'), /resetReportePeriodo\(\)/);
  assert.match(extractFunction('switchTab'), /setReporteVista\(reporteVistaActiva\)/);
});

test('orden alfabético canónico: acentos, mayúsculas y meses cronológicos', () => {
  const f = frontend();
  // compareAlphaEs: insensible a mayúsculas/acentos, numérico para tamaños.
  assert.deepEqual(['Doral', 'árabe', 'Weston', 'sin sede', '100'].sort(f.context.compareAlphaEs), ['100', 'árabe', 'Doral', 'sin sede', 'Weston']);
  assert.deepEqual(['15', '100', '20'].sort(f.context.compareAlphaEs), ['15', '20', '100']);
  // sortMonthCatalog: calendario ENERO→DICIEMBRE, desconocidos al final, OTRO último.
  assert.deepEqual(plain(f.context.sortMonthCatalog(['OTRO', 'OCTUBRE', 'ENERO', 'septiembre ', 'OTRA COSA'])),
    ['ENERO', 'septiembre ', 'OCTUBRE', 'OTRA COSA', 'OTRO']);
  // catalogOptions: todo alfabético, catálogo ∪ datos, sin perder la selección.
  f.context.catalogRows = { campana: [{ value: 'Weston', active: true }, { value: 'Acuario', active: true }, { value: 'Zzz oculto', active: false }], medio: [], gestion: [], agente: [], mes: [] };
  assert.deepEqual(plain(f.context.catalogOptions('campana', ['Doral', 'weston-distinto'])), ['Acuario', 'Doral', 'Weston', 'weston-distinto']);
  assert.deepEqual(plain(f.context.catalogOptions('mes', ['MARZO', 'ENERO'])), ['ENERO', 'MARZO']);
  // buildPeriodSummary: catálogo y extras salen ordenados alfabéticamente.
  const data = f.context.buildPeriodSummary(
    [{ id: 1, Fecha: '01/10/2026', Medio: 'zMedio', 'Campaña': 'zCampaña', GESTION: 'zGestión' }],
    { medio: [{ value: 'aMedio', active: true }], campana: [{ value: 'aCampaña', active: true }], gestion: [{ value: 'aGestión', active: true }], agente: [], mes: [] },
    '2026-10-01', '2026-10-07');
  assert.deepEqual(plain(data.medios.map(r => r.label)), ['aMedio', 'Sin definir', 'zMedio']);
  assert.deepEqual(plain(data.campanas.map(r => r.label)), ['aCampaña', 'Sin definir', 'zCampaña']);
  assert.deepEqual(plain(data.gestiones.map(r => r.label)), ['aGestión', 'Sin definir', 'zGestión']);
  assert.deepEqual(plain(data.matriz.campanas), plain(data.campanas.map(r => r.label)));
  assert.deepEqual(plain(data.matriz.filas.map(r => r.label)), plain(data.gestiones.map(r => r.label)));
});

test('período: mutación de leads con vista abierta invalida pantalla/CSV y programa un solo recálculo', async () => {
  const { supabaseClient } = periodoConActividad();
  const f = periodFrontend({ supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  await f.context.loadReportePeriodo();
  await settle();
  assert.equal(f.context.periodoLoadedRevision, 0);
  assert.equal(f.element('periodoBtnCsv').disabled, false);
  const timersBefore = f.timers.length;
  f.context.upsertLeadInState({ id: 999, Fecha: '03/10/2026', Medio: 'Whatsapp', 'Campaña': 'Campaña A', GESTION: 'Agendado', Nombre: 'X' });
  f.context.upsertLeadInState({ id: 998, Fecha: '03/10/2026', Medio: 'Whatsapp', 'Campaña': 'Campaña A', GESTION: 'Interesado', Nombre: 'Y' });
  // Pantalla y CSV invalidados inmediatamente (nada obsoleto visible/exportable).
  assert.equal(f.context.periodoData, null);
  assert.equal(f.context.periodoLoadedRevision, -1);
  assert.equal(f.element('periodoBody').innerHTML, '');
  assert.match(f.element('periodoAviso').textContent, /Recalculando/);
  assert.equal(f.element('periodoBtnCsv').disabled, true);
  f.context.exportReportePeriodoCSV();
  assert.equal(f.downloads.length, 0);
  // Debounce: cada upsert programa un temporizador; solo el último recalcula.
  assert.ok(f.timers.length > timersBefore);
  f.timers.at(-1)();
  await Promise.resolve();
  await settle();
  assert.equal(f.context.periodoData.total, 6);
  assert.equal(f.context.periodoLoadedRevision, f.context.periodoSourceRevision);
  assert.equal(f.element('periodoBtnCsv').disabled, false);
  f.context.exportReportePeriodoCSV();
  assert.equal(f.downloads.length, 1);
});

test('período: mutación con vista oculta solo invalida y no programa recálculo', async () => {
  const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs(), reporteVistaActiva: 'diario' });
  f.element('periodoBody').innerHTML = 'intocable';
  const timersBefore = f.timers.length;
  f.context.upsertLeadInState({ id: 999, Fecha: '03/10/2026', Medio: 'Whatsapp', Nombre: 'X' });
  assert.equal(f.context.periodoSourceRevision, 1);
  assert.equal(f.timers.length, timersBefore);
  assert.equal(f.element('periodoBody').innerHTML, 'intocable');
  assert.equal(f.element('periodoBtnCsv').disabled, true);
  f.context.removeLeadFromState(999);
  assert.equal(f.context.periodoSourceRevision, 2);
  assert.equal(f.timers.length, timersBefore);
});

test('período: revisión cambiada durante el cálculo descarta la publicación y el CSV la exige', async () => {
  const { supabaseClient } = periodoConActividad();
  const f = periodFrontend({ supabaseClient, allLeads: periodLeads(), catalogRows: periodCatalogs() });
  const real = f.context.buildPeriodSummary;
  f.context.buildPeriodSummary = (...args) => { const data = real(...args); f.context.periodoSourceRevision += 1; return data; };
  await f.context.loadReportePeriodo();
  assert.equal(f.context.periodoData, null);
  assert.equal(f.context.periodoLoadedRevision, -1);
  // Recalculo limpio: publica con la revisión vigente y habilita el CSV.
  f.context.buildPeriodSummary = real;
  await f.context.loadReportePeriodo();
  await settle();
  assert.equal(f.context.periodoLoadedRevision, f.context.periodoSourceRevision);
  assert.equal(f.element('periodoBtnCsv').disabled, false);
  // Revisión desactualizada bloquea la exportación aunque el rango coincida.
  f.context.periodoSourceRevision += 1;
  f.context.exportReportePeriodoCSV();
  assert.equal(f.downloads.length, 0);
  assert.match(f.toasts.at(-1)[0], /datos cambiaron/);
  assert.equal(f.element('periodoBtnCsv').disabled, true);
});

test('período: carga y reset cancelan el recálculo pendiente; wiring en puntos centrales', async () => {
  const f = periodFrontend({ allLeads: periodLeads(), catalogRows: periodCatalogs(), reporteVistaActiva: 'diario' });
  f.context.reporteVistaActiva = 'periodo';
  f.context.markPeriodoReportDirty();
  assert.notEqual(f.context.periodoRefreshTimer, null);
  f.context.resetReportePeriodo();
  assert.equal(f.context.periodoRefreshTimer, null);
  assert.equal(f.context.periodoLoadedRevision, -1);
  assert.equal(f.element('periodoBtnCsv').disabled, true);
  // Los cuatro puntos centrales (mutación de leads, fin de carga y refresco de
  // catálogos) deben invocar la invalidación única.
  for (const name of ['upsertLeadInState', 'removeLeadFromState', 'performLoadLeadsData', 'refreshCatalogs']) {
    assert.match(extractFunction(name), /markPeriodoReportDirty\(\)/, name);
  }
});


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
  f.element('editUltimaGestion').options = [{ value: '' }];
  c.openEditLeadModal(1, 'actual');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const today = `${parts.find(p => p.type === 'day').value}/${parts.find(p => p.type === 'month').value}/${parts.find(p => p.type === 'year').value}`;
  assert.equal(f.element('editFechaUltima').value, today);
});

test('seguimiento: Teléfono visible fuera del bloque admin y selector incluye Llamada Data Dura', () => {
  const telIndex = html.indexOf('id="editTelefono"');
  const nombreIndex = html.indexOf('id="editNombre"');
  const adminIndex = html.indexOf('id="adminLeadFields"');
  assert.ok(telIndex > -1 && nombreIndex > -1 && adminIndex > -1);
  // Teléfono acompaña a Nombre en el formulario general, antes del bloque admin.
  assert.ok(telIndex > nombreIndex && telIndex < adminIndex);
  const selStart = html.indexOf('id="editUltimaGestion"');
  const selHtml = html.slice(selStart, selStart + 1500);
  for (const v of ['Llamada Data Dura', 'Llamada y WhatsApp', 'WhatsApp', 'Instagram', 'Visita Conservatorio'])
    assert.ok(selHtml.includes(`value="${v}"`), `falta la opción ${v}`);
});

test('editar lead: Telefono solo se envía cuando cambia; canal manual se respeta', async () => {
  const f = frontend({ isAdmin: false, editLeadSubmitting: false, editLeadRequestGeneration: 0, editLeadAdvisorGeneration: 0, editLeadPreviousGestion: '', currentEditOrigin: 'actual' });
  const c = f.context;
  c.editLeadNeedsAppointment = () => false;
  c.editSessionValid = () => true;
  c.formatPhone = v => String(v || '').trim();
  c.isSupabaseLive = true;
  c.upsertLeadInState = () => {};
  c.updateConnectionStatus = () => {};
  c.closeEditLeadModal = () => {};
  c.updateEditSubmitState = () => {};
  c.editUpdateErrorMessage = e => String(e?.message || '');
  const db = database({ update_lead_followup: { id: 1 } });
  c.supabaseClient = db;
  f.element('editLeadId').value = '1';
  f.element('editGestion').value = 'Información ';
  f.element('editUltimaGestion').value = 'Llamada Data Dura';
  await c.handleUpdateLead({ preventDefault() {} });
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'update_lead_followup');
  // Sin dataset (sin cambio) el teléfono no viaja: los históricos no bloquean.
  assert.equal(db.rpcCalls[0].args.p_fields.Telefono, undefined);
  assert.equal(db.rpcCalls[0].args.p_fields['ULTIMA GESTION'], 'Llamada Data Dura');
  f.element('editTelefono').value = '1 (786) 555-1234';
  f.element('editTelefono').dataset = { original: '' };
  await c.handleUpdateLead({ preventDefault() {} });
  assert.equal(db.rpcCalls.length, 2);
  assert.equal(db.rpcCalls[1].args.p_fields.Telefono, '1 (786) 555-1234');
});

test('migración canal data dura manual: trigger normaliza, RPC prioriza marca y followup admite Telefono', () => {
  const sql = readFileSync('supabase/migrations/202610020001_canal_datadura_manual_telefono.sql', 'utf8');
  assert.match(sql, /add column if not exists is_data_dura boolean/);
  assert.match(sql, /'llamada data dura'/);
  // El reporte prioriza la marca manual y solo usa Mes/Fecha en históricos NULL.
  assert.match(sql, /is_data_dura is true or \(is_data_dura is null and public\._daily_report_data_dura/);
  assert.match(sql, /"'Nombre', 'Telefono', 'GESTION'"|[']Nombre', 'Telefono', 'GESTION'/);
  assert.match(sql, /telefono_invalido/);
});

test('citas: los tres formularios piden estudiante, correo y edad opcionales', () => {
  for (const prefix of ['newAppointment', 'editAppointment', 'leadAppointment']) {
    for (const field of ['StudentName', 'ContactEmail', 'StudentAge']) {
      assert.ok(html.includes(`id="${prefix}${field}"`), `falta ${prefix}${field}`);
    }
  }
  // La pestaña Citas muestra las tres columnas y el botón de edición.
  assert.match(html, /<th class="p-3 text-left">Estudiante<\/th>/);
  assert.match(html, /<th class="p-3 text-left">Correo<\/th>/);
  assert.match(html, /<th class="p-3 text-left">Edad<\/th>/);
  assert.match(html, /onclick="editAppointmentDetails\(\$\{r\.id\}\)"/);
  // La ficha consulta los nuevos campos y permite editarlos.
  assert.match(html, /student_name, contact_email, student_age/);
  assert.match(html, /rpc\('update_lead_appointment_details'/);
});

test('appointmentDetailsFrom recoge y recorta los tres campos opcionales', () => {
  const { context: c, element } = frontend();
  element('newAppointmentStudentName').value = '  Ana Luz  ';
  element('newAppointmentContactEmail').value = ' familia@correo.com ';
  element('newAppointmentStudentAge').value = ' 10 ';
  assert.deepEqual(plain(c.appointmentDetailsFrom('newAppointment')), {
    student_name: 'Ana Luz', contact_email: 'familia@correo.com', student_age: '10'
  });
  // Prefijo sin campos/prefijo distinto devuelve cadenas vacías (sin error).
  assert.deepEqual(plain(c.appointmentDetailsFrom('sinCampos')), { student_name: '', contact_email: '', student_age: '' });
});

test('fecha de llegada: formulario editable, Mes derivado y validación futura; create_lead valida y registra gestión', () => {
  // Formulario: campo date con max = hoy Miami y Mes solo lectura derivado.
  assert.match(html, /id="newFechaLlegada"[^>]*onchange="syncNewLeadMes\(\)"/);
  assert.match(html, /<select id="newMes" disabled/);
  assert.match(html, /fechaInput\.max = miamiToday\(\)/);
  assert.match(html, /function syncNewLeadMes\(\)/);
  // Guardar: fecha futura rechazada en frontend; vacía usa hoy.
  assert.match(html, /fechaSel > hoyMiami/);
  assert.match(html, /\(fechaSel \|\| hoyMiami\)\.split\('-'\)/);
  // Backend create_lead: valida formato/pasado, deriva Mes y registra la gestión.
  const sql = readFileSync('supabase/migrations/202610020004_create_lead_fecha_gestion.sql', 'utf8');
  assert.match(sql, /fecha_llegada_invalida/);
  assert.match(sql, /llegada > hoy or llegada < date '2000-01-01'/);
  assert.match(sql, /meses\[extract\(month from llegada\)::int\]/);
  assert.match(sql, /insert into public\.lead_gestiones \(lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal, autor_name, autor_user_id, is_data_dura\)/);
  // Misma regla de canal Data Dura que el trigger de actualizaciones.
  assert.match(sql, /'llamada data dura'/);
  // Rollback documentado.
  assert.match(sql, /Rollback manual/);
});
test('citas: lectura compartida para el equipo y botones de edición solo para asesora asignada o admin', () => {
  const sql = readFileSync('supabase/migrations/202610020003_citas_lectura_equipo.sql', 'utf8').split('-- Rollback')[0];
  assert.match(sql, /using \(public\.is_active_user\(\) and public\.is_crm_user\(\)\)/);
  assert.doesNotMatch(sql, /advisor_user_id = auth\.uid\(\)/);
  // Las escrituras siguen restringidas por RPC; el frontend oculta los botones.
  assert.match(html, /canEdit = isAdmin \|\| a\.advisor_user_id === currentUser\?\.id/);
  assert.match(html, /\$\{canEdit \? `<button data-appointment-id="\$\{id\}" onclick="editAppointmentDetails/);
  assert.match(html, /\$\{scheduled && canEdit \?/);
  assert.match(html, /\(isAdmin \|\| r\.advisor_user_id === currentUser\?\.id\) \? `<button onclick="editAppointmentDetails/);
  // La ficha necesita advisor_user_id para calcular canEdit.
  assert.match(html, /advisor_name, advisor_user_id, notes, rescheduled_from_id/);
});
test('aviso de teléfono existente: solo conteo, no bloquea, dígitos cortos no consultan', async () => {
  const db = database({ check_lead_phone_occurrences: () => ({ total: 2, actuales: 1, archivados: 0, historico: 1 }) });
  const { context: c, element } = frontend({ supabaseClient: db, newPhoneCheckGeneration: 0, newPhoneCheckTimer: null });
  element('newTelefono').value = '1 (786) 555-1234';
  await c.checkNewPhoneDuplicate();
  // El número viaja normalizado (solo dígitos); nunca se muestra información del duplicado.
  assert.equal(db.rpcCalls[0].name, 'check_lead_phone_occurrences');
  assert.equal(db.rpcCalls[0].args.p_phone, '17865551234');
  assert.match(element('newPhoneWarn').textContent, /ya tiene 2 oportunidades registradas/);
  assert.match(element('newPhoneWarn').textContent, /Puedes continuar/);
  // Menos de 7 dígitos: no hay consulta y el aviso se limpia.
  element('newTelefono').value = '12345';
  await c.checkNewPhoneDuplicate();
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(element('newPhoneWarn').textContent, '');
  // El envío del formulario no depende del aviso.
  assert.doesNotMatch(html, /btnSubmitNewLead[^;]{0,200}newPhoneWarn/);
  // La migración expone solo conteos a usuarios CRM activos.
  const sql = readFileSync('supabase/migrations/202610020005_check_lead_phone_occurrences.sql', 'utf8');
  assert.match(sql, /check_lead_phone_occurrences\(p_phone text\)/);
  assert.match(sql, /is_crm_user\(\) then raise exception/);
  assert.match(sql, /regexp_replace/);
  assert.match(sql, /grant execute on function public\.check_lead_phone_occurrences\(text\) to authenticated/);
  assert.doesNotMatch(sql, /\"Nombre\"/); // sin PII en la respuesta
});

test('badge Nuevo: fecha de llegada del mes/año Miami actual, no de otros meses', () => {
  const { context: c } = frontend(); // miamiToday stubbed a 2026-09-30
  assert.ok(c.isNuevoEsteMes('30/9/2026'));
  assert.ok(c.isNuevoEsteMes('01/09/2026'));
  assert.equal(c.isNuevoEsteMes('30/9/2025'), false);
  assert.equal(c.isNuevoEsteMes('01/08/2026'), false);
  assert.equal(c.isNuevoEsteMes(''), false);
  assert.match(html, />\s*Nuevo\s*<\/span>/);
  assert.match(html, /\$\{nuevoBadge\(lead\)\}/);
});

test('canal Llamada WhatsApp: etiqueta visible nueva, valor y conteo canónicos intactos', () => {
  assert.match(html, /<option value="Llamada y WhatsApp">Llamada WhatsApp<\/option>/);
  assert.match(html, /\['Llamada y WhatsApp',num\(b\.canales,'llamada_whatsapp'\)\]/);
  assert.match(html, /'Llamadas Data Dura', 'Llamada WhatsApp', 'Total llamadas'/);
  // El historial traduce el canal almacenado a la nueva etiqueta.
  assert.match(html, /String\(g\.canal \|\| ''\) === 'Llamada y WhatsApp' \? 'Llamada WhatsApp'/);
});

test('ayuda: refleja el comportamiento actual y no repite reglas retiradas', () => {
  const help = html.slice(html.indexOf('const HELP_SECTIONS = ['), html.indexOf('let helpReturnFocus'));
  // Reglas que ya no aplican: el Mes no se elige a mano y las citas no son privadas.
  assert.doesNotMatch(help, /Elige el Mes de origen del lead/);
  assert.doesNotMatch(help, /solo ves tus propias citas/);
  assert.doesNotMatch(help, /solo ve y gestiona sus propios leads/);
  // Contenido que sí debe estar.
  assert.match(help, /Fecha de llegada/);
  assert.match(help, /El Mes se calcula solo a partir de la Fecha de llegada/);
  assert.match(help, /No admite fechas futuras/);
  assert.match(help, /Si el teléfono ya está en la base/);
  assert.match(help, /calendario completo de citas del equipo/);
  assert.match(help, /zona horaria de Miami/);
  assert.match(help, /Solo la asesora asignada a la cita \(o un administrador\) puede modificarla/);
  assert.match(help, /nombre del estudiante, un correo de contacto y su edad/);
  assert.match(help, /conserva la marca Data Dura y los datos del estudiante/);
  assert.match(help, /Registrar un lead también cuenta como gestión/);
  assert.match(help, /etiqueta verde "Nuevo"/);
  assert.match(help, /Llamada WhatsApp/);
  assert.match(help, /id: 'ayuda-campanas'/);
  // Coherencia con el formulario real: los campos de la cita existen.
  for (const field of ['newAppointmentStudentName', 'editAppointmentStudentName', 'leadAppointmentStudentName'])
    assert.ok(html.includes(`id="${field}"`), `falta el campo ${field} descrito en la ayuda`);
});

test('inactividad: aviso a 4 min, cierre a 5, multi-pestaña y registro en tabla/RPC dedicadas', () => {
  // Frontend: banner con countdown, solo para rol agente, y storage compartido.
  assert.match(html, /id="idleBanner"[^>]*role="alert"/);
  assert.match(html, /Tu sesión se cerró por 5 minutos de inactividad\./);
  assert.match(html, /IDLE_WARN_MS = 240000, IDLE_LIMIT_MS = 300000/);
  assert.match(html, /currentAccess\?\.role === 'agente'/);
  assert.match(html, /event\.key === IDLE_KEY/);
  assert.match(html, /signOut\(\{ scope: 'local' \}\)/);
  // El cierre registra el motivo concreto.
  assert.match(html, /endAgentSessionLocally\('manual_logout'\)/);
  assert.match(html, /p_reason: 'idle_timeout'/);
  assert.match(html, /sessionEndReason = 'session_invalid'/);

  // Migración: tabla con motivos controlados, sin PII extra, retención 90 días.
  const sql = readFileSync('supabase/migrations/202610020006_agent_sessions.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.agent_sessions/);
  assert.match(sql, /end_reason in \('manual_logout', 'idle_timeout', 'session_invalid'\)/);
  assert.match(sql, /ended_at < now\(\) - interval '90 days'/);
  assert.match(sql, /if access\.role <> 'agente' then return null/); // solo asesoras
  assert.match(sql, /if not public\.is_admin_user\(\) then raise exception using errcode = '42501', message = 'admin_required'/);
  assert.doesNotMatch(sql, /ip_address|user_agent/);
});


test('hotfix campera: appointmentCampusFrom existe y los guardados alcanzan la RPC correcta', async () => {
  assert.match(html, /function appointmentCampusFrom\(prefix\)/);
  const radios = [{ value: 'DORAL', checked: false }, { value: 'WESTON', checked: false }];
  const { context: c } = frontend();
  c.document.querySelector = sel => sel.startsWith('input[name="newAppointmentCampus"') ? radios.find(r => r.checked) || null : null;
  assert.equal(c.appointmentCampusFrom('newAppointment'), '');
  radios[0].checked = true;
  assert.equal(c.appointmentCampusFrom('newAppointment'), 'DORAL');

  const prepare = radioValue => {
    radios[0].checked = radioValue === 'DORAL'; radios[1].checked = radioValue === 'WESTON';
    const db = database({ create_lead: { id: 7 }, create_lead_with_appointment: { id: 9 } });
    const f = frontend({ supabaseClient: db });
    const c2 = f.context;
    const el = f.element;
    c2.document.querySelector = sel => sel.startsWith('input[name="newAppointmentCampus"') ? radios.find(r => r.checked) || null : null;
    c2.miamiToday = () => '2026-10-05';
    c2.formatPhone = v => v;
    c2.isSupabaseLive = true;
    c2.upsertLeadInState = () => {};
    c2.updateConnectionStatus = () => {};
    c2.closeNewLeadModal = () => {};
    c2.populateFilterOptions = () => {};
    c2.applyFilters = () => {};
    el('newFechaLlegada').value = '2026-10-05';
    return { db, c: c2, el };
  };

  // 1) Gestión normal (caso Loli: "Menor 5 años"): no hay campos de cita y debe llegar a create_lead.
  {
    const { db, c, el } = prepare(null);
    el('newGestion').value = 'Menor 5 años';
    await c.handleCreateLead({ preventDefault() {} });
    assert.equal(db.rpcCalls.length, 1, 'una sola llamada');
    assert.equal(db.rpcCalls[0].name, 'create_lead');
    assert.deepEqual(Object.keys(db.rpcCalls[0].args), ['p_lead']);
  }

  // 2) Agendado sin sede: no llama al backend y avisa.
  {
    const { db, c, el } = prepare(null), shown = [];
    c.showToast = (...a) => shown.push(a);
    el('newGestion').value = 'Agendado';
    el('newAppointmentDate').value = '2026-10-06T18:00';
    await c.handleCreateLead({ preventDefault() {} });
    assert.equal(db.rpcCalls.length, 0, 'sin sede no viaja');
    assert.match(shown.map(t => t[0]).join(' | '), /sede|cita/i);
  }

  // 3) Agendado con sede: viaja a la RPC atómica con campus.
  {
    const { db, c, el } = prepare('WESTON');
    el('newGestion').value = 'Agendado';
    el('newAppointmentDate').value = '2026-10-06T18:00';
    await c.handleCreateLead({ preventDefault() {} });
    assert.equal(db.rpcCalls.length, 1);
    assert.equal(db.rpcCalls[0].name, 'create_lead_with_appointment');
    assert.equal(db.rpcCalls[0].args.p_campus, 'WESTON');
    assert.equal(db.rpcCalls[0].args.p_lead.GESTION, 'Agendado');
  }
});

test('contrato RPC de citas: una asesora envia todos los nombres, incluidos UUID null', async () => {
  const expectedUpdate = ['p_advisor_user_id','p_campus','p_details','p_fields','p_id','p_notes','p_scheduled_at'];
  const expectedCreate = ['p_advisor_user_id','p_campus','p_details','p_lead_id','p_notes','p_scheduled_at'];
  const campus = { value: 'DORAL', checked: true };

  // Información -> Agendado desde Actualizar Seguimiento.
  {
    const db = database({ update_lead_with_appointment: { id: 4590, GESTION: 'Agendado' } });
    const f = frontend({
      supabaseClient: db, isAdmin: false, editLeadSubmitting: false,
      editLeadRequestGeneration: 0, editLeadPreviousGestion: 'Información', currentEditOrigin: 'actual',
    });
    const c = f.context, el = f.element;
    c.document.querySelector = sel => sel === 'input[name="editAppointmentCampus"]:checked' ? campus : null;
    c.editLeadNeedsAppointment = () => true;
    c.editLeadStaysAgendado = () => false;
    c.editSessionValid = () => true;
    c.formatPhone = v => v;
    c.isSupabaseLive = true;
    c.upsertLeadInState = () => {};
    c.updateConnectionStatus = () => {};
    c.closeEditLeadModal = () => {};
    c.populateFilterOptions = () => {};
    c.applyFilters = () => {};
    c.updateEditSubmitState = () => {};
    c.formatSaveError = e => e?.message || '';
    el('editLeadId').value = '4590';
    el('editGestion').value = 'Agendado';
    el('editAppointmentDate').value = '2026-10-10T10:00';
    await c.handleUpdateLead({ preventDefault() {} });
    assert.equal(db.rpcCalls.length, 1);
    assert.equal(db.rpcCalls[0].name, 'update_lead_with_appointment');
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), expectedUpdate);
    assert.equal(db.rpcCalls[0].args.p_advisor_user_id, null);
  }

  // Nueva cita desde la ficha de un lead ya Agendado.
  {
    const db = database({ create_lead_appointment: { id: 11 } });
    const f = frontend({ supabaseClient: db, isAdmin: false, currentViewId: 4590, pendingAppointmentMutations: new Map() });
    const c = f.context, el = f.element;
    c.document.querySelector = sel => sel === 'input[name="leadAppointmentCampus"]:checked' ? campus : null;
    c.invalidateCitasCache = () => {};
    c.loadLeadAppointments = async () => {};
    el('leadAppointmentDate').value = '2026-10-11T10:00';
    await c.createLeadAppointment({ preventDefault() {}, target: { reset() {} } });
    assert.equal(db.rpcCalls.length, 1);
    assert.equal(db.rpcCalls[0].name, 'create_lead_appointment');
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), expectedCreate);
    assert.equal(db.rpcCalls[0].args.p_advisor_user_id, null);
  }

  // El admin usa las mismas firmas, pero envia el asesor elegido.
  {
    const db = database({ update_lead_with_appointment: { id: 4590, GESTION: 'Agendado' } });
    const f = frontend({ supabaseClient: db, isAdmin: true, editLeadSubmitting: false, editLeadRequestGeneration: 0, editLeadPreviousGestion: 'Información', currentEditOrigin: 'actual', leadAppointmentAdvisors: [{ user_id: 'advisor-2' }] });
    const c = f.context, el = f.element;
    c.document.querySelector = sel => sel === 'input[name="editAppointmentCampus"]:checked' ? campus : null;
    Object.assign(c, { editLeadNeedsAppointment: () => true, editLeadStaysAgendado: () => false, editSessionValid: () => true, formatPhone: v => v, isSupabaseLive: true, upsertLeadInState() {}, updateConnectionStatus() {}, closeEditLeadModal() {}, populateFilterOptions() {}, applyFilters() {}, updateEditSubmitState() {}, formatSaveError: e => e?.message || '' });
    el('editLeadId').value = '4590'; el('editGestion').value = 'Agendado'; el('editAppointmentDate').value = '2026-10-10T10:00'; el('editAppointmentAdvisor').value = 'advisor-2';
    await c.handleUpdateLead({ preventDefault() {} });
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), expectedUpdate);
    assert.equal(db.rpcCalls[0].args.p_advisor_user_id, 'advisor-2');
  }
  {
    const db = database({ create_lead_appointment: { id: 12 } });
    const f = frontend({ supabaseClient: db, isAdmin: true, currentViewId: 4590, pendingAppointmentMutations: new Map() });
    const c = f.context, el = f.element;
    c.document.querySelector = sel => sel === 'input[name="leadAppointmentCampus"]:checked' ? campus : null;
    c.invalidateCitasCache = () => {}; c.loadLeadAppointments = async () => {};
    el('leadAppointmentDate').value = '2026-10-11T10:00'; el('leadAppointmentAdvisor').value = 'advisor-2';
    await c.createLeadAppointment({ preventDefault() {}, target: { reset() {} } });
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), expectedCreate);
    assert.equal(db.rpcCalls[0].args.p_advisor_user_id, 'advisor-2');
  }
});

test('mutaciones de cita ejecutan sus RPC con contratos completos', async () => {
  const appointment = { id: 21, advisor_user_id: 'user-test', student_name: 'Ana', contact_email: '', student_age: 10, campus: 'DORAL' };
  const setup = (rpcName, prompts = []) => {
    const db = database({ [rpcName]: { id: 21 } });
    const f = frontend({
      supabaseClient: db, currentViewId: 4590, leadAppointmentsCache: [appointment],
      pendingAppointmentMutations: new Map(), prompt: () => prompts.shift(),
    });
    const c = f.context;
    c.document.querySelector = () => null;
    c.invalidateCitasCache = () => {};
    c.loadLeadAppointments = async () => {};
    return { db, c, el: f.element };
  };

  {
    const { db, c } = setup('update_lead_appointment_details', ['Nicolas', 'nicolas@example.com', '10']);
    await c.editAppointmentDetails(21);
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), ['p_details','p_id']);
  }
  {
    const { db, c } = setup('update_lead_appointment_campus', ['Weston']);
    await c.editAppointmentCampus(21);
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), ['p_campus','p_id']);
    assert.equal(db.rpcCalls[0].args.p_campus, 'WESTON');
  }
  {
    const { db, c } = setup('set_lead_appointment_status');
    await c.setLeadAppointmentStatus(21, 'ASISTIO');
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), ['p_id','p_notes','p_status']);
  }
  {
    const { db, c, el } = setup('reschedule_lead_appointment');
    el('reschedule-21').value = '2026-10-12T10:00';
    await c.rescheduleLeadAppointment(21);
    assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), ['p_id','p_notes','p_scheduled_at']);
  }
});

test('seguimiento y cambio de sede se guardan con una sola RPC atomica', async () => {
  const sql = readFileSync('supabase/migrations/202610050002_atomic_followup_appointment_campus.sql', 'utf8');
  assert.match(sql, /updated := public\.update_lead_followup\(p_id, p_fields\);[\s\S]*perform public\.update_lead_appointment_campus\(p_appointment_id, p_campus\);/);
  assert.match(sql, /appointment_lead_id <> p_id/);
  assert.match(sql, /revoke all on function public\.update_lead_followup_with_appointment_campus[\s\S]*from public, anon/);

  const db = database({ update_lead_followup_with_appointment_campus: { id: 4590, GESTION: 'Agendado' } });
  const f = frontend({
    supabaseClient: db, isAdmin: false, editLeadSubmitting: false, editLeadRequestGeneration: 0,
    editLeadPreviousGestion: 'Agendado', currentEditOrigin: 'actual',
    editExistingAppointment: { id: 21, advisor_user_id: 'user-test', campus: 'DORAL' },
  });
  const c = f.context, el = f.element;
  c.document.querySelector = sel => sel === 'input[name="editExistingCampus"]:checked' ? { value: 'WESTON' } : null;
  Object.assign(c, { editLeadNeedsAppointment: () => false, editLeadStaysAgendado: () => true, editSessionValid: () => true, formatPhone: v => v, isSupabaseLive: true, upsertLeadInState() {}, updateConnectionStatus() {}, closeEditLeadModal() {}, populateFilterOptions() {}, applyFilters() {}, updateEditSubmitState() {}, invalidateCitasCache() {}, formatSaveError: e => e?.message || '' });
  el('editLeadId').value = '4590'; el('editGestion').value = 'Agendado';
  await c.handleUpdateLead({ preventDefault() {} });
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, 'update_lead_followup_with_appointment_campus');
  assert.deepEqual(Object.keys(db.rpcCalls[0].args).sort(), ['p_appointment_id','p_campus','p_fields','p_id']);
});

test('hora de citas se interpreta y se muestra siempre en Miami', () => {
  const { context: c } = frontend();
  assert.equal(c.appointmentInputISO('2026-01-15T10:00'), '2026-01-15T15:00:00.000Z');
  assert.equal(c.appointmentInputISO('2026-07-15T10:00'), '2026-07-15T14:00:00.000Z');
  assert.equal(c.appointmentInputISO('2026-03-08T02:30'), null, 'hora inexistente por inicio DST');
  assert.equal(c.appointmentInputISO('2026-11-01T01:30'), null, 'hora ambigua por fin DST');
  assert.match(c.appointmentLocal('2026-07-15T14:00:00.000Z'), /10:00/);
  assert.match(c.appointmentLocal('2026-01-15T15:00:00.000Z'), /10:00/);
});

test('hotfix alta atomica: create_lead_with_appointment usa la interna y los bloques condicionales no rompen otros guardados', () => {
  const sql = readFileSync('supabase/migrations/202610050001_fix_atomic_appointment_creation.sql', 'utf8');
  assert.match(sql, /create or replace function public\._create_lead_with_gestion\(p_lead jsonb\)/);
  assert.match(sql, /created := public\._create_lead_with_gestion\(p_lead\);\n  perform public\.create_lead_appointment/);
  assert.match(sql, /revoke all on function public\._create_lead_with_gestion\(jsonb\) from public, anon, authenticated, service_role/);
  // La traduccion de errores evita mensajes tecnicos en el navegador.
  assert.match(html, /function formatSaveError\(error, agendado\)/);
  assert.match(html, /Correo de contacto no válido/);
  assert.match(html, /Edad no válida/);
  assert.match(html, /Asesor no activo|campaign_not_in_catalog/);
  // Los bloques de cita dentro del formulario no pueden quedar required+ocultos:
  assert.match(html, /function setBlockControls\(container, disabled\)/);
  assert.match(html, /setBlockControls\(block, !visible\)/);
  assert.match(html, /setBlockControls\(block, !needs\)/);
  assert.match(html, /setBlockControls\(block, false\)/);
  // Los campos de detalles opcionales se limpian al ocultar la cita.
  assert.match(html, /document\.getElementById\('newAppointment'\+suffix\)/);
  assert.match(html, /document\.getElementById\('editAppointment' \+ suffix\)/);
});

test('editar lead ya agendado: sede de la cita visible y editable sin crear cita nueva', async () => {
  assert.match(html, /id="editExistingCampusBlock" class="hidden sm:col-span-2 border/);
  assert.match(html, /name="editExistingCampus" value="DORAL"/);
  assert.match(html, /name="editExistingCampus" value="WESTON"/);
  assert.match(html, /loadEditExistingAppointment\(leadId\)/);
  assert.match(html, /update_lead_followup_with_appointment_campus/);
  // No duplica citas: sigue mostrándose el aviso "ya estaba agendado".
  assert.match(html, /id="editAppointmentAlreadyNotice"/);

  // Comportamiento runtime: lead ya agendado con una cita vigente Doral.
  const d = new Date('2026-03-05T12:00:00.000Z');
  d.toLocaleString = () => '3/5/2026, 8:00';
  const appt = { id: 9, lead_id: 1, status: 'PROGRAMADA', scheduled_at: d.toISOString(), advisor_name: 'Ana', advisor_user_id: 'user-test', campus: 'DORAL' };
  const db = database({ lead_appointments: [appt] });
  const checked = [];
  const radios = ['DORAL', 'WESTON'].map((v, i) => ({
    value: v, _checked: false, disabled: false,
    set checked(b) { this._checked = b; checked[i] = b; },
    get checked() { return this._checked; },
  }));
  const { context: c, element } = frontend({
    supabaseClient: db, isAdmin: false,
    editLeadRequestGeneration: 0, editLeadPreviousGestion: 'AGENDADO',
  });
  c.document.querySelectorAll = sel => sel === 'input[name="editExistingCampus"]' ? radios : [];
  await c.loadEditExistingAppointment(1);
  assert.deepEqual(checked, [true, false], 'la sede actual queda marcada');
  assert.equal(c.editExistingAppointment.id, 9);

  // Varios citas vigentes o ninguna: radioses deshabilitadas y aviso.
  const db2 = database({ lead_appointments: [appt, { ...appt, id: 10 }] });
  const f2 = frontend({ supabaseClient: db2, editLeadRequestGeneration: 0 });
  const radios2 = ['DORAL', 'WESTON'].map(v => ({ value: v, checked: false, disabled: false }));
  f2.context.document.querySelectorAll = () => radios2;
  await f2.context.loadEditExistingAppointment(1);
  assert.equal(f2.context.editExistingAppointment, null);
  assert.ok(radios2.every(r => r.disabled));
});

test('data dura sync: trigger solo toca citas PROGRAMADA, corrección guardada y RPCs con permisos', () => {
  const sql = readFileSync('supabase/migrations/202610090001_data_dura_appointment_sync.sql', 'utf8');
  // Trigger: convive con los existentes, AFTER UPDATE OF GESTION, solo PROGRAMADA.
  assert.match(sql, /after update of "GESTION" on public\.leads/i);
  assert.match(sql, /where lead_id = new\.id and status = 'PROGRAMADA'/);
  assert.match(sql, /like 'AGENDAD%DATA%DURA%'/);
  assert.match(sql, /is distinct from/);
  // Corrección guardada: espera exactamente 1 caso a true y 0 a false; aborta si no.
  assert.match(sql, /v_to_true <> 1 or v_to_false <> 0/);
  assert.match(sql, /dd_appointment_fix_incomplete/);
  // RPC actividad: agregada, permisos y scope temporal correcto.
  assert.match(sql, /create or replace function public\.management_period_summary\(p_desde date, p_hasta date\)/);
  assert.match(sql, /g\.fecha_gestion between p_desde and p_hasta/);
  assert.match(sql, /scheduled_at at time zone 'America\/New_York'/);
  assert.match(sql, /revoke all on function public\.management_period_summary\(date, date\) from public, anon/);
  assert.match(sql, /grant execute on function public\.management_period_summary\(date, date\) to authenticated/);
  assert.doesNotMatch(sql, /"Nombre"|"Telefono"|gestion_anterior/); // sin PII ni texto libre en salidas
  // Diario: solo aditivo (claves nuevas, resto intacto).
  assert.match(sql, /'agendados_gestionados_dia'/);
  assert.match(sql, /'agendados_gestionados_data_dura'/);
  assert.match(sql, /count\(distinct lead_id\)/);
});

test('citas por sede: requerida en las 3 rutas, filro/KPIs, corrección y reporte desglosado', () => {
  const sql = readFileSync('supabase/migrations/202610020007_appointment_campus.sql', 'utf8');
  assert.match(sql, /add column if not exists campus text/);
  assert.match(sql, /add constraint lead_appointments_campus_check check \(campus in \('DORAL', 'WESTON'\)\)/);
  assert.match(sql, /campus_invalid/);
  assert.match(sql, /create or replace function public\.update_lead_appointment_campus\(p_id bigint, p_campus text\)/);
  assert.match(sql, /'agendados_doral'/);
  assert.match(sql, /'agendados_weston_data_dura'/);
  // El reschedule conserva la sede (regresión corregida desde que existía el campo).
  assert.match(sql, /old_appointment\.campus/);

  // Frontend: radios obligatorios en las tres rutas
  for (const prefix of ['newAppointment', 'editAppointment', 'leadAppointment'])
    assert.match(html, new RegExp(`name="${prefix + 'Campus'}" value="DORAL" required`));
  // Se rechaza la cita nueva sin sede
  assert.match(html, /appointmentCampusFrom\('newAppointment'\)/);
  assert.match(html, /appointmentCampusFrom\('editAppointment'\)/);
  assert.match(html, /appointmentCampusFrom\('leadAppointment'\)/);
  // Tabla, filtro y KPIs por sede; corrección con RPC dedicada
  assert.match(html, /<th class="p-3 text-left">Sede<\/th>/);
  assert.match(html, /id="citasSede"/);
  assert.match(html, /\['Doral',rows\.filter\(r=>r\.campus==='DORAL'&&!r\.is_data_dura\)\.length\]/);
  assert.match(html, /update_lead_appointment_campus/);
  // Lead ya Agendado: el modal de Actualizar Seguimiento tambien seda la cita
  // vigente sin crear otra (bloque con radios reutilizando la RPC existente).
  assert.match(html, /id="editExistingCampusBlock"/);
  assert.match(html, /name="editExistingCampus" value="DORAL"/);
  assert.match(html, /editLeadStaysAgendado\(\)/);
  assert.match(html, /loadEditExistingAppointment\(leadId\)/);
  assert.match(html, /update_lead_followup_with_appointment_campus/);
});

test('migración de detalles de cita: columnas, p_details, validación, edición y reschedule conservador', () => {
  const sql = readFileSync('supabase/migrations/202610020002_appointment_student_details.sql', 'utf8');
  assert.match(sql, /add column if not exists student_name text/);
  assert.match(sql, /add column if not exists contact_email text/);
  assert.match(sql, /add column if not exists student_age smallint/);
  assert.match(sql, /appointment_email_invalid/);
  assert.match(sql, /appointment_age_invalid/);
  // Validación de edad acotada 0-120.
  assert.match(sql, /v_age < 0 or v_age > 120/);
  // Las tres rutas de creación reciben p_details hacia la RPC central.
  assert.match(sql, /create function public\.create_lead_appointment\(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null, p_details jsonb/);
  assert.match(sql, /perform public\.create_lead_appointment\(created\.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details\)/);
  assert.match(sql, /perform public\.create_lead_appointment\(updated\.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details\)/);
  // Corrección posterior sólo para asesor asignado o admin.
  assert.match(sql, /create or replace function public\.update_lead_appointment_details/);
  // Reschedule conserva Data Dura y los datos del estudiante (regresión corregida).
  assert.match(sql, /old_appointment\.is_data_dura, old_appointment\.student_name, old_appointment\.contact_email, old_appointment\.student_age/);
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

function reportFixture(report, notes = []) {
  const db = database({ daily_management_report: report, daily_report_notes: notes });
  const f = frontend({ supabaseClient: db, currentMainTab: 'reporte' });
  f.element('reporteFecha').value = '2026-03-05';
  return { ...f, db };
}
const advisor = (name, id, n = 1) => ({ autor_name: name, autor_user_id: id, gestionados: n, llamadas: { total: n + 1 }, citas: { total_agendados: n + 2, visitas: n + 3 }, inscritos: { total: n + 4 }, procedencia: { Whatsapp: n } });

test('reporte RPC usa la fecha y pinta los cuatro KPIs', async () => {
  const f = reportFixture({ asesoras: [advisor('Ana', 'a', 2), advisor('Bea', 'b', 3)] }); await f.context.loadReporteDiario();
  assert.deepEqual(plain(f.db.rpcCalls[0]), { name: 'daily_management_report', args: { p_fecha: '2026-03-05', p_autor_user_id: null } });
  assert.match(f.element('reporteAuto').innerHTML, /Gestiones realizadas.*5/); assert.match(f.element('reporteAuto').innerHTML, /Total llamadas.*7/); assert.match(f.element('reporteAuto').innerHTML, /Total agendados.*9/); assert.match(f.element('reporteAuto').innerHTML, /Visitas.*11/); assert.doesNotMatch(f.element('reporteAuto').innerHTML, /Total inscritos/);
});
test('comparativa RPC muestra campos y detalle las cuatro tablas y notas', async () => {
  const f = reportFixture({ asesoras: [advisor('Ana', 'a')] }, [{ id: 4, autor_name: 'Ana', problemas: 'p', observaciones: 'o' }]); await f.context.loadReporteDiario(); const html = f.element('reporteAuto').innerHTML;
  for (const text of ['Ana', 'Procedencia', 'Canales', 'Detalle WhatsApp', 'Citas y resultados', 'p', 'o']) assert.match(html, new RegExp(text));
  // Retiradas del reporte diario: inscripciones y los dos canales en desuso.
  for (const text of ['Inscripciones', 'Visita Conservatorio', 'Sin clasificar', 'Total inscritos']) assert.doesNotMatch(html, new RegExp(text));
  assert.match(html, /Ana — 1 gestiones/); // gestiones del bloque, sin la clave vieja rota
});
test('filtro de asesora reconsulta RPC y deja una sola fila', async () => {
  const f = reportFixture(args => ({ asesoras: [advisor('Ana', 'a'), advisor('Bea', 'b')].filter(x => !args.p_autor_user_id || x.autor_user_id === args.p_autor_user_id) })); await f.context.loadReporteDiario(); f.element('reporteAsesora').value = 'a'; await f.context.loadReporteDiario();
  assert.deepEqual(plain(f.db.rpcCalls.at(-1).args), { p_fecha: '2026-03-05', p_autor_user_id: 'a' }); assert.match(f.element('reporteAuto').innerHTML, /Ana/); assert.doesNotMatch(f.element('reporteAuto').innerHTML, /Bea/);
});
test('CSV del reporte v2 exporta columnas nuevas y totaliza los bloques visibles', async () => {
  const a = { ...advisor('Ana', 'a', 2), procedencia: { WhatsApp: 1, 'Facebook/Instagram': 2, CogniTalking: 3, 'Directo o Referido': 4, Otros: 5 }, llamadas: { del_dia: 1, data_dura: 2, llamada_whatsapp: 3, total: 6 }, citas: { agendados_dia: 1, agendados_data_dura: 2, total_agendados: 3, visitas: 4, no_asistieron: 5, canceladas: 6, reprogramadas: 7 }, inscritos: { del_dia: 1, data_dura: 2, total: 3 } };
  const f = reportFixture({ asesoras: [a, { ...a, autor_name: 'Bea', autor_user_id: 'b' }] }); await f.context.loadReporteDiario(); f.context.exportReporteDiarioCSV();
  const text = new TextDecoder().decode(await f.downloads[0].blob.arrayBuffer()); const rows = decodeCSV(text.slice(1));
  assert.deepEqual(rows[4].slice(0, 3), ['Asesora', 'Gestiones realizadas', 'WhatsApp']); assert.ok(rows[4].includes('Problemas')); assert.deepEqual(rows.at(-1).slice(0, 3), ['TOTAL', '4', '2']);
});
test('reporte RPC vacío, cargando y error muestran estado sin romper', async () => {
  const empty = reportFixture({ asesoras: [] }); await empty.context.loadReporteDiario(); assert.match(empty.element('reporteAuto').innerHTML, /Sin gestiones/);
  const failed = reportFixture(null); failed.db.rpc = async () => ({ data: null, error: { message: 'rpc failed' } }); await failed.context.loadReporteDiario(); assert.match(failed.element('reporteAuto').innerHTML, /No se pudo cargar/);
});

test('CSV reporte: fila TOTAL suma las 28 columnas numericas y cuadra con las 31 cabeceras (gestion, agenda, whatsapp y canales)', async () => {
  const full = (uid, name) => ({ autor_user_id: uid, autor_name: name, gestionados: 1, procedencia: { WhatsApp: 1, 'Facebook/Instagram': 1, CogniTalking: 1, 'Directo o Referido': 1, Otros: 1 }, llamadas: { del_dia: 1, data_dura: 1, llamada_whatsapp: 1, total: 3 }, whatsapp: { nuevos: 1, gestionados: 1, total: 2 }, canales: { llamada: 1, data_dura: 1, llamada_whatsapp: 1, whatsapp: 2, instagram: 0, visita: 0, sin_clasificar: 0, total: 5 }, citas: { agendados_dia: 1, agendados_data_dura: 1, agendados_gestionados_dia: 2, agendados_gestionados_data_dura: 1, agendados_doral: 1, agendados_doral_data_dura: 1, agendados_weston: 1, agendados_weston_data_dura: 1, total_agendados: 2, visitas: 1, no_asistieron: 1, canceladas: 1, reprogramadas: 1 }, inscritos: { del_dia: 1, data_dura: 1, total: 2 } });
  const f = reportFixture({ asesoras: [full('a', 'Ana'), full('b', 'Bea')] });
  await f.context.loadReporteDiario(); f.context.exportReporteDiarioCSV();
  const rows = decodeCSV(new TextDecoder().decode(await f.downloads[0].blob.arrayBuffer()).slice(1));
  const headers = rows[4], total = rows.at(-1), col = n => Number(total[headers.indexOf(n)]);
  assert.equal(headers.length, 31); assert.equal(total.length, 31);
  assert.equal(col('Gestiones realizadas'), 2); assert.equal(col('Agendados Doral'), 2); assert.equal(col('Agendados Data Dura Weston'), 2);
  assert.equal(col('Total agendados'), 4); assert.equal(col('Reprogramadas'), 2);
  assert.equal(headers.includes('Inscritos del día'), false, 'inscripciones fuera del CSV diario');
  assert.equal(col('Pasados a Agendado hoy'), 4); assert.equal(col('Pasados a Agendado Data Dura hoy'), 2);
  assert.equal(col('WhatsApp nuevos hoy'), 2); assert.equal(col('WhatsApp gestionados hoy'), 2); assert.equal(col('Total WhatsApp'), 4);
  // Total canales solo suma las categorias visibles: 1+1+1+2+0 = 5 por asesora.
  assert.equal(col('Total canales'), 10);
  assert.equal(col('Canal Instagram'), 0);
  const panel = f.element('reporteAuto').innerHTML;
  assert.match(panel, /Agendados hoy/);
  assert.doesNotMatch(panel, /programadas hoy/);
  assert.match(panel, /WhatsApp nuevos hoy/); assert.match(panel, /Total WhatsApp/);
  assert.match(panel, /Canales/); assert.match(panel, /Detalle WhatsApp/);
  for (const text of ['Sin clasificar', 'Visita Conservatorio', 'Inscripciones']) assert.doesNotMatch(panel, new RegExp(text));
  // comparativa: total por asesora desde el contenido real del bloque.
  assert.match(panel, /Ana — 1 gestiones/);
  // Procedencia: CogniTalking y Otros ocultos en pantalla (siguen en CSV).
  assert.doesNotMatch(panel, /CogniTalking/);
  assert.match(panel, /Directo o Referido/);
});

test('canales: migracion cierra la contabilidad (canales excluyentes, fallback y reconciliacion guardada)', () => {
  const sql = readFileSync('supabase/migrations/202610090003_canal_cierre_contable_reporte.sql', 'utf8');
  // Bloque canales excluyente con total construido como suma de partes.
  assert.match(sql, /'canales', jsonb_build_object/);
  assert.match(sql, /'sin_clasificar', blocks\.c_sin_clasificar/);
  assert.match(sql, /blocks\.wa_nuevos \+ blocks\.wa_gestionados \+ blocks\.c_instagram \+ blocks\.c_visita \+ blocks\.c_sin_clasificar/);
  // Instagram y visita contados solo por canal (no procedencia).
  assert.match(sql, /canal = 'instagram'/);
  assert.match(sql, /canal = 'visita conservatorio'/);
  // Fallback de creacion: solo canal vacio + procedencia whatsapp.
  assert.match(sql, /btrim\(coalesce\(v_canal, ''\)\) = '' and lower\(btrim\(coalesce\(created\."Medio", ''\)\)\) in \('whatsapp', 'whatsapp nuevo'\)/);
  // Reconciliacion guardada: solo iniciales sin canal con medio whatsapp; verifica remanente 0.
  assert.match(sql, /update public\.lead_gestiones g set canal = 'WhatsApp'/);
  assert.match(sql, /g\.gestion_anterior is null\s+and btrim\(coalesce\(g\.canal, ''\)\) = ''/);
  assert.match(sql, /whatsapp_canal_fix_incomplete/);
  // Funciones y permisos consistentes.
  assert.match(sql, /create or replace function public\._create_lead_with_gestion\(p_lead jsonb\)/);
  assert.match(sql, /grant execute on function public\.daily_management_report\(date, uuid\) to authenticated/);
  // Sin PII en las salidas.
  assert.doesNotMatch(sql, /"Nombre"|"Telefono"/);
});

test('whatsapp gestión: canal inicial en crear, preselección por Medio y RPC con bloque aditivo', () => {
  const f = frontend({});
  // Preselección: Medio WhatsApp (o variante) fija la gestión inicial WhatsApp.
  f.element('newMedio').value = 'Whatsapp';
  f.element('newUltimaGestion').value = 'Llamada';
  f.context.syncNewUltimaGestion();
  assert.equal(f.element('newUltimaGestion').value, 'WhatsApp');
  // Medio no WhatsApp: no toca la elección de la asesora.
  f.element('newMedio').value = 'Instagram';
  f.element('newUltimaGestion').value = 'Llamada';
  f.context.syncNewUltimaGestion();
  assert.equal(f.element('newUltimaGestion').value, 'Llamada');
  // SQL: separación nuevos (gestion_anterior IS NULL) vs gestionados, sin duplicar Llamada y WhatsApp.
  const sql = readFileSync('supabase/migrations/202610090002_whatsapp_gestion_report.sql', 'utf8');
  assert.match(sql, /gestion_anterior\b/);
  assert.match(sql, /canal = 'whatsapp' and gestion_anterior is null/);
  assert.match(sql, /canal = 'whatsapp' and gestion_anterior is not null/);
  assert.match(sql, /'whatsapp', jsonb_build_object/);
  assert.match(sql, /'nuevos', blocks\.wa_nuevos/);
  assert.match(sql, /'gestionados', blocks\.wa_gestionados/);
  assert.match(sql, /'total', blocks\.wa_nuevos \+ blocks\.wa_gestionados/);
  assert.match(sql, /revoke all on function public\.daily_management_report\(date, uuid\) from public, anon/);
});

test('export del reporte exige datos coherentes: bloqueado con filtros cambiados o tras error de carga', async () => {
  const f = reportFixture({ asesoras: [advisor('Ana', 'a')] });
  await f.context.loadReporteDiario();
  f.element('reporteFecha').value = '2026-03-06';
  f.context.exportReporteDiarioCSV();
  assert.equal(f.downloads.length, 0);
  assert.match(f.toasts.at(-1)?.[0] || '', /carg(i|á)ndo|Actualiza/i);
  f.element('reporteFecha').value = '2026-03-05';
  const origRpc = f.db.rpc.bind(f.db);
  f.db.rpc = async () => ({ data: null, error: { message: 'down' } });
  await f.context.loadReporteDiario();
  f.context.exportReporteDiarioCSV();
  assert.equal(f.downloads.length, 0);
  f.db.rpc = origRpc; await f.context.loadReporteDiario();
  f.context.exportReporteDiarioCSV();
  assert.equal(f.downloads.length, 1);
});

test('si falla la lectura de notas, el reporte avisa y desactiva la edicion (sin sobrescribir notas)', async () => {
  const db = database({ daily_management_report: { asesoras: [advisor('Ana', 'a')] }, daily_report_notes: [] }, { fail: q => q.table === 'daily_report_notes' });
  const f = frontend({ supabaseClient: db, currentMainTab: 'reporte', isAdmin: true });
  f.element('reporteFecha').value = '2026-03-05';
  await f.context.loadReporteDiario();
  const html = f.element('reporteAuto').innerHTML;
  assert.match(html, /Ana/);
  assert.doesNotMatch(html, /reporte-problemas-0/);
  assert.match(html + (f.element('reporteAviso').textContent || ''), /notas/i);
});

test('notas emparejadas por autor_user_id: renombre no desvincula, bloque sin uid no editable, delete por id via uid', async () => {
  const f = reportFixture({ asesoras: [advisor('Ana', 'a'), { ...advisor('SoloCatalogo', '', 1), autor_user_id: '' }] }, [{ id: 9, autor_user_id: 'a', autor_name: 'Ana Antigua', problemas: 'problema-uid-9', observaciones: 'obs-uid-9', report_date: '2026-03-05' }]);
  f.context.isAdmin = true;
  await f.context.loadReporteDiario();
  const html = f.element('reporteAuto').innerHTML;
  assert.match(html, /problema-uid-9/, 'la nota del uid a se ve aunque el nombre guardado ya no coincida');
  assert.ok(html.indexOf('problema-uid-9') < html.indexOf('SoloCatalogo'), 'la nota queda en el bloque de Ana');
  assert.doesNotMatch(html, /reporte-problemas-1/, 'sin uid el admin no edita');
  await f.context.deleteReporteNota(0);
  assert.deepEqual(plain(f.db.rpcCalls.find(c => c.name === 'delete_daily_report_note')), { name: 'delete_daily_report_note', args: { p_note_id: 9 } });
});

test('errores de nota se muestran traducidos, no crudos', async () => {
  const f = reportFixture({ asesoras: [advisor('Ana', 'a')] });
  f.context.isAdmin = true;
  await f.context.loadReporteDiario();
  const origRpc = f.db.rpc.bind(f.db);
  f.db.rpc = async (name, args) => name === 'upsert_daily_report_note' ? { data: null, error: { message: 'advisor_name_ambiguous' } } : origRpc(name, args);
  await f.context.saveReporteNota(0);
  const aviso = f.element('reporteAviso').textContent || '';
  assert.doesNotMatch(aviso, /advisor_name_ambiguous|42501|P0002/);
  assert.match(aviso, /asesora/i);
  assert.equal(typeof f.context.reporteNotaErrorMsg({ message: 'own_note_today_required' }), 'string');
  assert.match(f.context.reporteNotaErrorMsg({ message: 'own_note_today_required' }), /hoy/i);
});

test('reporte: textareas limitados a 5000, aviso accesible, fecha de cabecera civil y nombres de fichero en Miami', () => {
  assert.match(html, /id="reporteAviso"[^>]*aria-live="polite"/);
  assert.match(html, /id="reporte-problemas-\$\{i\}"[^>]*maxlength="5000"/);
  assert.match(html, /`Leads_Sociedad_Actoral_\$\{miamiToday\(\)\}\.csv`/);
  assert.match(html, /`Historical_Summary_\$\{miamiToday\(\)\}\.csv`/);
  assert.match(html, /new Date\(`\$\{fecha\}T12:00:00Z`\)/);
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
  c.reporteLoadedKey = '|'; // exportReporteDiarioCSV solo exporta si los datos corresponden a los filtros visibles
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

// ---------------------------------------------------------------------------
// Una sola cita PROGRAMADA por lead (indice unico parcial) y borrado admin.
// La garantia real esta en la migracion; aqui se comprueba que el formulario
// nunca se ofrece sin conocer el estado y que el borrado toca una sola cita.
// ---------------------------------------------------------------------------
const citaCancelada = { id: 31, lead_id: 7, scheduled_at: '2026-10-24T18:10:00.000Z', status: 'CANCELADA', advisor_name: 'Loli', campus: 'DORAL', student_name: 'Gillary Meza' };
const citaProgramada = { id: 32, lead_id: 7, scheduled_at: '2026-10-24T14:00:00.000Z', status: 'PROGRAMADA', advisor_name: 'Loli', campus: 'DORAL', student_name: 'Gillary Meza' };
const bloqueadoEn = c => vm.runInContext('leadAppointmentCreateBlocked', c);

test('cita unica: el formulario se abre fail-closed y solo con cero PROGRAMADA', () => {
  // isAgendadoGestion se reasigna en el contexto: llega extractada desde el HTML.
  const estado = (phase, cache, agendado = true) => {
    const f = frontend({ leadAppointmentsCache: cache });
    f.context.isAgendadoGestion = () => agendado;
    f.context.updateLeadAppointmentCreateState({ GESTION: 'AGENDADO' }, phase);
    return { bloqueado: bloqueadoEn(f.context), aviso: f.element('leadAppointmentNotice').textContent };
  };
  // Mientras no se sabe si hay cita activa, el formulario esta cerrado.
  assert.equal(estado('loading', []).bloqueado, true);
  assert.match(estado('loading', []).aviso, /Comprobando/);
  // Ante error de lectura tambien: fail-closed, no fail-open.
  assert.equal(estado('error', []).bloqueado, true);
  assert.match(estado('error', []).aviso, /No se pudo verificar/);
  // Con una PROGRAMADA sigue cerrado y explica como desbloquear.
  const conActiva = estado('ready', [citaProgramada, citaCancelada]);
  assert.equal(conActiva.bloqueado, true);
  assert.match(conActiva.aviso, /ya tiene una cita programada/);
  // Sin PROGRAMADA se abre; las historicas no bloquean.
  const soloHistoricas = estado('ready', [citaCancelada]);
  assert.equal(soloHistoricas.bloqueado, false);
  // Un lead no agendado no puede crear citas.
  assert.equal(estado('ready', [], false).bloqueado, true);
});

test('cita admin: eliminar borra una sola cita, con confirmacion explicita', async () => {
  const base = (over = {}) => frontend({
    supabaseClient: database({}), isAdmin: true, currentViewId: 7,
    pendingAppointmentMutations: new Map(), leadAppointmentsCache: [citaProgramada, citaCancelada], ...over,
  });
  const preparar = c => { c.invalidateCitasCache = () => {}; c.loadLeadAppointments = async () => {}; return c; };

  // Un no-admin no llega a la RPC aunque se saltase el boton.
  {
    const f = base({ isAdmin: false }), c = preparar(f.context);
    c.confirm = () => true;
    await c.deleteLeadAppointment(31);
    assert.deepEqual(c.supabaseClient.rpcCalls, []);
    assert.match(f.toasts.at(-1)[0], /administrador/i);
  }
  // Cancelar la confirmacion no borra nada y la cita exacta queda identificada.
  {
    const f = base(), c = preparar(f.context);
    let aviso = '';
    c.confirm = texto => { aviso = texto; return false; };
    await c.deleteLeadAppointment(31);
    assert.deepEqual(c.supabaseClient.rpcCalls, []);
    assert.match(aviso, /CANCELADA/);
    assert.match(aviso, /Loli/);
    assert.match(aviso, /demas citas/);
    assert.match(aviso, /no se puede deshacer/i);
  }
  // Admin confirma: una sola llamada y con el id de la cita elegida.
  {
    const f = base(), c = preparar(f.context);
    c.confirm = () => true;
    await c.deleteLeadAppointment(31);
    assert.deepEqual(c.supabaseClient.rpcCalls.map(r => [r.name, r.args.p_id]), [['delete_lead_appointment', 31]]);
  }
  // Id invalido o mutacion en vuelo: nada llega a la RPC.
  {
    const f = base(), c = preparar(f.context);
    c.confirm = () => true;
    await c.deleteLeadAppointment(0);
    await c.deleteLeadAppointment('abc');
    await c.deleteLeadAppointment(null);
    await c.deleteLeadAppointment(31);
    c.pendingAppointmentMutations.set(31, Symbol());
    await c.deleteLeadAppointment(31);
    assert.deepEqual(c.supabaseClient.rpcCalls.map(r => r.args.p_id), [31]);
  }
  // admin_required del servidor se traduce y no borra.
  {
    const rpcCalls = [];
    const denegado = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: { message: 'admin_required' } }; } };
    const f = base({ supabaseClient: denegado }), c = preparar(f.context);
    c.confirm = () => true;
    await c.deleteLeadAppointment(31);
    assert.equal(rpcCalls.length, 1);
    assert.match(f.toasts.at(-1)[0], /administrador/i);
  }
});

test('cita unica: el conflicto 23505 se traduce y recarga sin crear', async () => {
  const rpcCalls = [];
  const db = { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "lead_appointments_one_programmed_per_lead_uidx"' } }; } };
  const f = frontend({ supabaseClient: db, isAdmin: false, currentViewId: 7, pendingAppointmentMutations: new Map() });
  const c = f.context, el = f.element;
  c.document.querySelector = sel => sel === 'input[name="leadAppointmentCampus"]:checked' ? { value: 'DORAL' } : null;
  c.invalidateCitasCache = () => {};
  let recargas = 0;
  c.loadLeadAppointments = async () => { recargas += 1; };
  el('leadAppointmentDate').value = '2026-01-15T10:00';
  await c.createLeadAppointment({ preventDefault() {}, target: { reset() {} } });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'create_lead_appointment');
  assert.equal(recargas, 1, 'debe releer las citas tras el conflicto');
  assert.match(f.toasts.at(-1)[0], /ya tiene una cita programada/i);
  assert.equal(bloqueadoEn(c), true, 'el formulario sigue cerrado tras el conflicto');
});

test('cita unica: la UI no duplica funciones ni expone el borrado a no-admin', () => {
  const occurrences = nombre => (script.match(new RegExp(`(?:async\\s+)?function\\s+${nombre}\\s*\\(`, 'g')) || []).length;
  assert.equal(occurrences('deleteLeadAppointment'), 1);
  assert.equal(occurrences('updateLeadAppointmentCreateState'), 1);
  assert.equal(occurrences('loadLeadAppointments'), 1);
  // El boton de borrar solo se emite dentro de una rama de administrador.
  const botones = [...script.matchAll(/onclick="deleteLeadAppointment\(/g)];
  assert.equal(botones.length, 2, 'uno en la ficha y otro en la tabla de Citas');
  for (const match of botones) {
    const previo = script.slice(Math.max(0, match.index - 160), match.index);
    assert.match(previo, /isAdmin \?/, 'el boton de borrar debe quedar tras una comprobacion de isAdmin');
  }
});

test('migraciones de cita unica: indice parcial y RPC admin sin privilege escalation', () => {
  const indice = readFileSync('supabase/migrations/202610080001_one_programmed_appointment_per_lead.sql', 'utf8');
  assert.match(indice, /create unique index if not exists lead_appointments_one_programmed_per_lead_uidx/);
  assert.match(indice, /where status = 'PROGRAMADA'/, 'el indice debe ser parcial: las historicas siguen libres');
  assert.match(indice, /having count\(\*\) > 1/, 'abortar ante duplicados, nunca reconciliar solo');
  assert.match(indice, /raise exception using errcode = '23505'/);

  const rpc = readFileSync('supabase/migrations/202610080002_delete_lead_appointment_admin.sql', 'utf8');
  assert.match(rpc, /security definer set search_path = public/, 'search_path fijo: evita hijack de funcion');
  assert.match(rpc, /if not public\.is_admin_user\(\) then[\s\S]*raise exception using errcode = '42501'/);
  assert.match(rpc, /delete from public\.lead_appointments\s+where id = p_id/, 'borra solo la cita indicada');
  assert.doesNotMatch(rpc, /delete from public\.leads/, 'nunca borra el lead');
  assert.match(rpc, /revoke all on function public\.delete_lead_appointment\(bigint\) from public, anon/);
});

test('reporte diario: canales e inscripciones retirados de pantalla y CSV', () => {
  const c = { ...frontend({}).context };
  // El total mostrado solo suma las categorias que siguen en pantalla.
  assert.equal(c.totalCanalesVisibles({ llamada: 1, data_dura: 1, llamada_whatsapp: 1, whatsapp: 2, instagram: 0, visita: 3, sin_clasificar: 4, total: 99 }), 5);
  for (const vacio of [undefined, null, {}]) assert.equal(c.totalCanalesVisibles(vacio), 0);

  // El HTML del reporte ya no ofrece las cinco metricas retiradas.
  const f = frontend({});
  const html = f.context.renderReporteV2(
    [{ autor_name: 'Ana', autor_user_id: 'a', gestionados: 1,
      procedencia: { WhatsApp: 1 }, llamadas: { total: 1 }, whatsapp: { nuevos: 1, gestionados: 1, total: 2 },
      canales: { llamada: 1, data_dura: 1, llamada_whatsapp: 1, whatsapp: 2, instagram: 0, visita: 3, sin_clasificar: 4, total: 12 },
      citas: { total_agendados: 1, visitas: 1 }, inscritos: { del_dia: 9, data_dura: 8, total: 17 } }],
    [], true);
  // Se van las cuatro etiquetas retiradas. Ojo: 'Data Dura' sigue siendo legitima
  // en Llamada Data Dura y Agendados Data Dura, asi que no se comprueba suelta.
  for (const text of ['Inscripciones', 'Total inscritos', 'Visita Conservatorio', 'Sin clasificar']) assert.doesNotMatch(html, new RegExp(text));
  assert.doesNotMatch(html, /<td class="py-1">Del día<\/td>/);
  assert.doesNotMatch(html, /<td class="py-1">Data Dura<\/td>/);
  assert.equal((html.match(new RegExp('<h5 class="font-semibold text-indigo-900">', 'g')) || []).length, 4, 'cuatro tablas por asesora');
  for (const text of ['Procedencia', 'Canales', 'Detalle WhatsApp', 'Citas y resultados', 'Gestiones realizadas', 'Total llamadas', 'Visitas']) assert.match(html, new RegExp(text));
  assert.match(html, /Agendados hoy/);
});

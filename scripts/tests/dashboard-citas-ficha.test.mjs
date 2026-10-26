import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { getField, miamiDayBounds } from '../../src/legacy/helpers.js';
import { filaCitaHtml } from '../../src/legacy/citas.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `Función real ausente: ${name}`);
  for (let end = html.indexOf('}', match.index); end !== -1; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(match.index, end + 1);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const extracted = [
  'findLeadByOrigin',
  'openViewLeadModal',
  'openDashboardAppointmentsDetail',
  'miamiStartOfDayISO',
  'loadCitas',
  'initCitasPanel',
].map(extractFunction).join('\n');

test('openDashboardAppointmentsDetail prepara Lista sin fecha final', () => {
  const elements = new Map();
  for (const id of ['citasDesde', 'citasHasta', 'citasResultado', 'citasSede', 'citasCampana', 'citasAsesor']) {
    elements.set(id, { value: '2026-10-10' });
  }
  let switchedTo = '';
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) },
    miamiToday: () => '2026-10-16',
    switchTab: tab => { switchedTo = tab; },
  });
  vm.runInContext(extracted, context);
  context.openDashboardAppointmentsDetail();
  assert.equal(elements.get('citasDesde').value, '2026-10-16');
  assert.equal(elements.get('citasHasta').value, '');
  assert.equal(elements.get('citasResultado').value, 'PROGRAMADA');
  assert.equal(elements.get('citasSede').value, '');
  assert.equal(elements.get('citasCampana').value, '');
  assert.equal(elements.get('citasAsesor').value, '');
  assert.equal(switchedTo, 'citas');
});

test('loadCitas admite hasta vacío y consulta Programadas desde hoy', async () => {
  const elements = new Map();
  for (const id of ['citasDesde', 'citasHasta', 'citasResultado', 'citasSede', 'citasCampana', 'citasAsesor', 'citasAviso', 'citasTableBody']) {
    elements.set(id, { value: id === 'citasDesde' ? '2026-10-16' : '', innerHTML: '', textContent: '', setAttribute() {}, removeAttribute() {}, replaceChildren() {} });
  }
  const calls = [];
  const query = {
    select() { return this; },
    gte(field, value) { this.start = value; calls.push({ method: 'gte', field, value }); return this; },
    lt(field, value) { this.end = value; calls.push({ method: 'lt', field, value }); return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: [], error: null }); },
  };
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) },
    miamiToday: () => '2026-10-16',
    miamiDayBounds,
    supabaseClient: { from: () => query },
    currentUser: { id: 'A' },
    currentAccess: { activo: true, updated_at: 'v1' },
    isAdmin: false,
    isSupervisor: false,
    currentMainTab: 'citas',
    sessionGeneration: 1,
    citasRequestGeneration: 0,
    citasViewMode: 'lista',
    setCitasViewMode: async () => {},
    renderCitas() {},
    clearCitasResults() {},
    showToast() {},
    catalogOptions: (_key, values) => values,
    fillCitasSelect() {},
    ordenarCitasDesc: rows => rows,
    unirCitasConLeads: (rows, leads) => ({ citas: rows, aviso: '' }),
    fetchPagedResult: async makeQuery => {
      const result = makeQuery();
      const resolved = await (typeof result?.then === 'function' ? result : Promise.resolve(result));
      return resolved && resolved.error ? resolved : { data: resolved?.data ?? [], error: null };
    },
    fetchRowsByIds: async () => ({ data: [], error: null }),
  });
  vm.runInContext(extracted, context);
  await context.loadCitas();
  assert.equal(calls.some(call => call.method === 'gte' && call.value === miamiDayBounds('2026-10-16')[0]), true);
  assert.equal(calls.some(call => call.method === 'lt'), false);
  assert.equal(elements.get('citasAviso').textContent, '');
});

test('loadCitas pide notes y la tabla muestra la nota opcional', async () => {
  const elements = new Map();
  for (const id of ['citasDesde', 'citasHasta', 'citasResultado', 'citasSede', 'citasCampana', 'citasAsesor', 'citasAviso', 'citasTableBody']) {
    elements.set(id, { value: id === 'citasDesde' ? '2026-10-26' : '', innerHTML: '', textContent: '', setAttribute() {}, removeAttribute() {}, replaceChildren() {} });
  }
  const selects = [];
  const row = {
    id: 74, lead_id: 1, scheduled_at: '2026-10-27T21:45:00Z', created_at: '2026-10-26T21:08:00Z',
    status: 'PROGRAMADA', advisor_name: 'Jessica', advisor_user_id: 'u1', student_name: 'Bella Celin Soli',
    contact_email: 'joselundberg28@gmail.com', student_age: 6, campus: 'DORAL', is_data_dura: false,
    notes: 'MT piojitos',
  };
  const query = {
    // fetchPagedResult lee .data del builder cuando no es thenable.
    data: [row],
    select(fields) { selects.push(String(fields)); return this; },
    gte() { return this; },
    lt() { return this; },
    order() { return this; },
    range() { return Promise.resolve({ data: [row], error: null, count: 1 }); },
  };
  let rendered = '';
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id) },
    miamiToday: () => '2026-10-26',
    miamiDayBounds,
    getField,
    supabaseClient: { from: () => query },
    currentUser: { id: 'u1' },
    currentAccess: { activo: true, updated_at: 'v1' },
    isAdmin: false,
    isSupervisor: false,
    currentMainTab: 'citas',
    sessionGeneration: 1,
    citasRequestGeneration: 0,
    citasViewMode: 'lista',
    setCitasViewMode: async () => {},
    renderCitas() { rendered = filaCitaHtml(context.citasCache[0], { isAdmin: false, userId: 'u1' }); },
    clearCitasResults() {},
    showToast() {},
    catalogOptions: (_key, values) => values,
    fillCitasSelect() {},
    ordenarCitasDesc: rows => rows,
    unirCitasConLeads: (rows, leads) => ({ citas: rows.map(r => ({ ...r, lead: leads[0] })), aviso: '' }),
    fetchPagedResult: async makeQuery => {
      const result = makeQuery();
      const resolved = await (typeof result?.then === 'function' ? result : Promise.resolve(result));
      return resolved && resolved.error ? resolved : { data: resolved?.data ?? [], error: null };
    },
    fetchRowsByIds: async () => ({ data: [{ id: 1, Nombre: 'Jose Lundberg', Telefono: '1 (863) 303-6888', Mes: 'Octubre' }], error: null }),
  });
  vm.runInContext(extracted, context);
  await context.loadCitas();
  const campos = selects.flatMap(s => s.split(/[\s,]+/)).filter(Boolean);
  assert.equal(campos.includes('notes'), true, `loadCitas no pidió notes: ${selects.join(' | ')}`);
  assert.equal(rendered.includes('MT piojitos'), true, 'La tabla de visitas no muestra la nota opcional');
});

test('miamiStartOfDayISO calcula medianoche en Miami', () => {
  const fn = extractFunction('miamiStartOfDayISO');
  const BaseDate = Date;
  class FixedDate extends BaseDate {
    constructor(...args) {
      super(...(args.length ? args : ['2026-07-01T16:00:00Z']));
    }
  }
  const context = vm.createContext({ Date: FixedDate });
  vm.runInContext(fn, context);
  assert.equal(context.miamiStartOfDayISO(), '2026-07-01T04:00:00.000Z');
});

test('openViewLeadModal respeta origen e ID compartidos', () => {
  const shown = { value: '' };
  const context = vm.createContext({
    dashboardLeadCache: new Map([['42', { id: 42, Nombre: 'Actual sintético' }]]),
    allLeads: [],
    allHistorico: [{ id: 42, Nombre: 'Histórico sintético' }],
    completeCurrentLoaded: false,
    completeCurrentLeads: [],
    historicoLoaded: true,
    viewLeadGeneration: 0,
    currentViewId: null,
    document: { getElementById: id => id === 'viewLeadContent' ? { innerHTML: '' } : null },
    repetidosYBannerHtml: () => ({}),
    fichaLeadHtml: lead => { shown.value = lead.Nombre; return ''; },
    findLeadByOrigin(origin, leadId) {
      const source = origin === 'historico' ? this.allHistorico : this.allLeads;
      return source.find(lead => String(lead.id) === String(leadId));
    },
  });
  vm.runInContext(extracted, context);
  context.openViewLeadModal(42, 'historico');
  assert.equal(shown.value, 'Histórico sintético');
  assert.equal(context.currentViewOrigin, 'historico');
});
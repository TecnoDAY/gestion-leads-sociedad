import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { filtrarIngreso, validarRangoIngreso, mesActualMiami } from '../../src/kanban/periodo.js';
import { escapeAttr, escapeHtml } from '../../src/legacy/helpers.js';

const leads = [
  { id: 1, Fecha: '01/10/2026' },
  { id: 2, Fecha: '31/10/2026' },
  { id: 3, Fecha: '30/09/2026' },
  { id: 4, Fecha: '1/10/2025' },
  { id: 5, Fecha: '31/02/2026' },
  { id: 6, Fecha: '' },
  { id: 7, Fecha: '15/10/2026', archived_at: '2026-10-20' },
];

test('el rango de ingreso incluye ambos extremos y excluye otro año, inválidos y archivados', () => {
  assert.deepEqual(filtrarIngreso(leads, '2026-10-01', '2026-10-31').map(l => l.id), [1, 2]);
  assert.deepEqual(filtrarIngreso(leads, '2026-10-31', '2026-10-31').map(l => l.id), [2]);
});

test('sin rango no inventa fechas: incluye los actuales incluso sin fecha válida', () => {
  assert.deepEqual(filtrarIngreso(leads, '', '').map(l => l.id), [1, 2, 3, 4, 5, 6]);
});

test('rechaza rangos incompletos, invertidos y fechas imposibles antes de consultar', () => {
  for (const [from, to] of [
    ['2026-10-01', ''], ['', '2026-10-31'],
    ['2026-11-01', '2026-10-31'], ['2026-02-30', '2026-03-01'],
  ]) assert.throws(() => validarRangoIngreso(from, to), /rango|fecha/i);
  assert.doesNotThrow(() => validarRangoIngreso('2024-02-29', '2024-02-29'));
});

test('mes actual usa Miami incluso en un cambio de mes y conserva extremos inclusivos', () => {
  assert.deepEqual(mesActualMiami(new Date('2026-11-01T02:00:00Z')), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(mesActualMiami(new Date('2024-02-15T12:00:00Z')), ['2024-02-01', '2024-02-29']);
});

test('Tablero solo ofrece Buscar/Desde/Hasta y filtra la carga compartida', async () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const view = html.match(/<div id="viewKanban"[\s\S]*?(?=\n  <\/main>)/)?.[0];
  assert.ok(view);
  assert.doesNotMatch(view, /kanbanMes|kanbanAnio/);
  assert.match(view, /id="kanbanPeriodNotice"/);
  assert.match(html, /data-sidebar-tab="kanban"[^\n]*<span>Tablero<\/span>/);
  const adapter = html.match(/window\.crmLoadKanbanLeads = async \(\) => \{[\s\S]*?\n\s+\};/)?.[0];
  assert.match(adapter || '', /await loadLeadsPromise/);
  assert.doesNotMatch(adapter, /fetchLeadsByIdCursor|loadLeadsData\(/);

  const js = readFileSync(new URL('../../src/kanban/kanban.js', import.meta.url), 'utf8');
  const source = js.match(/async function loadBase\([^)]*\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  let calls = 0;
  const rows = Array.from({ length: 2000 }, (_, index) => ({ id: index + 1, Fecha: '15/10/2026' }));
  const fields = { kanbanDesde: '2026-10-01', kanbanHasta: '2026-10-31' };
  const context = vm.createContext({
    document: { getElementById: id => ({ value: fields[id] }) },
    window: { crmLoadKanbanLeads: async () => { calls++; return rows; } },
    validarRangoIngreso, filtrarIngreso,
  });
  vm.runInContext(`let errorState, requestGeneration = 0; ${source}; this.loadBase = loadBase; this.getError = () => errorState`, context);
  assert.equal((await context.loadBase()).length, 2000);
  assert.equal(calls, 1);
  fields.kanbanHasta = '';
  assert.equal((await context.loadBase()).length, 0);
  assert.match(context.getError(), /Completa Desde y Hasta/);
  assert.equal(calls, 1, 'un rango incompleto no consulta datos');
});

test('un fallo de una petición obsoleta no deja el Tablero en estado de error', async () => {
  const js = readFileSync(new URL('../../src/kanban/kanban.js', import.meta.url), 'utf8');
  const source = js.match(/async function loadBase\([^)]*\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  let fail;
  const context = vm.createContext({
    document: { getElementById: id => ({ value: id === 'kanbanDesde' ? '2026-10-01' : '2026-10-31' }) },
    window: { crmLoadKanbanLeads: () => new Promise((_, reject) => { fail = reject; }) },
    validarRangoIngreso, filtrarIngreso,
  });
  vm.runInContext(`let errorState, requestGeneration = 1; ${source};
    this.loadBase = loadBase; this.advance = () => requestGeneration++; this.getError = () => errorState`, context);
  const stale = context.loadBase();
  context.advance();
  fail(new Error('fallo de la primera petición'));
  await stale;
  assert.equal(context.getError(), null);
});

test('adaptador espera la carga en curso sin otra consulta y rechaza fallos y cambios de sesión', async () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const adapter = html.match(/window\.crmLoadKanbanLeads = async \(\) => \{[\s\S]*?\n\s+\};/)?.[0];
  assert.ok(adapter);
  const context = vm.createContext({ window: {}, Promise });
  vm.runInContext(`let sessionGeneration = 1, currentUser = { id: 1 }, currentAccess = { activo: true, updated_at: 'a' },
    supabaseClient = {}, isSupabaseLive = false, allLeads = [{ id: 1 }], loadLeadsPromise, LEADS_BATCH_SIZE = 2000;
    ${adapter}; this.setLoad = (promise) => loadLeadsPromise = promise;
    this.setLive = (value) => isSupabaseLive = value;
    this.setLeads = (rows) => allLeads = rows;
    this.endSession = () => { sessionGeneration++; currentUser = null; allLeads = []; };`, context);
  let finish;
  context.setLoad(new Promise(resolve => { finish = resolve; }));
  const pending = context.window.crmLoadKanbanLeads();
  context.setLive(true);
  finish(true);
  assert.equal((await pending)[0].id, 1);
  context.setLoad(null);
  assert.equal((await context.window.crmLoadKanbanLeads())[0].id, 1);
  context.setLeads(Array.from({ length: 2300 }, (_, index) => ({ id: 2300 - index })));
  assert.equal((await context.window.crmLoadKanbanLeads()).length, 2000, 'cargar leads anteriores no amplía el alcance del tablero');
  context.setLoad(Promise.resolve(false));
  await assert.rejects(context.window.crmLoadKanbanLeads(), /No se pudo completar/);
  context.setLoad(new Promise(resolve => { finish = resolve; }));
  const stale = context.window.crmLoadKanbanLeads();
  context.endSession();
  finish(true);
  await assert.rejects(stale, /sesión cambió/);
});

test('la tarjeta escapa nombre y teléfono recibidos de la base', () => {
  const js = readFileSync(new URL('../../src/kanban/kanban.js', import.meta.url), 'utf8');
  const source = js.match(/function cardHtml\(lead, col\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context = vm.createContext({
    gf: (lead, key) => lead[key] || '', escapeAttr, escapeHtml, consulta: null,
  });
  vm.runInContext(`${source}; this.cardHtml = cardHtml`, context);
  const html = context.cardHtml({ id: 1, Nombre: '<img src=x onerror=alert(1)>',
    Telefono: '<script>bad()</script>', Mes: 'Octubre' },
  { badge: 'bg-blue-500/10', accent: 'text-blue-400' });
  assert.doesNotMatch(html, /<img|<script>/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
});

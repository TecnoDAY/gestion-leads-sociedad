import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const js = readFileSync(new URL('../../src/kanban/kanban.js', import.meta.url), 'utf8');

test('al refrescar tras mover una tarjeta conserva ambos desplazamientos', async () => {
  const board = { scrollLeft: 620, scrollWidth: 1800, clientWidth: 600,
    querySelectorAll: () => [zone] };
  const zone = { dataset: { col: 'AGENDADO' }, scrollTop: 150, scrollHeight: 500, clientHeight: 200 };
  const context = vm.createContext({
    board, zone,
    container: () => board,
    renderBoard() { board.scrollLeft = 0; zone.scrollTop = 0; },
    updatePeriodNotice: () => {},
    loadBase: async () => [],
    document: { getElementById: id => id === 'kanbanBoard' ? board : null },
  });
  const source = js.match(/async function refresh\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'refresh debe existir');
  vm.runInContext(`let loading, errorState, requestGeneration = 0, currentBase = [{ id: 1 }]; ${source}; this.refresh = refresh`, context);
  await context.refresh();
  assert.equal(board.scrollLeft, 620);
  assert.equal(zone.scrollTop, 150);
});

test('si falla la recarga conserva las tarjetas y la posición actual', async () => {
  const board = { scrollLeft: 310, querySelectorAll: () => [] };
  let renders = 0;
  const context = vm.createContext({
    window: { showToast: () => {} },
    container: () => board,
    renderBoard: () => { renders++; },
    updatePeriodNotice: () => {},
    loadBase: async () => { vm.runInContext("errorState = 'Sin conexión'", context); return []; },
  });
  const source = js.match(/async function refresh\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  vm.runInContext(`let loading, errorState, requestGeneration = 0, currentBase = [{ id: 1 }]; ${source};
    this.refresh = refresh; this.getBase = () => currentBase; this.getError = () => errorState`, context);
  await context.refresh();
  assert.equal(context.getBase().length, 1);
  assert.equal(board.scrollLeft, 310);
  assert.equal(renders, 0);
  assert.equal(context.getError(), null);
});

test('una respuesta antigua no reemplaza un rango más reciente', async () => {
  const board = { scrollLeft: 0, querySelectorAll: () => [] };
  const pending = [];
  const context = vm.createContext({
    container: () => board, renderBoard: () => {},
    updatePeriodNotice: () => {},
    loadBase: () => new Promise(resolve => pending.push(resolve)),
  });
  const source = js.match(/async function refresh\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  vm.runInContext(`let loading, errorState, requestGeneration = 0, currentBase = [];
    ${source}; this.refresh = refresh; this.getBase = () => currentBase`, context);
  const oldRequest = context.refresh();
  const newRequest = context.refresh();
  pending[1]([{ id: 2 }]);
  await newRequest;
  pending[0]([{ id: 1 }]);
  await oldRequest;
  assert.equal(context.getBase()[0].id, 2);
});

test('el primer acceso fija el mes y entradas posteriores respetan el rango elegido', () => {
  const fields = { kanbanDesde: { value: '' }, kanbanHasta: { value: '' }, kanbanBoard: {} };
  const source = js.match(/export function initKanban\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  let refreshes = 0;
  const context = vm.createContext({
    consulta: null,
    document: { getElementById: id => fields[id] },
    mesActualMiami: () => ['2026-10-01', '2026-10-31'],
    refresh: () => { refreshes++; }, renderBoard: () => {},
  });
  for (const id of ['kanbanDesde', 'kanbanHasta']) fields[id].addEventListener = () => {};
  vm.runInContext(`let rangeInitialized = false, initialized = false; ${source.replace('export function', 'function')}; this.initKanban = initKanban`, context);
  context.initKanban();
  assert.equal(fields.kanbanDesde.value, '2026-10-01');
  assert.equal(fields.kanbanHasta.value, '2026-10-31');
  fields.kanbanDesde.value = '2026-09-01';
  context.initKanban();
  assert.equal(fields.kanbanDesde.value, '2026-09-01');
  assert.equal(refreshes, 2);
});

test('aviso visible indica período y límite de 2.000 sin afirmar cobertura total', () => {
  const fields = {
    kanbanDesde: { value: '2026-10-01' }, kanbanHasta: { value: '2026-10-31' },
    kanbanPeriodNotice: { textContent: '' },
  };
  const source = js.match(/function updatePeriodNotice\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context = vm.createContext({ consulta: null, document: { getElementById: id => fields[id] }, Intl, Date });
  vm.runInContext(`${source}; this.updatePeriodNotice = updatePeriodNotice`, context);
  context.updatePeriodNotice();
  assert.match(fields.kanbanPeriodNotice.textContent, /octubre de 2026/);
  assert.match(fields.kanbanPeriodNotice.textContent, /entre los últimos 2\.000 leads cargados/);
  fields.kanbanDesde.value = '2026-09-01';
  context.updatePeriodNotice();
  assert.match(fields.kanbanPeriodNotice.textContent, /septiembre de 2026/);
});

test('consulta explícita exige filtros y pagina sin mezclar orígenes ni duplicar la carga rápida', async () => {
  const fields = Object.fromEntries(['kanbanQueryError', 'kanbanRunQuery', 'kanbanMore', 'kanbanSearch',
    'kanbanQueryDesde', 'kanbanQueryHasta', 'kanbanQueryText', 'kanbanQueryOrigin'].map(id => [id, {
    value: '', textContent: '', disabled: false, classList: { toggle: () => {} },
  }]));
  fields.kanbanQueryOrigin.value = 'historico';
  const calls = [];
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: 200 - index }));
  let renders = 0;
  const source = js.match(/async function runQuery\(append = false\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const context = vm.createContext({
    document: { getElementById: id => fields[id] },
    window: { crmQueryKanban: async params => { calls.push(params); return calls.length === 1 ? rows : [{ id: 99 }]; } },
    validarRangoIngreso: (from, to) => { if (!!from !== !!to) throw Error('Rango incompleto'); },
    renderBoard: () => { renders++; }, updatePeriodNotice: () => {},
  });
  vm.runInContext(`let requestGeneration = 0, currentBase = [], consulta = null, moreAvailable = false, errorState;
    ${source}; this.runQuery = runQuery; this.getBase = () => currentBase; this.getQuery = () => consulta`, context);
  await context.runQuery();
  assert.equal(calls.length, 0);
  assert.match(fields.kanbanQueryError.textContent, /Indica fechas/);
  fields.kanbanQueryText.value = 'Lundberg';
  await context.runQuery();
  assert.equal(calls[0].p_origen, 'historico');
  assert.equal(context.getBase().length, 100);
  assert.equal(context.getQuery().p_origen, 'historico');
  await context.runQuery(true);
  assert.equal(calls[1].p_antes_id, 101);
  assert.equal(context.getBase().length, 101);
  assert.equal(renders, 2);
});

test('el histórico no permite arrastrar ni guardar estados y abre la ficha histórica', () => {
  assert.match(js, /draggable="\$\{consulta\?\.p_origen === 'historico' \? 'false' : 'true'\}"/);
  assert.match(js, /if \(consulta\?\.p_origen === 'historico'\) return;\n  if \(!targetStatus/);
  assert.match(js, /window\.crmOpenViewLead\(origin, id\)/);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /window\.crmFindKanbanLead\?\.\(leadId, origin\)/);
});

test('estados no predefinidos reciben puntos de color estables y no grises', () => {
  const colors = js.match(/const STATUS_COLORS = \{[\s\S]*?(?=\nfunction supabase\()/)?.[0];
  assert.ok(colors);
  const context = vm.createContext({});
  vm.runInContext(`${colors}\nthis.colorFor = colorFor`, context);
  const color = context.colorFor('EN VISTO').hex;
  assert.match(color, /^#[0-9a-f]{6}$/i);
  assert.notEqual(color, '#94a3b8');
  assert.equal(context.colorFor('EN VISTO').hex, color);
});

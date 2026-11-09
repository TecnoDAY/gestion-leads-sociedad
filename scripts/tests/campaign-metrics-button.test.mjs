import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import * as model from '../../src/legacy/campaign-metrics-model.js';
import { filaCampanaHtml, campaignTotals, campanasCsvLines, resumenCampanasHtml } from '../../src/legacy/reportes.js';

// Execute the real module with a small DOM boundary. No browser/RLS claims.
function browser({ demo = false, role = 'trafficker', access, rpc } = {}) {
  const listeners = new Map(), nodes = new Map(), calls = [];
  function element(tag = 'div') {
    const classes = new Set();
    return { tag, children: [], dataset: {}, hidden: false, value: '', textContent: '', innerHTML: '', disabled: false,
      handlers: {}, classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) },
      setAttribute() {}, appendChild(el) { this.children.push(el); }, replaceChildren() { this.children = []; },
      addEventListener(name, fn) { this.handlers[name] = fn; },
      querySelector(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    };
  }
  const panel = element('aside'), fields = new Map();
  const form = panel.querySelector('#cmpForm');
  form.elements = { namedItem(name) { if (!fields.has(name)) fields.set(name, element('input')); return fields.get(name); } };
  form.reset = () => { for (const f of fields.values()) f.value = ''; };
  const document = { createElement: tag => tag === 'aside' ? panel : element(tag), body: { appendChild() {} },
    addEventListener(type, fn) { listeners.set(type, fn); } };
  const window = { location: { hostname: 'localhost', search: demo ? '?campaignDemo=1' : '' }, currentAccess: access === undefined ? { activo: true, role, user_id: 'author-1', nombre: 'Ana' } : access,
    dispatchEvent() {}, supabaseClient: { async rpc(name, args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
      if (rpc) return rpc(name, args);
      return { data: name === 'list_campaign_metrics_with_authors_v2' ? [] : { spend: 0, results: 0, cost_per_result: 0 } };
    } } };
  const source = readFileSync(new URL('../../src/legacy/campaign-metrics.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replaceAll('export ', '');
  const context = { ...model, window, document, Date, console, Event };
  vm.runInNewContext(source, context);
  return { window, panel, nodes, calls, listeners, fields, context, form };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const content = el => [el.textContent, ...el.children.map(content)].join(' ');

test('demo reload stays closed until explicit campaign click after session restoration', async () => {
  const b = browser({ demo: true, access: null }); await flush();
  assert.equal(b.panel.innerHTML, '', 'startup must not construct or display a panel');
  assert.deepEqual(b.calls, [], 'startup must not query metrics');
  b.window.currentAccess = { activo: true, role: 'admin', nombre: 'Admin recuperado', user_id: 'admin-1' };
  click(b, 'Campaña elegida', '2026-10'); await flush();
  assert.ok(b.panel.classList.contains('translate-x-0'));
  assert.equal(b.nodes.get('#cmpSession').textContent, 'Admin recuperado');
  assert.equal(b.nodes.get('#cmpTitle').textContent, 'Métricas Meta — Campaña elegida');
  assert.equal(b.form.hidden, false);
  assert.doesNotMatch(b.nodes.get('#cmpMsg').textContent, /active_user_required/);
  assert.deepEqual(b.calls, []);
});

test('demo uses authentic session only, with safe name and no impersonation menu', async () => {
  const b = browser({ demo: true, access: null });
  b.window.openCampaignMetricsPanel('DEMO · Campaña ficticia'); await flush();
  assert.equal(b.form.hidden, true);
  assert.doesNotMatch(b.panel.innerHTML, /cmpDemoRole|<select/);
  assert.equal(b.nodes.get('#cmpSession').textContent, 'Sesión no disponible');
  await assert.rejects(b.context.insertCampaignMetric({}), /campaign_editor_required/);
  await assert.rejects(b.context.correctCampaignMetric({}), /campaign_editor_required/);
  for (const role of ['agente', 'admin', 'trafficker', 'supervisor']) {
    const session = { activo: true, role, user_id: 'u1', nombre: '<img onerror=x>' };
    const x = browser({ demo: true, access: session });
    x.window.openCampaignMetricsPanel('DEMO · Campaña ficticia'); await flush();
    assert.equal(x.nodes.get('#cmpSession').textContent, session.nombre);
    assert.equal(x.nodes.get('#cmpSession').innerHTML, '');
    assert.equal(x.form.hidden, role === 'agente');
    if (role === 'agente') {
      await assert.rejects(x.context.insertCampaignMetric({}), /campaign_editor_required/);
      await assert.rejects(x.context.correctCampaignMetric({}), /campaign_editor_required/);
    } else { fill(x); await x.form.handlers.submit({ preventDefault() {} }); assert.match(content(x.nodes.get('#cmpHistory')), /<img onerror=x>/); }
    x.window.currentAccess = { ...session, activo: false };
    await assert.rejects(x.context.insertCampaignMetric({}), /campaign_editor_required/);
    await assert.rejects(x.context.correctCampaignMetric({}), /campaign_editor_required/);
    assert.deepEqual(x.calls, []);
  }
});

test('demo snapshots actual authors, not viewer or payload authors', async () => {
  const b = browser({ demo: true }); await flush();
  const input = { campaignName: 'Kids', startDate: '2026-10-01', endDate: '2026-10-07', spend: 10, cost: 2, author_name: 'Spoof', created_by: 'spoof' };
  const row = await b.context.insertCampaignMetric(input);
  b.window.currentAccess = { activo: true, role: 'supervisor', user_id: 'author-2', nombre: '<b>Bea</b>' };
  await b.context.correctCampaignMetric({ ...input, originalId: row.id, reason: 'Ajuste' });
  b.window.currentAccess = { activo: true, role: 'agente', nombre: 'Viewer' };
  b.window.openCampaignMetricsPanel('Kids', { from: '2026-10-01', to: '2026-10-31' }); await flush();
  const history = b.nodes.get('#cmpHistory');
  assert.match(content(history), /Ana/); assert.match(content(history), /<b>Bea<\/b>/);
  assert.doesNotMatch(content(history), /Viewer|Spoof/);
  assert.ok(history.children.every(r => r.children.every(n => n.innerHTML === '')));
  assert.equal(b.form.hidden, true);
  assert.ok(history.children.every(r => !r.children.some(n => n.tag === 'button')));
});

test('real v2 author rows prefill cost and preserve correction payload and UUID fallback', async () => {
  const rows = [{ id: 'uuid-1', campaign_name: 'Kids', start_date: '2026-11-01', end_date: '2026-11-07', spend: 100, cost_per_result: 5, derived_results: 20, alcance: 1234, reported_meta_leads: 19, author_name: '<i>Ana</i>', created_by: 'uuid-author' },
    { id: 'uuid-2', start_date: '2026-11-08', end_date: '2026-11-14', spend: 20, cost_per_result: 2, created_by: 'deleted-uuid', author_name: null }];
  const b = browser({ rpc: name => ({ data: name === 'list_campaign_metrics_with_authors_v2' ? rows : { spend: 120 } }) });
  b.window.openCampaignMetricsPanel('Kids', { from: '2026-11-01', to: '2026-11-30' }); await flush();
  assert.equal(b.calls[1].name, 'list_campaign_metrics_with_authors_v2');
  const history = b.nodes.get('#cmpHistory');
  assert.match(content(history), /<i>Ana<\/i>/); assert.match(content(history), /deleted-uuid/);
  assert.doesNotMatch(content(history), /Histórico anterior/);
  assert.ok(history.children.every(r => r.children.every(n => n.innerHTML === '')));
  history.children[0].children.find(n => n.tag === 'button').handlers.click();
  assert.equal(b.fields.get('cost').value, 5);
  fill(b, { start: '2026-11-01', end: '2026-11-07', cost: '4', reason: 'Corrección' });
  await b.form.handlers.submit({ preventDefault() {} });
  const write = b.calls.find(c => c.name === 'correct_campaign_metric_v2');
  assert.deepEqual(write.args, { p_original_id: 'uuid-1', p_start_date: '2026-11-01', p_end_date: '2026-11-07', p_alcance: 1234, p_spend: 100, p_cost_per_result: 4, p_reported_meta_leads: 19, p_reason: 'Corrección' });
  assert.equal(rows[0].cost_per_result, 5);
  await b.window.campaignMetricReport([], [], '2026-11-01', '2026-11-30');
  assert.ok(b.calls.some(c => c.name === 'list_campaign_metrics_with_authors_v2' && c.args.p_campaign_name === null));
});
function fill(b, extra = {}) {
  for (const [name, value] of Object.entries({ start: '2026-10-01', end: '2026-10-07', spend: '100', cost: '3', leads: '', alcance: '', ...extra })) b.form.elements.namedItem(name).value = value;
}
function click(b, name, month = '2026-11', period) {
  const html = filaCampanaHtml({ name, metrics_source: true }, { esEditor: true, monthStr: month, periodo: period });
  assert.match(html, /data-campaign-metrics=/);
  const button = { getAttribute: () => encodeURIComponent(name), closest: () => ({ dataset: { month, desde: period?.desde, hasta: period?.hasta } }) };
  b.listeners.get('click')({ target: { closest: () => button } });
}
for (const name of ['Kids & "Sala"', "O'Brien 100%", 'Literal %20 y música']) {
  test(`real delegated click preserves exact campaign name: ${name}`, async () => {
    const b = browser(); click(b, name, '2028-02'); await flush();
    assert.equal(b.nodes.get('#cmpTitle').textContent, `Métricas Meta — ${name}`);
    assert.ok(b.panel.classList.contains('translate-x-0'));
    assert.deepEqual(b.calls.map(c => c.args), [
      { p_campaign_name: name, p_from: '2028-02-01', p_to: '2028-02-29' }, { p_campaign_name: name },
    ]);
  });
}

test('range click and public raw-name API preserve dates; close invalidates pending results', async () => {
  let resolve;
  const b = browser({ rpc: name => name === 'aggregate_campaign_metrics_v2' ? new Promise(r => { resolve = r; }) : { data: [] } });
  click(b, 'Raw %20', '2026-11', { desde: '2026-11-03', hasta: '2026-11-09' });
  assert.deepEqual(b.calls[0].args, { p_campaign_name: 'Raw %20', p_from: '2026-11-03', p_to: '2026-11-09' });
  b.window.closeCampaignMetricsPanel();
  resolve({ data: { spend: 999 } }); await flush();
  assert.equal(b.nodes.get('#cmpTotals').textContent, 'Cargando…');
  assert.ok(b.panel.classList.contains('translate-x-full'));
});

test('switching campaign while requests are pending cannot render the old result', async () => {
  const pending = new Map();
  const b = browser({ rpc: (name, args) => name === 'aggregate_campaign_metrics_v2' ? new Promise(r => pending.set(args.p_campaign_name, r)) : { data: [] } });
  b.window.openCampaignMetricsPanel('Old', { from: '2026-11-01', to: '2026-11-30' });
  b.window.openCampaignMetricsPanel('New', { from: '2026-12-01', to: '2026-12-31' });
  pending.get('New')({ data: { spend: 20, results: 4, derived_results: 4, cost_per_result: 5 } }); await flush();
  pending.get('Old')({ data: { spend: 999, results: 1 } }); await flush();
  assert.match(b.nodes.get('#cmpTotals').textContent, /Importe \$20/);
  assert.doesNotMatch(b.nodes.get('#cmpTotals').textContent, /999/);
});

test('demo public form inserts, corrects repeatedly, filters and never calls RPC; reason is text only', async () => {
  const b = browser({ demo: true });
  b.window.openCampaignMetricsPanel('DEMO · Campaña ficticia'); await flush();
  assert.equal(b.nodes.get('#cmpDemo').hidden, false);
  fill(b); await b.form.handlers.submit({ preventDefault() {} });
  assert.match(b.nodes.get('#cmpTotals').textContent, /33,3333/);
  const history = b.nodes.get('#cmpHistory');
  history.children[0].children.find(n => n.tag === 'button').handlers.click();
  assert.equal(b.fields.get('cost').value, 3);
  fill(b, { spend: '60', cost: '6', reason: '<img src=x onerror=alert(1)>' });
  await b.form.handlers.submit({ preventDefault() {} });
  assert.equal(history.children.length, 2);
  const reason = history.children[1].children.find(n => n.textContent.startsWith('Motivo:'));
  assert.equal(reason.textContent, 'Motivo: <img src=x onerror=alert(1)>');
  assert.equal(reason.innerHTML, '');
  history.children[1].children.find(n => n.tag === 'button').handlers.click();
  assert.equal(b.fields.get('spend').value, 60, 'correction starts from current version');
  fill(b, { spend: '90', cost: '6', reason: 'Segunda' }); await b.form.handlers.submit({ preventDefault() {} });
  assert.match(b.nodes.get('#cmpTotals').textContent, /Resultados ≈ 15/);
  b.nodes.get('#cmpFrom').value = '2026-10-15'; b.nodes.get('#cmpTo').value = '2026-10-21';
  b.nodes.get('#cmpFilter').handlers.click(); await flush();
  assert.match(b.nodes.get('#cmpTotals').textContent, /Importe \$0/);
  assert.equal(history.children[0].textContent, 'Sin registros en este rango.');
  assert.deepEqual(b.calls, []);
});

test('reader has history, no form or correction controls; API refuses writes without RPC', async () => {
  const b = browser({ role: 'agente', rpc: name => ({ data: name === 'list_campaign_metrics_with_authors_v2' ? [
    { id: '1', revision: 1, input_cost: 2, spend: 10, derived_results: 5, start_date: '2026-11-01', end_date: '2026-11-07' },
  ] : { spend: 10, results: 5 } }) });
  const html = filaCampanaHtml({ name: 'Kids', metrics_source: true }, { esEditor: false, monthStr: '2026-11' });
  assert.match(html, /Ver historial/); assert.doesNotMatch(html, /Registrar métricas/);
  b.window.openCampaignMetricsPanel('Kids', { from: '2026-11-01', to: '2026-11-30' }); await flush();
  assert.equal(b.form.hidden, true);
  assert.equal(b.nodes.get('#cmpHistory').children[0].children.some(n => n.tag === 'button'), false);
  const before = b.calls.length;
  await assert.rejects(b.context.insertCampaignMetric({ campaignName: 'Kids' }), /campaign_editor_required/);
  assert.equal(b.calls.length, before);
});

test('main report, summary, totals and CSV share aggregates; periods never reuse monthly CRM', async () => {
  const b = browser({ rpc: name => ({ data: name === 'list_campaign_metrics_with_authors_v2' ? [] : { spend: 300, results: 50, derived_results: 50, reported_meta_leads: 48, meta_leads: 48, alcance: 100, cost_per_result: 6, estimated: false, count: 2 } }) });
  const crm = [{ campaign_name: 'Kids', leads_nuevos: 51, inscritos: 3 }];
  const rows = await b.window.campaignMetricReport(['Kids'], crm, '2026-11-01', '2026-11-30');
  assert.equal(rows[0].resultados, 50); assert.equal(rows[0].leads_nuevos, 51);
  const totals = campaignTotals(rows); assert.equal(totals.resultados, 50); assert.equal(totals.gasto, 300);
  assert.match(resumenCampanasHtml(rows, totals), /CPL ponderado/);
  assert.match(campanasCsvLines(rows, '2026-11', '2026-11-30').at(-1), /"6.00"/);
  const period = await b.window.campaignMetricReport(['Kids'], crm, '2026-11-01', '2026-11-07', true);
  assert.equal(period[0].leads_nuevos, null); assert.equal(period[0].inscritos, null);
});

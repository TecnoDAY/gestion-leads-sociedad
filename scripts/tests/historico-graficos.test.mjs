// Fase 31: caracterizacion de la tabla resumen y de las 8 configuraciones
// de Chart.js del historico. GOLDEN capturado ejecutando el
// renderHistoricalAnalytics de HEAD (git show) en una sandbox vm con un
// Chart.js simulado que registra configs (no renderiza); el nuevo (wrapper
// del monolito + piezas puras de src/legacy/reportes.js) debe coincidir
// byte a byte en los mismos samples sinteticos.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { escapeHtml } from '../../src/legacy/helpers.js';
import {
  historicalSummaryRows, historicalKpiTotals, historicalRecordMonth, histMonthLabel,
  computeHistoricalAggregates, historicalChartSeries,
  tablaVaciaHistoricoHtml, tablaHistoricoHtml,
  histChartMonthly, histChartConversion, histChartCampaign, histChartMedio,
  histChartAgent, histChartMonthlyStates, histChartMonthlyCampaigns, histChartFunnel,
} from '../../src/legacy/reportes.js';

const headHtml = execSync('git show HEAD:index.html', {
  cwd: new URL('../..', import.meta.url).pathname,
  encoding: 'utf8',
});
const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

// Extrae la funcion real (equilibrando llaves) del script del monolito.
function extractRender(htmlSource, label) {
  const script = [...htmlSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function renderHistoricalAnalytics'));
  const match = /function\s+renderHistoricalAnalytics\s*\(/.exec(script);
  assert.ok(match, `renderHistoricalAnalytics ausente en ${label}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer renderHistoricalAnalytics de ${label}`);
}

const headFn = extractRender(headHtml, 'HEAD');
const treeFn = extractRender(treeHtml, 'arbol de trabajo');

const CANVAS_IDS = ['chartMonthlyEvolution', 'chartConversionTrend', 'chartCampaignPerformance',
  'chartMedioDistribution', 'chartAgentPerformance', 'chartMonthlyStates',
  'chartMonthlyCampaigns', 'chartFunnel'];

// Sandbox minimal: DOM falso (elemento por id), agregados/KPIs/series puras
// de reportes.js y stubs identicos para HEAD y arbol para que la igualdad
// solo dependa de la plantilla y de las configs, no del entorno. Devuelve un
// runner que reconstruye estado y ejecuta el render n veces.
function sandbox(sample) {
  const elements = new Map();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const el = {
      innerHTML: '', textContent: '', className: '',
      querySelector: () => null, querySelectorAll: () => [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    };
    elements.set(id, el);
    el.id = id;
    return el;
  };
  const configs = [], destroys = [];
  const windowObj = {};
  if (sample.withChart) {
    class FakeChart {
      constructor(canvas, config) { configs.push({ canvasId: canvas.id, config }); this.canvas = canvas; }
      destroy() { destroys.push(this.canvas.id); }
    }
    FakeChart.defaults = { color: null, font: {} };
    windowObj.Chart = FakeChart;
  }
  const context = vm.createContext({
    Chart: windowObj.Chart,
    console: { warn() {}, log() {}, error() {} },
    document: {
      getElementById: element,
      documentElement: { dataset: { theme: 'dark' } },
    },
    window: windowObj,
    // Registro de instancias del monolito y stubs identicos en ambas variantes
    histCharts: {},
    populateHistoricalFilterOptions() {},
    filterHistoricalLeads() { return { data: sample.data, historical: true }; },
    updateHistRangeNotice() {},
    // Piezas puras del legacy (en navegador entran por window.*, aca directo)
    escapeHtml, historicalSummaryRows, historicalKpiTotals, historicalRecordMonth, histMonthLabel,
    computeHistoricalAggregates, historicalChartSeries,
    tablaVaciaHistoricoHtml, tablaHistoricoHtml,
    histChartMonthly, histChartConversion, histChartCampaign, histChartMedio,
    histChartAgent, histChartMonthlyStates, histChartMonthlyCampaigns, histChartFunnel,
  });
  vm.runInContext(sample.sourceFn, context);
  return { render(times = 1) {
    const resultados = [];
    for (let i = 0; i < times; i++) {
      configs.length = 0;
      context.renderHistoricalAnalytics();
      resultados.push({
        kpis: {
          totalLeads: element('histKpiTotalLeads').textContent,
          inscritos: element('histKpiInscritos').textContent,
          agendados: element('histKpiAgendados').textContent,
          noContesta: element('histKpiNoContesta').textContent,
          conversion: element('histKpiConversion').textContent,
        },
        record: {
          month: element('histKpiRecordMonth').textContent,
          count: element('histKpiRecordCount').textContent,
        },
        tabla: element('histMonthlyTableBody').innerHTML,
        configDefault: {
          color: windowObj.Chart && windowObj.Chart.defaults.color,
          family: windowObj.Chart && windowObj.Chart.defaults.font.family,
        },
        configs: configs.map(e => ({
          canvasId: e.canvasId,
          config: JSON.parse(JSON.stringify(e.config, (_k, v) => typeof v === 'function' ? String(v) : v)),
        })),
      });
    }
    return resultados;
  }, destroys };
}

const BASE_LEAD = {
  id: 1, Nombre: 'Sintetico', Telefono: '3055551234', Fecha: '05/01/2026', Mes: 'Enero',
  'Campaña': 'Verano & Rio', 'Medio': 'Meta Ads', 'Agente ': 'Loli',
  'GESTION': 'INSCRITO', 'OBSERVACIONES ': 'Contacto',
};

const LEADS_ACTUALES = [
  BASE_LEAD,
  { ...BASE_LEAD, id: 2, Fecha: '12/01/2026', 'Campaña': 'Weston', 'Medio': 'Instagram', 'Agente ': 'Ana', 'GESTION': 'AGENDADO' },
  { ...BASE_LEAD, id: 3, Fecha: '3/02/2026', 'Campaña': 'Casting Largo', 'Medio': 'Meta Ads', 'Agente ': 'Loli', 'GESTION': 'NO CONTESTA' },
  { ...BASE_LEAD, id: 4, Fecha: '3/02/2026', 'Campaña': 'Weston', 'Medio': 'Referido', 'Agente ': 'Ana', 'GESTION': 'INSCRITA' },
  { ...BASE_LEAD, id: 5, Fecha: '9/03/2026', 'Campaña': 'Otra', 'Medio': 'Meta Ads', 'Agente ': 'Sixto', 'GESTION': 'INSCRITO' },
];

const LEADS_HISTORICO = [
  { ...BASE_LEAD, id: 900, Fecha: '05/01/2025', Mes: 'Enero 2025', 'Campaña': 'Verano 2025', __origin: 'historico' },
  { ...BASE_LEAD, id: 901, Fecha: '20/01/2025', Mes: 'Enero 2025', 'Campaña': 'Weston 2025', 'GESTION': 'AGENDADO', __origin: 'historico' },
  { ...BASE_LEAD, id: 902, Fecha: '7/02/2025', Mes: 'Febrero 2025', 'Campaña': 'Casting 2025 X & Y', 'Medio': 'WhatsApp Con & Caracteres', 'GESTION': 'INSCRITO', __origin: 'historico' },
];

const SOURCES = [
  { data: LEADS_ACTUALES, titulo: 'leads actuales multi-mes/campana/medio/agente' },
  { data: LEADS_HISTORICO, titulo: 'leads de tipo historico' },
  { data: [], titulo: 'vacio (tabla empty y series a cero)' },
];

for (const s of SOURCES) {
  test(`renderHistoricalAnalytics coincide byte a byte con el golden de HEAD: ${s.titulo}`, () => {
    const golden = sandbox({ data: s.data, withChart: true, sourceFn: headFn }).render();
    const nuevo = sandbox({ data: s.data, withChart: true, sourceFn: treeFn }).render();
    // El mock funcional registro los 8 graficos asociados a su canvas.
    assert.deepEqual(golden[0].configs.map(e => e.canvasId), CANVAS_IDS, 'golden con 8 configs');
    assert.deepEqual(nuevo, golden, 'configs, tablas, KPIs y defaults identicos');
    // Senal de que el mock captura contenido real (accesorio del sample).
    if (s.data.length > 0) assert.match(golden[0].tabla, /<tr\b/, 'tabla con filas');
  });
}

test('sin Chart.js escribe KPIs y tabla y no crea graficos (contrato igual en ambos)', () => {
  const golden = sandbox({ data: LEADS_ACTUALES.slice(0, 2), withChart: false, sourceFn: headFn }).render();
  const nuevo = sandbox({ data: LEADS_ACTUALES.slice(0, 2), withChart: false, sourceFn: treeFn }).render();
  assert.deepEqual(nuevo, golden);
  assert.match(nuevo[0].tabla, /<tr\b/, 'tabla escrita aunque Chart falte');
});

test('re-render destruye las 8 instancias previas via histCharts.destroy()', () => {
  const golden = sandbox({ data: LEADS_ACTUALES, withChart: true, sourceFn: headFn }).render(2);
  const nuevo = sandbox({ data: LEADS_ACTUALES, withChart: true, sourceFn: treeFn }).render(2);
  const goldenDestroys = sandbox({ data: LEADS_ACTUALES, withChart: true, sourceFn: headFn });
  goldenDestroys.render(2);
  const nuevoDestroys = sandbox({ data: LEADS_ACTUALES, withChart: true, sourceFn: treeFn });
  nuevoDestroys.render(2);
  assert.deepEqual(nuevo, golden);
  assert.deepEqual(nuevoDestroys.destroys, goldenDestroys.destroys);
  assert.equal(nuevoDestroys.destroys.length, 8, '8 destroys tras la segunda pasada');
});

test('tablaHistoricoHtml: 9 columnas, escape y badge por umbral; vacia colspan 9', () => {
  const html = tablaHistoricoHtml([{
    mes: 'Enero <2026>', total: 12, agendados: 4, noContesta: 2, inscritos: 6,
    conv: 50, monthPct: 100, topCamp: 'Camp <A>', topAg: 'An & Ana',
  }, { mes: 'Febrero 2026', total: 0, agendados: 0, noContesta: 0, inscritos: 0, conv: 0, monthPct: 0, topCamp: '', topAg: '' }]);
  assert.equal((html.match(/<tr\b/g) || []).length, 2);
  assert.match(html, /Enero &lt;2026&gt;/);
  assert.match(html, /Camp &lt;A&gt;/);
  assert.match(html, /An &amp; Ana/);
  assert.match(html, /50%/);
  assert.match(html, /bg-emerald-500\/10/, 'badge verde con conv>=15');
  assert.match(html, /bg-indigo-500\/10/, 'badge indigo con conv<15');
  assert.ok(html.trim().startsWith('<tr'), 'sin envoltorio extra');
  const vacia = tablaVaciaHistoricoHtml();
  assert.match(vacia, /colspan="9"/);
  assert.match(vacia, /No hay registros con los filtros seleccionados/);
});

test('configs puros: cada histChartX devuelve el objeto exacto, sin Chart ni window', () => {
  const chartTheme = { text: '#94a3b8', grid: 'rgba(51, 65, 85, 0.35)' };
  const commonScales = {
    x: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text, font: { size: 11 } } },
    y: { grid: { color: chartTheme.grid }, ticks: { color: chartTheme.text, font: { size: 11 } }, beginAtZero: true },
  };
  const series = historicalChartSeries(LEADS_ACTUALES,
    computeHistoricalAggregates(LEADS_ACTUALES), historicalKpiTotals(LEADS_ACTUALES));

  const monthly = histChartMonthly(['M1'], series, commonScales);
  assert.equal(monthly.type, undefined, 'mixto line+bar sin type en el top');
  assert.equal(monthly.data.datasets[0].type, 'line');
  assert.equal(monthly.data.datasets[1].type, 'bar');
  assert.equal(monthly.options.scales, commonScales);

  const medio = histChartMedio(series);
  assert.equal(medio.type, 'doughnut');
  assert.deepEqual(medio.data.datasets[0].backgroundColor,
    ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4']);
  assert.equal(medio.options.cutout, '65%');

  const states = histChartMonthlyStates(['M1'], series.statesStacked, commonScales);
  const paletaEstado = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#60a5fa', '#34d399', 'rgba(100, 116, 139, 0.55)'];
  assert.ok(states.data.datasets.every((d, i) => d.backgroundColor === paletaEstado[i]), 'paleta por posicion');
  assert.ok(states.options.scales.x.stacked && states.options.scales.y.stacked);

  const camps = histChartMonthlyCampaigns(['M1'], series.campsStacked, commonScales);
  const paletaCamp = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e', '#60a5fa', 'rgba(100, 116, 139, 0.55)'];
  assert.ok(camps.data.datasets.every((d, i) => d.backgroundColor === paletaCamp[i]), 'paleta por posicion');

  const funnel = histChartFunnel(series.funnel, commonScales);
  assert.ok(funnel.data.labels[0].startsWith('Recibidos: '));
  assert.deepEqual(funnel.data.datasets[0].backgroundColor, ['#3b82f6', '#94a3b8', '#f59e0b', '#10b981']);
  assert.equal(funnel.options.indexAxis, 'y');

  for (const cfg of [monthly, histChartConversion(['M1'], series, commonScales),
    histChartCampaign(series, commonScales), medio, histChartAgent(series, commonScales),
    states, camps, funnel]) {
    const str = JSON.stringify(cfg, (_k, v) => typeof v === 'function' ? String(v) : v);
    assert.ok(!str.includes('window.') && !str.includes('new Chart'), 'config autonomico');
    assert.ok(cfg.options.responsive === true, 'responsive en todos');
  }
});

test('wrapper del monolito sin plantillas: delega paletas/options a reportes.js', () => {
  assert.doesNotMatch(treeFn, /stackedMonthlyOptions|statePalette|campPalette|backgroundColor:/,
    'el wrapper ya no lleva configs inline');
  for (const fn of ['histChartMonthly', 'histChartConversion', 'histChartCampaign',
    'histChartMedio', 'histChartAgent', 'histChartMonthlyStates',
    'histChartMonthlyCampaigns', 'histChartFunnel', 'tablaHistoricoHtml',
    'tablaVaciaHistoricoHtml']) {
    assert.match(treeFn, new RegExp(`\\b${fn}\\(`), `wrapper usa ${fn}`);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeHistoricalAggregates,
  historicalChartSeries,
  historicalKpiTotals,
} from '../../src/legacy/reportes.js';

const lead = (over = {}) => ({
  Mes: 'ENERO',
  Fecha: '10/1/2026',
  GESTION: 'INSCRITO',
  'Campaña': 'A',
  'Medio': 'Facebook',
  'Agente ': 'Ana',
  ...over,
});

// Cinco leads deterministas: 2 en Enero, 3 en Marzo; campanas A/B/Sin;
// medios Facebook/Instagram/Directo-Otro; asesores Ana/Beto/Sin Asignar.
const data = [
  lead(),
  lead({ GESTION: 'AGENDADO' }),
  lead({ Mes: 'MARZO', Fecha: '1/3/2026', 'Campaña': 'B', 'Medio': 'Instagram', 'Agente ': ' ' }),
  lead({ Mes: 'MARZO', Fecha: '2/3/2026', GESTION: 'NO CONTESTA', 'Campaña': 'B', 'Medio': ' ', 'Agente ': 'Beto' }),
  lead({ Mes: 'MARZO', Fecha: '3/3/2026', 'Campaña': ' ', 'Medio': ' ', 'Agente ': 'Beto' }),
];

function seriesFor(rows = data) {
  const aggregates = computeHistoricalAggregates(rows);
  const kpis = historicalKpiTotals(rows);
  return { series: historicalChartSeries(rows, aggregates, kpis), aggregates, kpis };
}

test('series mensuales alineadas a activeMonths con conversion numerica', () => {
  const { series } = seriesFor();
  assert.deepEqual(series.monthly.inscritos, [1, 2]);
  assert.deepEqual(series.monthly.total, [2, 3]);
  assert.deepEqual(series.monthly.conversion, [50, 66.7]);
});

test('campanas: top 6 por total, fallback Sin Campana y orden estable', () => {
  const { series } = seriesFor();
  assert.deepEqual(series.campaigns.labels, ['A', 'B', 'Sin Campaña']);
  assert.deepEqual(series.campaigns.totals, [2, 2, 1]);
  assert.deepEqual(series.campaigns.inscritos, [1, 1, 1]);
});

test('medios: top 6 por frecuencia con fallback Directo/Otro', () => {
  const { series } = seriesFor();
  assert.deepEqual(series.medios.labels, ['Facebook', 'Directo/Otro', 'Instagram']);
  assert.deepEqual(series.medios.counts, [2, 2, 1]);
});

test('asesores: regla Sin Asignar oculto salvo total > 2, orden por inscritos', () => {
  const { series } = seriesFor();
  // 'Sin Asignar' tiene total 1 y queda fuera; Ana/Beto empatan a 1 inscrito
  // y conservan el orden de insercion.
  assert.deepEqual(series.agents.labels, ['Ana', 'Beto']);
  assert.deepEqual(series.agents.totals, [2, 2]);
  assert.deepEqual(series.agents.inscritos, [1, 1]);
});

test('Sin Asignar con total grande entra en la serie', () => {
  const rows = Array.from({ length: 3 }, (_, i) =>
    lead({ Mes: 'MARZO', Fecha: `${i + 1}/3/2026`, GESTION: 'INFORMACIÓN', 'Agente ': ' ' }),
  );
  const { series } = seriesFor(rows);
  assert.ok(series.agents.labels.includes('Sin Asignar'));
});

test('estados/campanas apilados: series por mes y sin bucket sin excedente', () => {
  const { series, aggregates } = seriesFor();
  assert.equal(series.statesStacked.other, null);
  assert.equal(series.campsStacked.other, null);
  // Top seleccionado identico al orden descendente de los totales del agregado.
  const topCamps = Object.entries(aggregates.campTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  assert.deepEqual(series.campsStacked.series.map(s => s.label), topCamps);
  const camp = series.campsStacked.series[0];
  assert.equal(camp.data.length, aggregates.activeMonths.length);
  assert.equal(camp.data.reduce((a, b) => a + b, 0), aggregates.campTotals[camp.label]);
});

test('Otras campanas cuando hay mas de 5 con residuo Math.max por mes', () => {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    rows.push(lead({ 'Campaña': `C${i}` }));
    rows.push(lead({ Mes: 'MARZO', Fecha: '1/3/2026', 'Campaña': `C${i}` }));
  }
  const { series, aggregates } = seriesFor(rows);
  assert.equal(series.campsStacked.series.length, 5);
  assert.ok(series.campsStacked.other);
  assert.equal(series.campsStacked.other.label, 'Otras');
  const inTop = series.campsStacked.series.reduce(
    (sum, s) => sum + s.data.reduce((a, b) => a + b, 0), 0,
  );
  const totalAll = Object.values(aggregates.campTotals).reduce((a, b) => a + b, 0);
  assert.equal(series.campsStacked.other.data.reduce((a, b) => a + b, 0), totalAll - inTop);
});

test('embudo: etapas fijas y valores coherentes con agregado y kpis', () => {
  const { series, aggregates, kpis } = seriesFor();
  assert.deepEqual(series.funnel.stages, ['Recibidos', 'Gestionados', 'Agendados', 'Inscritos']);
  assert.deepEqual(series.funnel.values, [data.length, aggregates.funnelGestionados, kpis.totalAgendados, kpis.totalInscritos]);
});

test('invasores: data rara no lanza y no muta la entrada', () => {
  const aggregates = computeHistoricalAggregates([]);
  const kpis = historicalKpiTotals([]);
  assert.deepEqual(historicalChartSeries(null, aggregates, kpis).monthly.total, []);
  assert.deepEqual(historicalChartSeries('x', aggregates, kpis).campaigns.labels, []);
  const snapshot = JSON.stringify(data);
  historicalChartSeries(data, ...[computeHistoricalAggregates(data), historicalKpiTotals(data)]);
  assert.equal(JSON.stringify(data), snapshot);
});

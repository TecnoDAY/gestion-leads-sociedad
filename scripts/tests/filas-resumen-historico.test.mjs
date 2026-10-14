import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historicalSummaryRows } from '../../src/legacy/reportes.js';

const lead = (over = {}) => ({
  Mes: 'FEBRERO',
  Fecha: '10/2/2026',
  GESTION: 'INSCRITO',
  'Campaña': 'Kids',
  'Agente ': 'Ana',
  ...over,
});

test('fila tipica con shape completo y conv/monthPct como strings sin %', () => {
  const rows = historicalSummaryRows([
    lead(),
    lead({ 'Campaña': 'Zeta', 'Agente ': 'Beto' }),
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    mes: 'FEBRERO 2026',
    total: 2,
    agendados: 0,
    noContesta: 0,
    inscritos: 2,
    conv: '100.0',
    monthPct: '100.0',
    topCamp: 'Kids',
    topAg: 'Ana',
  });
});

test('mes OTRO entra con su etiqueta y ceros honestos', () => {
  const rows = historicalSummaryRows([
    lead({ Mes: 'OTRO', Fecha: 'sin fecha', GESTION: 'INFORMACIÓN' }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mes, 'OTRO');
  assert.equal(rows[0].inscritos, 0);
  assert.equal(rows[0].conv, '0.0');
});

test('dos meses: percentual del total repartido por cada mes', () => {
  const rows = historicalSummaryRows([
    lead({ Mes: 'ENERO', Fecha: '1/1/2026' }),
    lead({ Mes: 'MARZO', Fecha: '1/3/2026' }),
    lead({ Mes: 'MARZO', Fecha: '2/3/2026' }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].monthPct, '66.7');
  assert.equal(rows[0].monthPct, '33.3');
});

test('invasores y vacios no lanzan ni mutan', () => {
  assert.deepEqual(historicalSummaryRows(null), []);
  assert.deepEqual(historicalSummaryRows(undefined), []);
  assert.deepEqual(historicalSummaryRows('x'), []);
  const data = [lead()];
  const snapshot = JSON.stringify(data);
  assert.equal(historicalSummaryRows(data).length, 1);
  assert.equal(JSON.stringify(data), snapshot);
});

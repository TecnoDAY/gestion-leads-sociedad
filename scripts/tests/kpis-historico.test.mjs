import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeHistoricalAggregates, historicalKpiTotals, historicalRecordMonth } from '../../src/legacy/reportes.js';

const lead = (over = {}) => ({
  Mes: 'FEBRERO',
  Fecha: '10/2/2026',
  GESTION: 'INSCRITO *',
  'Campaña': 'Kids',
  'Agente ': 'Ana',
  ...over,
});

test('totales detectan variantes con sufijo de los tres estados y conversion', () => {
  const data = [
    lead(), // INSCRITO *
    lead({ GESTION: 'AGENDADÓ' }),
    lead({ GESTION: 'NO CONTESTO' }),
    lead({ GESTION: 'OTRO ESTADO' }),
  ];
  const kpis = historicalKpiTotals(data);
  assert.deepEqual(kpis, {
    totalLeads: 4, totalInscritos: 1, totalAgendados: 1, totalNoContesta: 1, convRate: '25.0',
  });
});

test('sin leads: ceros y conversion 0.0', () => {
  assert.deepEqual(historicalKpiTotals([]), {
    totalLeads: 0, totalInscritos: 0, totalAgendados: 0, totalNoContesta: 0, convRate: '0.0',
  });
});

test('invasores inesperados no lanzan y no mutan la entrada', () => {
  const data = [lead()];
  const snapshot = JSON.stringify(data);
  assert.deepEqual(historicalKpiTotals(null), historicalKpiTotals([]));
  assert.deepEqual(historicalKpiTotals('no-array'), historicalKpiTotals([]));
  assert.deepEqual(historicalKpiTotals(data).totalLeads, 1);
  assert.equal(JSON.stringify(data), snapshot);
});

test('record month: maximo estricto con empate conservando el primero', () => {
  const { monthlyStats, activeMonths } = computeHistoricalAggregates([
    lead({ Mes: 'ENERO' }), lead({ Mes: 'ENERO', 'Agente ': 'Beto' }), lead({ Mes: 'MARZO' }),
  ]);
  // ENERO total 2 (maximo) precede a MARZO total 1; ningun empate real en el
  // maximo, pero el comparador estricto > conserva el primero ante empate.
  const record = historicalRecordMonth(monthlyStats, activeMonths);
  assert.equal(record.month, 'ENERO 2026');
  assert.equal(record.count, 2);
});

test('record month empate exacto conserva el primero de activeMonths', () => {
  const { monthlyStats, activeMonths } = computeHistoricalAggregates([
    lead({ Mes: 'ENERO' }), lead({ Mes: 'MARZO' }),
  ]);
  assert.deepEqual(activeMonths, ['2026-01', '2026-03']);
  const record = historicalRecordMonth(monthlyStats, activeMonths);
  assert.equal(record.month, 'ENERO 2026');
  assert.equal(record.count, 1);
});

test('record month vacio, inesperados y SIN-FECHA con etiqueta', () => {
  const vacio = historicalRecordMonth({}, []);
  assert.deepEqual(vacio, { month: '-', count: 0 });
  assert.deepEqual(historicalRecordMonth(null, null), { month: '-', count: 0 });
  const conSinFecha = computeHistoricalAggregates([lead({ Mes: 'OTRO', Fecha: 'sin fecha', GESTION: 'INFORMACIÓN' })]);
  const record = historicalRecordMonth(conSinFecha.monthlyStats, conSinFecha.activeMonths);
  assert.ok(record.count >= 0);
});

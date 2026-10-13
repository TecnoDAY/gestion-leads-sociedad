import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeHistoricalAggregates } from '../../src/legacy/reportes.js';

test('sin leads devuelve agregados vacios y embudo cero', () => {
  assert.deepEqual(computeHistoricalAggregates([]), {
    monthlyStats: {}, activeMonths: [], stateTotals: {}, stateByMonth: {},
    campTotals: {}, campByMonth: {}, funnelGestionados: 0,
  });
});

test('separa meses por ano y preserva el Mes declarado ante Fecha distinta', () => {
  const result = computeHistoricalAggregates([
    { Mes: 'FEBRERO', Fecha: '1/3/2025', GESTION: 'INSCRITO', 'Campaña': 'Kids', 'Agente ': 'Ana' },
    { Mes: 'FEBRERO', Fecha: '1/3/2026', GESTION: 'AGENDADO CANCELADO', 'Campaña': 'Kids' },
    { Mes: 'FEBRERO', Fecha: 'sin fecha', GESTION: 'NO CONTESTA' },
    { Mes: 'OTRO', GESTION: 'INFORMACIÓN' },
  ]);
  assert.deepEqual(result.activeMonths, ['2025-02', '2026-02', 'SIN-FECHA·FEBRERO', 'OTRO']);
  assert.equal(result.monthlyStats['2025-02'].inscritos, 1);
  assert.equal(result.monthlyStats['2025-02'].agentes.Ana, 1);
  assert.equal(result.monthlyStats['2026-02'].agendados, 1);
  assert.equal(result.monthlyStats['SIN-FECHA·FEBRERO'].noContesta, 1);
  assert.equal(result.campTotals.Kids, 2);
  assert.equal(result.campByMonth['2025-02'].Kids, 1);
  assert.equal(result.funnelGestionados, 3);
});

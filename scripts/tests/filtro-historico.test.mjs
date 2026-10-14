import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHistoricalFilters } from '../../src/legacy/reportes.js';

// Fixtures: Mes canonico manda; Fecha parseable d/m/aaaa.
const lead = (over = {}) => ({
  Mes: 'FEBRERO', Fecha: '10/2/2026', 'Campaña': 'Kids', 'Agente ': 'Ana', ...over,
});

test('sin filtros devuelve los mismos datos, rangeActive false y cero excluidos', () => {
  const data = [lead(), lead({ 'Campaña': 'Otros' })];
  const snapshot = JSON.stringify(data);
  const result = applyHistoricalFilters(data, {});
  assert.deepEqual(result, { data, rangeActive: false, excludedNoDate: 0 });
  assert.equal(JSON.stringify(data), snapshot, 'no muta la entrada');
});

test('campana filtra por igualdad exacta tras trim y preserva el orden', () => {
  const data = [lead(), lead({ 'Campaña': 'Kids Club' }), lead()];
  const result = applyHistoricalFilters(data, { campana: 'Kids' });
  assert.deepEqual(result.data, [data[0], data[2]]);
});

test('agente usa la clave con espacio final (Agente )', () => {
  const data = [lead({ 'Agente ': 'Luis' }), lead()];
  const result = applyHistoricalFilters(data, { agente: 'Luis' });
  assert.deepEqual(result.data, [data[0]]);
});

test('ano SIN-FECHA conserva solo leads sin fecha parseable', () => {
  const data = [lead(), lead({ Fecha: 'sin fecha' }), lead({ Fecha: '' })];
  const result = applyHistoricalFilters(data, { anio: 'SIN-FECHA' });
  assert.deepEqual(result.data, [data[1], data[2]]);
});

test('ano especifico filtra por el anio del reporte, no por el Mes', () => {
  const data = [lead({ Fecha: '1/3/2025' }), lead({ Fecha: '1/3/2026' })];
  const result = applyHistoricalFilters(data, { anio: '2025' });
  assert.deepEqual(result.data, [data[0]]);
});

test('rango activo tiene precedencia sobre el filtro de mes', () => {
  const data = [
    lead({ Mes: 'ENERO', Fecha: '5/1/2026' }),
    lead({ Mes: 'FEBRERO', Fecha: '10/2/2026' }),
    lead({ Mes: 'MARZO', Fecha: '5/3/2026' }),
  ];
  const range = { from: Date.UTC(2026, 1, 1), to: Date.UTC(2026, 1, 28) };
  const result = applyHistoricalFilters(data, { mes: 'ENERO', anio: '', range });
  assert.deepEqual(result.data, [data[1]]);
  assert.equal(result.rangeActive, true);
});

test('rango solo desde / solo hasta y conteo de sin fecha excluidos', () => {
  const data = [lead({ Fecha: '1/2/2026' }), lead({ Fecha: '20/2/2026' }), lead({ Fecha: 'no' })];
  const soloDesde = applyHistoricalFilters(data, { range: { from: Date.UTC(2026, 1, 10), to: null } });
  assert.deepEqual(soloDesde.data, [data[1]]);
  assert.equal(soloDesde.excludedNoDate, 1);
  const soloHasta = applyHistoricalFilters(data, { range: { from: null, to: Date.UTC(2026, 1, 10) } });
  assert.deepEqual(soloHasta.data, [data[0]]);
  assert.equal(soloHasta.excludedNoDate, 1);
});

test('sin rango activo el filtro de mes aplica sobre el Mes canonico', () => {
  const data = [lead({ Mes: 'FEBRERO' }), lead({ Mes: 'MARZO', Fecha: '1/2/2026' })];
  const result = applyHistoricalFilters(data, { mes: 'FEBRERO' });
  assert.deepEqual(result.data, [data[0]]);
});

test('campana y agente se combinan y el rango respeta los filtros previos', () => {
  const data = [
    lead({ 'Campaña': 'Kids', 'Agente ': 'Luis', Fecha: '1/2/2026' }),
    lead({ 'Campaña': 'Kids', 'Agente ': 'Ana', Fecha: '2/2/2026' }),
    lead({ 'Campaña': 'Otros', 'Agente ': 'Luis', Fecha: '3/2/2026' }),
  ];
  const result = applyHistoricalFilters(data, {
    campana: 'Kids', agente: 'Luis', range: { from: Date.UTC(2026, 1, 2), to: null },
  });
  assert.deepEqual(result.data, []);
  assert.equal(result.excludedNoDate, 0);
});

test('entradas inesperadas no lanzan: datos no array y filtros ausentes', () => {
  assert.deepEqual(applyHistoricalFilters(null), { data: [], rangeActive: false, excludedNoDate: 0 });
  assert.deepEqual(applyHistoricalFilters(undefined, { range: null }), { data: [], rangeActive: false, excludedNoDate: 0 });
  const data = [lead()];
  assert.equal(applyHistoricalFilters(data, { range: null }).data.length, 1);
});

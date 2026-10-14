import assert from 'node:assert/strict';
import {test} from 'node:test';
import {historicalFilterOptions} from '../../src/legacy/reportes.js';

const lead = (over = {}) => ({
  Mes: 'FEBRERO',
  Fecha: '10/2/2026',
  'Campaña': 'Kids',
  'Agente ': 'Ana',
  ...over,
});

test('devuelve opciones vacias sin mutar una entrada vacia', () => {
  assert.deepEqual(historicalFilterOptions([]), {
    campanas: [], agentes: [], meses: [], anios: [], haySinFecha: false,
  });
});

test('deduplica y ordena campanas y agentes con comparacion espanola', () => {
  const data = [
    lead({'Campaña': 'Zeta', 'Agente ': 'Álvaro'}),
    lead({'Campaña': 'alfa', 'Agente ': 'Beatriz'}),
    lead({'Campaña': 'Zeta', 'Agente ': 'Álvaro'}),
  ];
  const result = historicalFilterOptions(data);
  assert.deepEqual(result.campanas, ['alfa', 'Zeta']);
  assert.deepEqual(result.agentes, ['Álvaro', 'Beatriz']);
});

test('ordena meses cronologicos y OTRO al final', () => {
  const data = [
    lead({Mes: 'OTRO', Fecha: 'sin fecha'}),
    lead({Mes: 'ENERO'}),
    lead({Mes: 'MARZO'}),
    lead({Mes: 'ENERO'}),
  ];
  assert.deepEqual(historicalFilterOptions(data).meses, ['ENERO', 'MARZO', 'OTRO']);
});

test('ordena anos y marca SIN-FECHA sin inventar un ano', () => {
  const data = [
    lead({Fecha: '1/1/2025'}),
    lead({Fecha: '1/1/2026'}),
    lead({Fecha: 'no valida'}),
    lead({Fecha: ''}),
  ];
  const result = historicalFilterOptions(data);
  assert.deepEqual(result.anios, ['2025', '2026']);
  assert.equal(result.haySinFecha, true);
});

test('ignora valores vacios y entradas inesperadas, sin mutar datos', () => {
  const data = [lead({Mes: '', Fecha: 'sin fecha', 'Campaña': ' ', 'Agente ': null}), null, 4];
  const snapshot = JSON.stringify(data);
  assert.deepEqual(historicalFilterOptions(data), {
    campanas: [], agentes: [], meses: ['OTRO'], anios: [], haySinFecha: true,
  });
  assert.equal(JSON.stringify(data), snapshot);
  assert.deepEqual(historicalFilterOptions(null), {
    campanas: [], agentes: [], meses: [], anios: [], haySinFecha: false,
  });
});

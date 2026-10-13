import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeCatalogValues, catalogOptions } from '../../src/legacy/catalogos.js';

const rows = {
  campana: [
    { value: 'Weston', active: true },
    { value: 'Acuario', active: true },
    { value: 'Oculta', active: false },
  ],
  mes: [{ value: 'MARZO', active: true }, { value: 'ENERO', active: true }],
};

test('solo devuelve valores activos del catalogo, o vacio para tipo desconocido', () => {
  assert.deepEqual(activeCatalogValues(rows, 'campana'), ['Weston', 'Acuario']);
  assert.deepEqual(activeCatalogValues(rows, 'sin-tipo'), []);
});

test('une catalogo y datos, deduplica y oculta valores desactivados conocidos', () => {
  assert.deepEqual(catalogOptions(rows, 'campana', ['Doral', 'Doral', 'Weston', 'Oculta']),
    ['Acuario', 'Doral', 'Weston']);
});

test('ordena los meses cronologicamente y acepta datos ausentes', () => {
  assert.deepEqual(catalogOptions(rows, 'mes', ['OCTUBRE', 'ENERO']), ['ENERO', 'MARZO', 'OCTUBRE']);
  assert.deepEqual(catalogOptions({}, 'campana'), []);
});

test('no muta las filas ni los valores de entrada', () => {
  const original = structuredClone(rows);
  const dataValues = ['Doral', 'Weston'];
  catalogOptions(rows, 'campana', dataValues);
  assert.deepEqual(rows, original);
  assert.deepEqual(dataValues, ['Doral', 'Weston']);
});

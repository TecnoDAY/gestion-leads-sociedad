import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { activeCatalogValues, catalogOptions, programasDisponibles } from '../../src/legacy/catalogos.js';

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

describe('programas disponibles (interesado en / programa de inscripcion)', () => {
  const catalogos = {
    campana: [
      { value: 'Actuacion adultos', active: true },
      { value: 'Actuacion kids', active: true },
      { value: 'Kids doral inglés', active: true },
      { value: 'Sin definir', active: true },
      { value: 'Taller camara', active: true },
      { value: 'Weston', active: true },
      { value: 'Casting bootcamp', active: false },
      { value: 'Summer camp', active: false },
    ],
  };

  test('solo se ofrecen las campañas activas y sin "Sin definir"', () => {
    assert.deepEqual(programasDisponibles(catalogos), [
      'Actuacion adultos', 'Actuacion kids', 'Kids doral inglés', 'Taller camara', 'Weston',
    ]);
  });

  test('sin catálogo o sin campañas activas no hay opciones', () => {
    assert.deepEqual(programasDisponibles(null), []);
    assert.deepEqual(programasDisponibles({ campana: [] }), []);
    assert.deepEqual(programasDisponibles({ campana: [{ value: 'X', active: false }] }), []);
  });

  test('no muta el catálogo de entrada', () => {
    const original = structuredClone(catalogos);
    programasDisponibles(catalogos);
    assert.deepEqual(catalogos, original);
  });
});

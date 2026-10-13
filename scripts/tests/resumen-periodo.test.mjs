import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidateLeadsById } from '../../src/legacy/helpers.js';
import { buildPeriodSummary, validatePeriodoSummary } from '../../src/legacy/reportes.js';

// --- consolidateLeadsById (helpers) ---
test('consolida por id mas reciente primero y hace merge de campos', () => {
  const result = consolidateLeadsById([
    { id: 2, Nombre: 'Ana', Nombre2: 'x' },
    { id: 10, Nombre: 'Beto' },
    { id: 2, Nombre: 'Ana2' },
  ]);
  assert.deepEqual(result.map(l => l.id), [10, 2]);
  assert.equal(result[1].Nombre, 'Ana2'); // merge conserva el ultimo campo
});

test('consolidar lanza ante lead sin id y no muta la entrada', () => {
  assert.throws(() => consolidateLeadsById([{ Nombre: 'sin id' }]), /sin id/);
  const data = [{ id: 1 }];
  consolidateLeadsById(data);
  assert.deepEqual(data, [{ id: 1 }]);
});

// --- buildPeriodSummary (reportes) ---
const catalogs = {
  medio: [{ value: 'Facebook', active: true }, { value: 'TikTok', active: false }],
  campana: [{ value: 'Kids', active: true }],
  gestion: [{ value: 'INSCRITO', active: true }],
};
const leads = [
  { id: 3, Medio: 'Facebook', 'Campaña': 'Kids', GESTION: 'INSCRITO', Fecha: '10/2/2026' },
  { id: 2, Medio: 'Whatsapp', 'Campaña': 'Verano', GESTION: 'AGENDADO', Fecha: '11/2/2026' },
  { id: 1, Medio: 'Facebook', 'Campaña': 'Kids', GESTION: 'INSCRITO', Fecha: 'sin' },
];

test('resumen por periodo: total, fechas invalidas y catalogos activos', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  assert.equal(s.total, 2); // id1 con fecha invalida queda excluido del total
  assert.equal(s.fechas_invalidas, 1);
  // TikTok desactivado no aparece; 'Sin definir' se anade con 0; orden alfab.
  assert.deepEqual(s.medios.map(r => [r.label, r.count]), [['Facebook', 1], ['Sin definir', 0], ['Whatsapp', 1]]);
  assert.deepEqual(s.campanas.map(r => [r.label, r.count]), [['Kids', 1], ['Sin definir', 0], ['Verano', 1]]);
  assert.deepEqual(s.gestiones.map(r => [r.label, r.count]), [['AGENDADO', 1], ['INSCRITO', 1], ['Sin definir', 0]]);
  assert.equal(s.totales.matriz, 2);
});

test('matriz gestion x campana coherente con los conteos por celda', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  assert.deepEqual(s.matriz.campanas, ['Kids', 'Sin definir', 'Verano']);
  const fila = label => s.matriz.filas.find(r => r.label === label);
  // INSCRITO x Kids = 1; AGENDADO x Verano = 1; el resto 0.
  assert.deepEqual(fila('INSCRITO').counts, [1, 0, 0]);
  assert.deepEqual(fila('AGENDADO').counts, [0, 0, 1]);
  assert.deepEqual(s.matriz.totales_columnas, [1, 0, 1]);
});

test('rango invertido o invalido lanza period_range_invalid', () => {
  assert.throws(() => buildPeriodSummary([], catalogs, '2026-02-28', '2026-02-01'), /period_range_invalid/);
  assert.throws(() => buildPeriodSummary([], catalogs, 'x', '2026-02-01'), /period_range_invalid/);
});

test('leads vacios: total cero con catalogos activos en 0 y Sin definir', () => {
  const s = buildPeriodSummary([], catalogs, '2026-02-01', '2026-02-28');
  assert.equal(s.total, 0);
  // El catalogo activo (Facebook) se muestra con 0 y se anade Sin definir.
  assert.deepEqual(s.medios, [{ label: 'Facebook', count: 0 }, { label: 'Sin definir', count: 0 }]);
});

// --- validatePeriodoSummary (reportes) ---
test('validador lanza si los totales no cuadran', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  const bad = { ...s, total: 99 };
  assert.throws(() => validatePeriodoSummary(bad, '2026-02-01', '2026-02-28'), /no coinciden/);
});

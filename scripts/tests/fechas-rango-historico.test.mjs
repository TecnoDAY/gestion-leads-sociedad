import assert from 'node:assert/strict';
import { test } from 'node:test';
import { histDateInputToTs, histRangePresetDates } from '../../src/legacy/reportes.js';

// Para los presets: medio dia UTC del 2026-10-13 (martes, este mes).
const HOY = Date.UTC(2026, 9, 13);

test('parseo de entrada valida a timestamp UTC de medianoche', () => {
  assert.equal(histDateInputToTs('2026-02-03'), Date.UTC(2026, 1, 3));
  assert.equal(histDateInputToTs('2026-12-31'), Date.UTC(2026, 11, 31));
});

test('parseo acepta rollover de dia imposible (contrato actual sin validacion)', () => {
  assert.equal(histDateInputToTs('2026-02-30'), Date.UTC(2026, 2, 2));
});

test('parseo rechaza formatos texting y vacios con null', () => {
  ['', '2026-2-3', '03-02-2026', '2026/02/03', '2026-02-031', 'abcd-02-03'].forEach(s => {
    assert.equal(histDateInputToTs(s), null, s);
  });
});

test('preset 7d incluye ultimos 7 dias como strings ISO', () => {
  const result = histRangePresetDates('7d', HOY);
  assert.deepEqual(result, { from: '2026-10-07', to: '2026-10-13' });
  assert.equal(histDateInputToTs(result.from), HOY - 6 * 86400000);
});

test('preset 30d incluye ultimos 30 dias', () => {
  const result = histRangePresetDates('30d', HOY);
  assert.equal(histDateInputToTs(result.from), HOY - 29 * 86400000);
  assert.equal(result.to, '2026-10-13');
});

test('preset mes arranca el dia 1 del mes y llega hasta hoy', () => {
  assert.deepEqual(histRangePresetDates('month', HOY), { from: '2026-10-01', to: '2026-10-13' });
});

test('preset clear devuelve cadenas vacias y desconocido devuelve null', () => {
  assert.deepEqual(histRangePresetDates('clear', HOY), { from: '', to: '' });
  assert.equal(histRangePresetDates('semana', HOY), null);
  assert.equal(histRangePresetDates(null, HOY), null);
});

test('month cruza de ano correctamente (enero)', () => {
  const enero = Date.UTC(2027, 0, 5);
  assert.deepEqual(histRangePresetDates('month', enero), { from: '2027-01-01', to: '2027-01-05' });
});

test('preset no muta entradas ni depende de Date.now', () => {
  const snapshot = { hoy: HOY };
  const result = histRangePresetDates('7d', HOY);
  assert.deepEqual(result, histRangePresetDates('7d', HOY));
  assert.equal(snapshot.hoy, HOY);
});

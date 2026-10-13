import assert from 'node:assert/strict';
import { test } from 'node:test';
import { histRangeNoticeText } from '../../src/legacy/reportes.js';

const base = {
  rangeActive: true,
  range: { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 9, 31) },
  data: [],
  selectedMes: '',
  excludedNoDate: 0,
};

test('rango desde/hasta con conteo y orden exactos', () => {
  const aviso = histRangeNoticeText({ ...base, data: new Array(214).fill(0) });
  assert.equal(aviso.visible, true);
  const count = (214).toLocaleString();
  assert.equal(aviso.text, `Rango: desde 2026-10-01 · hasta 2026-10-31 · ${count} leads en rango`);
});

test('rango solo desde / solo hasta: omiten el extremo ausente', () => {
  const soloDesde = histRangeNoticeText({ ...base, range: { from: Date.UTC(2026, 0, 5), to: null } });
  assert.ok(soloDesde.text.startsWith('Rango: desde 2026-01-05 · '));
  const soloHasta = histRangeNoticeText({ ...base, range: { from: null, to: Date.UTC(2026, 5, 9) } });
  assert.ok(soloHasta.text.startsWith(`Rango: hasta 2026-06-09 · `));
  assert.ok(!soloHasta.text.includes('desde'));
});

test('mes selecionado queda anulado por el rango (mismo orden de partes)', () => {
  const aviso = histRangeNoticeText({ ...base, data: [1], selectedMes: 'ENERO' });
  assert.equal(aviso.text, `Rango: desde 2026-10-01 · hasta 2026-10-31 · ${1 .toLocaleString()} leads en rango · el filtro de mes queda anulado por el rango`);
});

test('excluidos sin fecha validos entran al final con conteo', () => {
  const aviso = histRangeNoticeText({ ...base, data: [], excludedNoDate: 3 });
  assert.ok(aviso.text.endsWith(` · ${3 .toLocaleString()} sin fecha válida excluidos`));
  const cero = histRangeNoticeText({ ...base, excludedNoDate: 0 });
  assert.ok(!cero.text.includes('excluidos'));
});

test('rango inactivo: invisible y vacio', () => {
  assert.deepEqual(histRangeNoticeText({ ...base, rangeActive: false }), { visible: false, text: '' });
  assert.deepEqual(histRangeNoticeText(null), { visible: false, text: '' });
});

test('invasores: range ausente y data rara no lanzan (cero leads)', () => {
  const cero = (0).toLocaleString();
  const aviso = histRangeNoticeText({ rangeActive: true });
  assert.equal(aviso.visible, true);
  assert.ok(aviso.text.startsWith('Rango: '));
  assert.ok(aviso.text.endsWith(`${cero} leads en rango`));
  assert.ok(histRangeNoticeText({ ...base, data: 'no-array' }).text.endsWith(`${cero} leads en rango`));
  assert.ok(!histRangeNoticeText({ ...base, excludedNoDate: 'x' }).text.includes('excluidos'));
});

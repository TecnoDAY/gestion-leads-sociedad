// Caracterizacion de los KPIs de Citas (fase 19): construccion HTML pura.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citasKpiHtml } from '../../src/legacy/citas.js';

const rows = [
  { campus: 'DORAL', is_data_dura: true },
  { campus: 'DORAL', is_data_dura: false },
  { campus: 'DORAL', is_data_dura: false },
  { campus: 'WESTON', is_data_dura: true },
  { campus: 'WESTON', is_data_dura: false },
  { campus: null },
  { campus: 'DORAL', is_data_dura: null },
];
const counts = { PROGRAMADA: 3, ASISTIO: 2, NO_ASISTIO: 1, CANCELADA: 1, REPROGRAMADA: 0 };
const denom = 3;

test('principales: tarjetas fijas y tasa de asistencia con un decimal', () => {
  const { principales } = citasKpiHtml(rows, counts, denom);
  assert.equal(principales.length, 4);
  const texto = principales.join('|');
  assert.match(texto, /Total citas/);
  assert.match(texto, /7/);
  assert.match(texto, /Programadas/);
  assert.match(texto, /3/);
  assert.match(texto, /Asistieron/);
  assert.match(texto, /Tasa asistencia/);
  assert.match(texto, /66\.7%/);
  const html2 = citasKpiHtml(rows, counts, 0);
  assert.match(html2.principales.join('|'), /0\.0%/);
});

test('desglose: dolares de sede con data dura y sin sede historicas', () => {
  const { desglose } = citasKpiHtml(rows, counts, denom);
  const texto = desglose.join('|');
  assert.equal(desglose.length, 8);
  assert.match(texto, /Doral/);
  assert.match(texto, /Doral Data Dura/);
  assert.match(texto, /Weston/);
  assert.match(texto, /Weston Data Dura/);
  assert.match(texto, /Sin sede \(históricas\)/);
  assert.doesNotMatch(texto, /nocampus/);
  // los conteos del ejemplo: doral normal 3 (dos false + un null), doral dd 1,
  // weston normal 1, weston dd 1, sin sede 1
  const reconstruido = {};
  for (const tarjeta of desglose) {
    const m = /text-slate-400">([^<]+)<\/div><strong class="text-lg text-white">([0-9.]+%?)/.exec(tarjeta) || [];
    if (m) reconstruido[m[1]] = m[2];
  }
  assert.equal(reconstruido['Doral'], '3');
  assert.equal(reconstruido['Doral Data Dura'], '1');
  assert.equal(reconstruido['Weston'], '1');
  assert.equal(reconstruido['Weston Data Dura'], '1');
  assert.equal(reconstruido['Sin sede (históricas)'], '1');
});

test('entradas vacias: ceros y tarjetas presentes sin excepciones', () => {
  const vacio = citasKpiHtml([], {}, undefined);
  assert.equal(vacio.principales.length, 4);
  assert.equal(vacio.desglose.length, 8);
  assert.match(vacio.principales.join('|'), /0\.0%/);
});

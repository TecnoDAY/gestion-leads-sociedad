// Caracterizacion de KPIs y matriz del dashboard (fase 24).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matrizLeadsHtml, metricasLeads, subtituloKpiTotal } from '../../src/legacy/leads.js';

const lead = (id, gestion, campana, mes) => ({ id, GESTION: gestion, 'Campaña': campana, Mes: mes });
const leads = [
  lead(1, 'AGENDADO', 'Kids', 'octubre'),
  lead(2, 'AGENDADO DATA DURA', 'Kids', 'octubre'),
  lead(3, 'INSCRITO', 'Verano', 'octubre'),
  lead(4, 'SEGUIMIENTO', '', ''),
];

test('metricasLeads: contadores, conversion y porcentaje con un decimal', () => {
  const m = metricasLeads(leads);
  assert.equal(m.total, 4);
  assert.equal(m.agendados, 2);
  assert.equal(m.inscritos, 1);
  assert.equal(m.agendadosPct, '50.0');
  assert.equal(m.conversion, '25.0');
  assert.deepEqual(metricasLeads([]), { total: 0, agendados: 0, inscritos: 0, nuevos: 0, gestion: 0, conversion: '0.0', agendadosPct: '0.0' });
});

test('subtituloKpiTotal: mismas ramas y textos', () => {
  const base = { hasFilters: false, dashDesde: '', dashHasta: '', mesSel: '', dataSource: 'actual', visiblesCargados: 100, loadedLeadTarget: 2000, batchSize: 2000 };
  assert.equal(subtituloKpiTotal(base), 'Últimos registros ingresados');
  assert.equal(subtituloKpiTotal({ ...base, loadedLeadTarget: 4000 }), 'Incluye bloques anteriores');
  assert.match(subtituloKpiTotal({ ...base, hasFilters: true, visiblesCargados: 1234 }), /^Resultados dentro de .* cargados$/);
  assert.equal(subtituloKpiTotal({ ...base, mesSel: 'octubre' }), 'Resultados globales del mes');
  // con historico el mes no cambia el subtitulo
  assert.equal(subtituloKpiTotal({ ...base, mesSel: 'octubre', dataSource: 'historico' }), 'Últimos registros ingresados');
  // el rango de fechas del dash gana a todo
  assert.equal(subtituloKpiTotal({ ...base, dashDesde: '2026-10-01', mesSel: 'octubre', hasFilters: true }), 'Resultados globales por gestión');
  assert.equal(subtituloKpiTotal({ ...base, dashHasta: '2026-10-31' }), 'Resultados globales por gestión');
});

test('matrizLeadsHtml: agregados, orden alfabetico y columnas sin vacios', () => {
  const html = matrizLeadsHtml(leads);
  assert.match(html.thead, /Estatus \(GESTIÓN\)/);
  assert.match(html.thead, /Total Fila/);
  // columnas: General (campaña vacia se nombra asi), Kids y Verano, ordenadas
  const cols = [...html.thead.matchAll(/font-semibold">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(cols, ['General', 'Kids', 'Verano']);
  const filas = [...new Set([...html.tbody.matchAll(/data-matrix-gestion="([^"]+)"/g)].map(m => m[1]))];
  assert.deepEqual(filas, ['AGENDADO', 'AGENDADO DATA DURA', 'INSCRITO', 'SEGUIMIENTO']);
  assert.match(html.tbody, /data-matrix-gestion="AGENDADO" data-matrix-campana="Kids"/);
});

test('matrizLeadsHtml: colores por estado, '-' en ceros y totales', () => {
  const html = matrizLeadsHtml(leads);
  assert.match(html.tbody, /text-emerald-400/, 'inscritos en verde');
  assert.match(html.tbody, /text-amber-300/, 'agendados en ambar');
  assert.match(html.tbody, /text-slate-200/, 'resto neutral');
  assert.match(html.tbody, /text-slate-600 hover:bg-slate-800\/40"[^>]*>\s*-/, 'los ceros pintan -');
  // la fila AGENDADO-Cena? no: total por fila 1 (Kids) y gran total 4
  const totales = [...html.tfoot.matchAll(/>\s*([\d.,]+)\s*<\/td>/g)].map(m => m[1]);
  assert.equal(totales.at(-1), '4', 'gran total = leads');
  assert.deepEqual(totales.slice(0, 3), ['1', '2', '1'], 'totales por columna General/Kids/Verano');
});

test('matrizLeadsHtml: sin leads deja cabecera y pie en cero', () => {
  const html = matrizLeadsHtml([]);
  assert.match(html.thead, /Estatus \(GESTIÓN\)/);
  assert.equal(html.tbody, '');
  assert.match(html.tfoot, /Total Campaña/);
  const totales = [...html.tfoot.matchAll(/>\s*([\d.,]+)\s*<\/td>/g)].map(m => m[1]);
  assert.deepEqual(totales, ['0']);
});

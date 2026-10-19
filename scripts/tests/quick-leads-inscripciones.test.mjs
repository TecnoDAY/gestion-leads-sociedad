import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quickLeadsHtml, quickInscripcionesHtml, quickLeadsSelection } from '../../src/legacy/leads.js';

const lead = { id: 5912, Nombre: 'Jeannine Gaslonde', Fecha: '29/09/2026', 'Campaña': 'Kids dorsal inglés', GESTION: 'INSCRITO' };
const mapa = new Map([
  ['5912', [
    { lead_id: 5912, programa: 'TEATRO_MUSICAL', nivel: 'MT Teens' },
    { lead_id: 5912, programa: 'ACTUACION', nivel: 'Acting Piojitos' },
  ]],
]);

test('vista de inscritos: una etiqueta por programa con marca y nivel, en una linea', () => {
  const html = quickLeadsHtml([lead], { prioridad: 'inscrito', inscripciones: mapa, estado: 'listo' });
  assert.match(html, /quick-lead-programas/);
  assert.match(html, /TM<\/span>MT Teens/);
  assert.match(html, /AC<\/span>Acting Piojitos/);
  // Los dos programas del mismo lead, sin duplicar la fila.
  assert.equal((html.match(/quick-lead-programas/g) || []).length, 1);
  assert.equal((html.match(/class="font-semibold text-left/g) || []).length, 1);
  // La campana deja de ocupar la columna en esta vista.
  assert.doesNotMatch(html, /quick-lead-campaign/);
  assert.match(html, /white-space:nowrap|whitespace-nowrap/);
});

test('vista de inscritos: la campana se conserva como dato secundario', () => {
  const html = quickLeadsHtml([lead], { prioridad: 'inscrito', inscripciones: mapa, estado: 'listo' });
  assert.match(html, /29\/09\/2026 · Kids dorsal inglés/);
  // En las demas prioridades la campana sigue en su columna.
  const otra = quickLeadsHtml([lead], { prioridad: 'pendiente', inscripciones: mapa, estado: 'listo' });
  assert.match(otra, /quick-lead-campaign/);
  assert.doesNotMatch(otra, /Kids dorsal inglés<\/p>/);
});

test('vista de inscritos: pendiente de completar, cargando y error se distinguen', () => {
  const pendiente = quickLeadsHtml([lead], { prioridad: 'inscrito', inscripciones: new Map(), estado: 'listo' });
  assert.match(pendiente, /Inscripción pendiente de completar/);
  const cargando = quickLeadsHtml([lead], { prioridad: 'inscrito', inscripciones: new Map(), estado: 'cargando' });
  assert.match(cargando, /Cargando…/);
  assert.doesNotMatch(cargando, /pendiente de completar/i);
  const error = quickLeadsHtml([lead], { prioridad: 'inscrito', inscripciones: new Map(), estado: 'error' });
  assert.match(error, /No se pudieron cargar las inscripciones/);
  assert.doesNotMatch(error, /pendiente de completar/i);
  // El error ofrece reintento manual: no hay reintentos automaticos.
  assert.match(error, /data-quick-action="retry-inscripciones"/);
  assert.match(error, /Reintentar/);
  assert.doesNotMatch(pendiente, /retry-inscripciones/);
  assert.doesNotMatch(cargando, /retry-inscripciones/);
});

test('otras prioridades: la campana se mantiene y no hay etiquetas', () => {
  const html = quickLeadsHtml([lead], { prioridad: 'pendiente', inscripciones: mapa, estado: 'listo' });
  assert.match(html, /quick-lead-campaign/);
  assert.match(html, /Kids dorsal inglés/);
  assert.doesNotMatch(html, /quick-lead-programas/);
  // Sin contexto, el marcado es el de siempre (campana).
  const sinCtx = quickLeadsHtml([lead]);
  assert.match(sinCtx, /quick-lead-campaign/);
  assert.doesNotMatch(sinCtx, /quick-lead-programas/);
});

test('el historico no hereda las inscripciones del lead actual con el mismo id', () => {
  const historico = { id: 5912, Nombre: 'Viejo', Fecha: '3/10/2025', GESTION: 'INSCRITO', __origin: 'historico' };
  const html = quickLeadsHtml([historico], { prioridad: 'inscrito', inscripciones: mapa, estado: 'listo' });
  assert.doesNotMatch(html, /MT Teens/);
  assert.match(html, /Histórico 2025/);
});

test('las etiquetas escapan el nivel y no filtran HTML', () => {
  const payload = '<img src=x onerror="bad">';
  const html = quickInscripcionesHtml([{ programa: 'TEATRO_MUSICAL', nivel: payload }]);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img|onerror="bad"|onclick=|href=/);
});

test('la seleccion compartida limita a ocho por id descendente', () => {
  const leads = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
  const seleccion = quickLeadsSelection(leads);
  assert.equal(seleccion.length, 8);
  assert.deepEqual(seleccion.map(l => l.id), [12, 11, 10, 9, 8, 7, 6, 5]);
  // El render pinta exactamente la misma seleccion (cada fila repite el id en
  // sus botones).
  const pintados = [...new Set([...quickLeadsHtml(leads).matchAll(/data-lead-id="(\d+)"/g)].map(m => m[1]))];
  assert.deepEqual(pintados, seleccion.map(l => String(l.id)));
});

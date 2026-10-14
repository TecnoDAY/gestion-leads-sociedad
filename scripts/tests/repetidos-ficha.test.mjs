// Caracterización de repetidos y primera entrada de la ficha (fase 29).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  relacionadosPorTelefono,
  primeraEntradaLead,
  ordenRepetidos,
  bloqueRepetidosHtml,
  bannerPrimeraEntradaHtml,
  badgeGestionHtml,
} from '../../src/legacy/leads.js';

const lead = (id, extra) => ({ id, ...extra });

test('relacionadosPorTelefono: excluye el propio registro por origen+id', () => {
  const actual = lead(7, { Nombre: 'Sintético', Telefono: '305 555 1234', Fecha: '10/01/2026' });
  assert.deepEqual(relacionadosPorTelefono(actual, [[actual]], 'actual'), []);
  // mismo teléfono pero id distinto sí entra
  const otro = lead(9, { Telefono: '3055551234' });
  assert.deepEqual(relacionadosPorTelefono(actual, [[actual, otro]], 'actual'), [otro]);
  // mismo id numérico pero origen distinto NO se excluye (los ids colisionan entre años)
  const historico = { id: 7, Telefono: '3055551234', __origin: 'historico' };
  assert.deepEqual(relacionadosPorTelefono(actual, [[historico]], 'actual'), [historico]);
});

test('relacionadosPorTelefono: umbral de 7 dígitos', () => {
  const a = lead(1, { Telefono: '305-1234' }); // exactamente 7 dígitos
  const b = lead(2, { Telefono: '3051234' });
  assert.deepEqual(relacionadosPorTelefono(a, [[b]], 'actual'), [b]);
  const corto = lead(3, { Telefono: '305 421' }); // 6 dígitos: ni siquiera mira las fuentes
  const eco = lead(4, { Telefono: '305421' });
  assert.deepEqual(relacionadosPorTelefono(corto, [[eco]], 'actual'), []);
});

test('relacionadosPorTelefono: fuentes híbridas actual+historico', () => {
  const actual = lead(7, { Telefono: '305 555 1234' });
  const historico = { id: 3, Telefono: '305.555.1234', __origin: 'historico' };
  const otros = lead(50, { Telefono: '7864440102' });
  // doble recorrido: los dos arrays de fuentes se recorren en orden; 'otros'
  // tiene otro teléfono y no entra
  assert.deepEqual(
    relacionadosPorTelefono(actual, [[otros], [historico, otros]], 'actual'),
    [historico],
  );
});

test('primeraEntradaLead: historico más viejo gana la primera entrada', () => {
  const actual = lead(7, { Fecha: '15/3/2026' });
  const historico = { Fecha: '5/1/2025', __origin: 'historico' };
  const r = primeraEntradaLead(actual, [historico]);
  assert.equal(r.firstIsHistorico, true);
  assert.equal(r.firstFecha, '5/1/2025');
  assert.equal(r.firstTs, Date.UTC(2025, 0, 5));
});

test('primeraEntradaLead: empate/última válida decide con la propia fecha mínima', () => {
  const actual = lead(7, { Fecha: '15/3/2026' });
  // relacionado más nuevo no cambia la primera entrada (sigue siendo el propio lead)
  const r = primeraEntradaLead(actual, [{ Fecha: '10/4/2026', __origin: 'historico' }]);
  assert.equal(r.firstIsHistorico, false);
  assert.equal(r.firstFecha, '15/3/2026');
  assert.equal(r.firstTs, Date.UTC(2026, 2, 15));
  // historico sin fecha parseable: la primera entrada es el propio lead pero no es historico
  const r2 = primeraEntradaLead(actual, [{ Fecha: '' }]);
  assert.equal(r2.firstIsHistorico, false);
  assert.equal(r2.firstFecha, '15/3/2026');
});

test('primeraEntradaLead: sin relacionados o sin fecha mínima → null', () => {
  const actual = lead(7, { Fecha: '15/3/2026' });
  assert.equal(primeraEntradaLead(actual, []), null);
  assert.equal(primeraEntradaLead({ Fecha: 'sin fecha' }, [{ Fecha: '??? ' }]), null);
});

test('ordenRepetidos: fecha dd/mm/yyyy desc, created_at e id como respaldos', () => {
  const a = { id: 1, Fecha: '10/2/2026' };
  const b = { id: 2, Fecha: '9/1/2026' };
  const c = { id: 3, Fecha: '???', created_at: '2026-02-09T00:00:00Z' };
  const d = { id: 4, Fecha: '???', created_at: 'no es fecha' };
  const e = { id: 5, Fecha: '???' };
  const out = ordenRepetidos([b, e, a, d, c]);
  assert.deepEqual(out.map(l => l.id), [1, 3, 2, 5, 4]);
  // ids textuales empatan por compareLeadIdsDescending ("10" antes que "9")
  assert.deepEqual(ordenRepetidos([{ id: '9' }, { id: '10' }]).map(l => l.id), ['10', '9']);
  // no muta la entrada
  const entrada = [{ id: 'x' }, { id: '9' }];
  ordenRepetidos(entrada);
  assert.equal(entrada[0].id, 'x');
});

test('bloqueRepetidosHtml: badges de año, Este lead y truncado 160 con ellipsis', () => {
  const centro = lead(7, {
    'Fecha': '10/1/2026', 'Campaña': 'Verano', 'Medio': 'Meta', 'Agente ': 'Loli',
    'GESTION': 'INSCRITO', 'OBSERVACIONES ': '  monto   alto  ',
  });
  const viejo = {
    __origin: 'historico', id: 3, 'Fecha': '5/1/2025', 'Campaña': '<b>ojo</b>', 'Medio': 'Zoom',
    'Agente ': 'Ana', 'GESTION': 'AGENDADO', 'OBSERVACIONES ': 'x'.repeat(161),
  };
  const filas = bloqueRepetidosHtml([centro, viejo], 'actual', 7);
  assert.match(filas, /bg-amber-500\/20 text-amber-300 border border-amber-500\/40 font-semibold">2025</);
  assert.match(filas, /bg-slate-700\/60 text-slate-300 border border-slate-600\/60 font-semibold">2026</);
  assert.match(filas, /<li class="flex items-start justify-between gap-3/);
  assert.equal((filas.match(/>Este lead</g) || []).length, 1);
  // extracción de espacios de las observaciones
  assert.match(filas, /<p class="text-\[11px\] text-slate-500 leading-snug">monto alto<\/p>/);
  // casting escapado de la campaña
  assert.match(filas, /&lt;b&gt;ojo&lt;\/b&gt;/);
  // truncado a 160 con ellipsis
  assert.ok(filas.includes('x'.repeat(160) + '…'));
  assert.ok(!filas.includes('x'.repeat(161)));
  // badge de gestión reutilizado de leads.js
  assert.ok(filas.includes(badgeGestionHtml('INSCRITO')));
  // botón Abrir solo en el relacionado y con escapeAttr del id
  assert.match(filas, /data-ev="click:openLeadFromView\('historico', '3'\)"/);
  assert.ok(!filas.includes("openLeadFromView('actual', '7')"));
});

test('bloqueRepetidosHtml: observaciones solo espacios no imprimen párrafo', () => {
  const filas = bloqueRepetidosHtml([{ id: 1, Fecha: '-', OBSERVACIONES: '   ', GESTION: '' }].map(l => ({ ...l, 'OBSERVACIONES ': l.OBSERVACIONES })), 'actual', 1);
  assert.ok(!filas.includes('leading-snug'));
  assert.deepEqual(bloqueRepetidosHtml([], 'actual', 7), '');
});

test('bannerPrimeraEntradaHtml: marcado exacto del banner', () => {
  const banner = bannerPrimeraEntradaHtml('5/1/2025', 2025);
  assert.match(banner, /calendar-clock/);
  assert.ok(banner.includes('Primera entrada como lead: <span class="font-semibold">5/1/2025</span> <span class="text-indigo-300">(2025)</span>'));
  assert.match(banner, /bg-indigo-500\/10 border border-indigo-500\/30/);
});

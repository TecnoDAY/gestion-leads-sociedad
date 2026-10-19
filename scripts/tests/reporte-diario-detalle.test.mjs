import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bloqueDiaHtml, cuerpoReporteDiario, detallesBloqueHtml, detalleGestionHoy, diarioCsvLines, gestionadosHoy, totalDiario } from '../../src/legacy/reportes.js';

const block = {
  autor_name: 'Ana', gestionados: 39,
  canales: { whatsapp: 21, llamada_whatsapp: 5, instagram: 0, visita: 1, sin_clasificar: 2, llamada: 6, data_dura: 4, total: 39 },
  // Contrato historico deliberadamente distinto: no usar seguimiento ni total.
  whatsapp: { nuevos: 18, gestionados: 8, total: 26 },
};
const fields = line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.slice(1, -1));

test('detalle 18/11/29: particion con altas incluidas y total general 39 intacto', () => {
  const before = JSON.stringify(block);
  assert.equal(gestionadosHoy(block.canales), 29);
  const html = detallesBloqueHtml(block);
  const detail = html.split('<h5 class="font-semibold text-indigo-900">Detalle de gestión</h5>')[1].split('</table>')[0];
  assert.equal((detail.match(/<tr>/g) || []).length, 3);
  assert.match(detail, /WhatsApp nuevos hoy<\/td><td[^>]*>18<\/td>/);
  assert.match(detail, /WhatsApp gestionados hoy<\/td><td[^>]*>11<\/td>/);
  assert.match(detail, /Total grupo WhatsApp<\/td><td[^>]*>29<\/td>/);
  assert.doesNotMatch(html, /Total detalle de gestión/);
  assert.equal(totalDiario([block]).g, 39);
  assert.match(bloqueDiaHtml(block, 0, ''), /Ana — 39 gestiones/);
  assert.match(cuerpoReporteDiario(true, totalDiario([block]), ''), /Gestiones realizadas.*39/);
  assert.equal(JSON.stringify(block), before);
});

test('particion aprobada 20/15/35 incluye altas de otros canales y excluye llamadas', () => {
  const b = { canales: { whatsapp: 20, llamada_whatsapp: 5, instagram: 3, visita: 4, sin_clasificar: 3, llamada: 99, data_dura: 99 }, whatsapp: { nuevos: 20, gestionados: 999 } };
  assert.deepEqual(detalleGestionHoy(b), { nuevos: 20, gestionados: 15, total: 35 });
  assert.deepEqual(detalleGestionHoy({ canales: { whatsapp: '20', instagram: '15' }, whatsapp: { nuevos: '20' } }), { nuevos: 20, gestionados: 15, total: 35 });
  assert.deepEqual(detalleGestionHoy({ canales: { whatsapp: 3 }, whatsapp: { nuevos: 3 } }), { nuevos: 3, gestionados: 0, total: 3 });
});

test('conteos invalidos no se corrigen: aviso UI y error CSV, incluso si TOTAL compensaria', () => {
  const invalid = [
    { canales: { whatsapp: 1 }, whatsapp: { nuevos: 2 } },
    ...[-1, 0.5, NaN, Infinity, '', ' ', 'abc', true, {}, [], Number.MAX_SAFE_INTEGER + 1].flatMap(value => [
      { canales: { whatsapp: value } },
      { canales: { whatsapp: 5 }, whatsapp: { nuevos: value } },
    ]),
    { canales: { whatsapp: Number.MAX_SAFE_INTEGER, instagram: 1 } },
  ];
  for (const b of invalid) {
    const before = structuredClone(b);
    assert.throws(() => detalleGestionHoy(b), /Detalle de gestión no disponible/);
    assert.match(detallesBloqueHtml(b), /role="alert".*Detalle de gestión no disponible/);
    assert.throws(() => diarioCsvLines('2026-10-16', '', '2026-10-16', [b, block], []), /Detalle de gestión no disponible/);
    assert.deepEqual(b, before);
  }
  const large = { canales: { whatsapp: Number.MAX_SAFE_INTEGER }, whatsapp: { nuevos: 0 } };
  assert.throws(() => diarioCsvLines('2026-10-16', '', '2026-10-16', [large, large], []), /conteos inválidos/);
});

test('CSV individual y TOTAL usan canales, sin sumar nuevos ni duplicar combinado/otros', () => {
  const second = { autor_name: 'Bea', gestionados: 7, canales: { whatsapp: 1, llamada_whatsapp: 1, instagram: 2, visita: 1, sin_clasificar: 1, llamada: 1 }, whatsapp: { nuevos: 1, gestionados: 999, total: 999 } };
  const lines = diarioCsvLines('2026-10-16', '', '2026-10-16', [block, second, { autor_name: 'Vacia', canales: null, whatsapp: null }], []);
  const headers = fields(lines[4]);
  assert.equal(new Set(headers).size, headers.length);
  assert.equal(headers.includes('Total WhatsApp'), true);
  const rows = lines.slice(5).map(fields);
  for (const row of rows) assert.equal(row.length, headers.length);
  for (const [label, expected] of [
    ['Total WhatsApp', [29, 6, 0, 35]],
    ['WhatsApp nuevos hoy', [18, 1, 0, 19]],
    ['WhatsApp gestionados hoy', [11, 5, 0, 16]],
    ['Gestiones realizadas', [39, 7, 0, 46]],
    ['Total canales', [39, 7, 0, 46]],
  ]) assert.deepEqual(rows.map(r => Number(r[headers.indexOf(label)])), expected, label);
});

test('canales ausentes/null/vacios y valores numericos serializados; no fallback historico', () => {
  for (const canales of [undefined, null, {}, { whatsapp: null, llamada_whatsapp: null, instagram: null, visita: null, sin_clasificar: null }]) {
    assert.equal(gestionadosHoy(canales), 0);
    assert.match(detallesBloqueHtml({ canales, whatsapp: { nuevos: 0, gestionados: 999, total: 999 } }), /WhatsApp gestionados hoy<\/td><td[^>]*>0<\/td>/);
  }
  assert.equal(gestionadosHoy({ whatsapp: '21', llamada_whatsapp: '5', instagram: '0', visita: '1', sin_clasificar: '2', total: 999, llamada: 999, data_dura: 999 }), 29);
  const lines = diarioCsvLines('2026-10-16', '', '2026-10-16', [], []);
  assert.ok(fields(lines.at(-1)).slice(1, -2).every(v => v === '0'));
});

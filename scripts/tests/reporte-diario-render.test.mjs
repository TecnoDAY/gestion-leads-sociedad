// Caracterizacion de las piezas puras del reporte diario (fase 21).
// El golden directo del panel completo queda en los t5 de renderReporteV2.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  asesorasDisponibles,
  bloqueDiaHtml, cuerpoReporteDiario, detallesBloqueHtml, indiceNotas,
  manualBloqueHtml, notaDeBloque, totalDiario,
} from '../../src/legacy/reportes.js';

const notas = [
  { id: 1, autor_user_id: 'u1', problemas: 'P1', observaciones: 'O1' },
  { id: 2, autor_name: 'Legacy', problemas: 'P2' },
];
const bloque = {
  autor_name: 'Loli', autor_user_id: 'u1',
  gestionados: 5,
  procedencia: { WhatsApp: 2, 'Facebook/Instagram': 1, 'Directo o Referido': 1, CogniTalking: 1 },
  llamadas: { del_dia: 3, data_dura: 1, llamada_whatsapp: 1, total: 5 },
  whatsapp: { nuevos: 2, gestionados: 3, total: 5 },
  canales: { llamada: 14, data_dura: 27, llamada_whatsapp: 31, whatsapp: 56, instagram: 0, sin_clasificar: 2 },
  citas: { agendados_doral: 1, total_agendados: 3, visitas: 1, canceladas: 1, reprogramadas: 1 },
};

test('indice y notaDeBloque: uid primero, nombre legado como respaldo', () => {
  const indice = indiceNotas(notas);
  const b = { autor_name: 'Loli', autor_user_id: 'u1' };
  assert.equal(notaDeBloque(indice, b).id, 1);
  assert.equal(notaDeBloque(indice, { autor_name: 'Legacy', autor_user_id: 'x' }).id, 2);
  assert.equal(notaDeBloque(indice, { autor_name: 'Nadie' }), null);
});

test('totalDiario: cinco llaves con lo mismo que muestra el panel', () => {
  const bloques = [bloque, { autor_name: 'B', gestionados: 2, llamadas: { del_dia: 1, data_dura: 0, llamada_whatsapp: 0, total: 1 }, citas: { total_agendados: 1, citas_reprogramadas_hoy: 2, visitas: 3 } }];
  const total = totalDiario(bloques);
  // "Total llamadas" = grupo Llamadas (del_dia + data_dura + llamada WhatsApp),
  // el mismo que muestra el detalle por asesora y la columna del CSV.
  assert.deepEqual(total, { g: 7, l: 6, c: 4, r: 2, v: 4 });
  assert.deepEqual(totalDiario([]), { g: 0, l: 0, c: 0, r: 0, v: 0 });
});

test('detallesBloqueHtml: cuatro tablas con filas exactas y coherencia', () => {
  const html = detallesBloqueHtml(bloque);
  for (const title of ['Procedencia', 'Canales', 'Detalle de gestión', 'Citas creadas y resultados registrados hoy']) assert.match(html, new RegExp(title));
  assert.match(html, /Otras procedencias/);
  assert.match(html, /Otros o sin canal/);
  // Total Procedencia = suma de todas las procedencias (2+1+1+1 = 5)
  const celda = (nombre) => { const m = new RegExp(`${nombre}</td><td class="font-semibold">([0-9]+)`).exec(html); return m ? Number(m[1]) : null; };
  assert.equal(celda('Total'), 5);
  assert.equal(celda('Total'), celda('WhatsApp') + celda('Facebook/Instagram') + celda('Directo o Referido') + celda('Otras procedencias'));
});

test('manualBloqueHtml: edicion con guardar/eliminar y lectura sin acciones', () => {
  const edicion = manualBloqueHtml(2, notas[0], true);
  assert.match(edicion, /id="reporte-problemas-2"/);
  assert.match(edicion, /data-ev="click:saveReporteNota\(2\)"/);
  assert.match(edicion, /data-ev="click:deleteReporteNota\(2\)"/);
  const sinSavedNote = manualBloqueHtml(3, {}, true);
  assert.doesNotMatch(sinSavedNote, /deleteReporteNota\(3\)/);
  const lectura = manualBloqueHtml(0, notas[0], false);
  assert.match(lectura, /P1/);
  assert.match(lectura, /O1/);
  assert.doesNotMatch(lectura, /saveReporteNota/);
});

test('bloqueDiaHtml: summary con gestiones, todas cerradas y manuales', () => {
  const primera = bloqueDiaHtml(bloque, 0, 'MANUAL_0');
  assert.match(primera, /<details class="daily-advisor">/);
  assert.doesNotMatch(primera, /<details class="daily-advisor" [^>]*open/);
  assert.match(primera, /MANUAL_0/);
  assert.match(primera, /Loli — 5 gestiones/);
  const restante = bloqueDiaHtml(bloque, 1, '');
  assert.doesNotMatch(restante, /<details class="daily-advisor" [^>]*open/);
  const sinNombre = bloqueDiaHtml({ gestiones: 0 }, 0, '');
  assert.match(sinNombre, /Sin asesora/);
});

test('cuerpoReporteDiario: aviso de notas y shell con total y bloques', () => {
  const aviso = cuerpoReporteDiario(false, { g: 7, l: 6, c: 4, r: 2, v: 4 }, 'BLOQUES');
  assert.match(aviso, /No se pudieron cargar las notas guardadas/);
  assert.match(aviso, /BLOQUES/);
  const ok = cuerpoReporteDiario(true, { g: 7, l: 6, c: 4, r: 2, v: 4 }, 'BLOQ');
  assert.doesNotMatch(ok, /No se pudieron cargar las notas guardadas/);
  assert.match(ok, /Resumen general/);
  assert.match(ok, /Gestiones realizadas/);
  assert.match(ok, /Comparativa por asesora/);
});

test('asesorasDisponibles: ids estables al filtrar (bug de cambio de asesora)', () => {
  // Carga sin filtro: todos con id.
  const completa = asesorasDisponibles([{ autor_user_id: 'a', autor_name: 'Ana' }, { autor_user_id: 'b', autor_name: 'Bea' }], ['Zoe'], []);
  assert.deepEqual(completa, [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }, { id: '', name: 'Zoe' }]);
  // Carga filtrada por Ana: solo un bloque; los ids de las demas se conservan.
  const filtrada = asesorasDisponibles([{ autor_user_id: 'a', autor_name: 'Ana' }], ['Zoe'], completa);
  assert.deepEqual(filtrada, [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }, { id: '', name: 'Zoe' }]);
  // Un id real gana a la entrada solo-nombre del catalogo.
  const conCatalogo = asesorasDisponibles([{ autor_user_id: 'x', autor_name: 'Ana' }], ['Ana'], []);
  assert.deepEqual(conCatalogo, [{ id: 'x', name: 'Ana' }]);
  // Nombres vacios/duplicados no crean opciones fantasma.
  assert.deepEqual(asesorasDisponibles([{ autor_user_id: '', autor_name: '' }, { autor_user_id: 'y', autor_name: 'ana' }], ['ANA'], []), [{ id: 'y', name: 'ana' }]);
});

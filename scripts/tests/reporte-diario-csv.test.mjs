// Caracterizacion del CSV del reporte diario (fase 16): diarioCsvLines y
// resolverNotaBloque viven en src/legacy/reportes.js; el golden real es el
// t5 (36 columnas, fila TOTAL); aqui se fija el armado puro y la coherencia
// de totales (todo lo que se suma se ve; correccion del caso Jessica).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvReporteField, diarioCsvLines, resolverNotaBloque, totalCanalesVisibles } from '../../src/legacy/reportes.js';

const bloque = {
  autor_name: 'Loli', autor_user_id: 'u1',
  gestionados: 5,
  procedencia: { WhatsApp: 2, 'Facebook/Instagram': 1, CogniTalking: 1, 'Directo o Referido': 1, Otros: 0 },
  llamadas: { del_dia: 3, data_dura: 1, llamada_whatsapp: 1, total: 5 },
  inscritos: { total: 999 }, inscripciones_realizadas: 3,
  citas: { agendados_dia: 2, agendados_data_dura: 1, agendados_doral: 1, agendados_doral_data_dura: 0, agendados_weston: 1, agendados_weston_data_dura: 1, total_agendados: 3, citas_reprogramadas_hoy: 0, visitas: 1, no_asistieron: 0, canceladas: 1, reprogramadas: 1, agendados_gestionados_dia: 2, agendados_gestionados_data_dura: 1 },
  whatsapp: { nuevos: 2, gestionados: 3, total: 5 },
  canales: { whatsapp: 2, instagram: 1 },
};
const bloqueVacio = { autor_name: 'Marcos', autor_user_id: 'u2', inscripciones_realizadas: 0 };

// Separar delimitadores externos a comillas (incluye la coma de "De ellos,").
const campos = line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

test('cabecera del CSV diario: titulo, fecha, generado, filtro opcional y 36 columnas', () => {
  const con = diarioCsvLines('2026-10-13', 'Loli', '2026-10-14', [bloque], []);
  assert.equal(con[0], 'Reporte Diario de Trabajo');
  assert.equal(con[1], csvReporteField('Fecha: 2026-10-13'));
  assert.equal(con[2], csvReporteField('Generado: 2026-10-14 Miami'));
  assert.equal(con[3], csvReporteField('Filtro: Loli'));
  assert.equal(con[4], '');
  const headers = campos(con[5]);
  assert.equal(headers.length, 36);
  assert.equal(headers[0], csvReporteField('Asesora'));
  assert.equal(headers[1], csvReporteField('Gestiones realizadas'));
  assert.equal(headers.at(-1), csvReporteField('Inscritos'));
  assert.equal(headers[2], csvReporteField('WhatsApp'));
  // Medio retirado del negocio: sin columna propia; su conteo va en Otros.
  assert.equal(headers.includes(csvReporteField('CogniTalking')), false, 'CogniTalking no abre columna');
  assert.equal(headers[4], csvReporteField('Directo o Referido'));
  assert.equal(headers[5], csvReporteField('Otros'));
  // la columna agregada va entre Canal Instagram y Total canales
  assert.equal(headers[headers.length - 6], csvReporteField('Canal Instagram'));
  assert.equal(headers[headers.length - 5], csvReporteField('Otros o sin canal'));
  assert.equal(headers[headers.length - 4], csvReporteField('Total canales'));
  assert.equal(headers[headers.length - 3], csvReporteField('Problemas'));
  assert.equal(headers[headers.length - 2], csvReporteField('Observaciones'));
  // sin filtro no hay linea de filtro ni hueco desalineado
  const sin = diarioCsvLines('2026-10-13', '', '2026-10-14', [bloque], []);
  assert.equal(sin[3], '');
  assert.equal(campos(sin[4]).length, 36);
});

test('filas por bloque con values en el orden de keys y notas resueltas', () => {
  const notas = [{ problemas: 'sin internet', observaciones: 'se retoma luego' }];
  const con = diarioCsvLines('2026-10-13', '', '2026-10-14', [bloque, bloqueVacio], notas);
  const fila = con.at(-3).split(',');
  assert.equal(fila[0], csvReporteField('Loli'));
  assert.equal(fila[1], csvReporteField('5'));
  assert.equal(fila.at(-1), csvReporteField('3'), 'Inscritos usa altas reales de cualquier clase');
  assert.equal(fila[5], csvReporteField('1'), 'Otros absorbe el conteo de CogniTalking');
  assert.equal(fila.at(-3), csvReporteField('sin internet'));
  assert.equal(fila.at(-2), csvReporteField('se retoma luego'));
  // bloque sin datos: todos los numericos en 0
  const filaVacia = con.at(-2).split(',');
  assert.equal(filaVacia[0], csvReporteField('Marcos'));
  assert.equal(filaVacia.slice(1, -3).filter(v => v === csvReporteField('0')).length, 32);
});

test('fila TOTAL con sumas por key y dos columnas vacias al final', () => {
  const con = diarioCsvLines('2026-10-13', '', '2026-10-14', [bloque, bloqueVacio], []);
  const total = con.at(-1).split(',');
  assert.equal(total[0], csvReporteField('TOTAL'));
  assert.equal(total[1], csvReporteField('5'));
  assert.equal(total.at(-1), csvReporteField('3'));
  assert.equal(total.at(-2), csvReporteField(''));
  assert.equal(total.at(-3), csvReporteField(''));
  assert.equal(total.length, 36);
});

test('resolverNotaBloque: uid primero, nombre sin uid, fallback b.nota', () => {
  const notas = [
    { autor_user_id: 'u1', problemas: 'A' },
    { autor_name: 'Marcos', problemas: 'B' },
  ];
  assert.equal(resolverNotaBloque(bloque, notas).problemas, 'A');
  assert.equal(resolverNotaBloque(bloqueVacio, notas).problemas, 'B');
  const conNota = { ...bloqueVacio, nota: { problemas: 'C' } };
  assert.equal(resolverNotaBloque(conNota, []).problemas, 'C');
  assert.deepEqual(resolverNotaBloque(bloqueVacio, []), {});
});

test('coherencia del caso Jessica: fila visible y total de canales cuadran con gestiones', () => {
  // Datos verificados contra daily_management_report (2026-10-13, Jessica):
  // 130 gestiones = 14 llamada + 27 data_dura + 31 llamada_y_whatsapp
  // + 56 whatsapp + 0 instagram + 2 sin canal.
  const jessica = {
    llamada: 14, data_dura: 27, llamada_whatsapp: 31, whatsapp: 56, instagram: 0, visita: 0, sin_clasificar: 2,
  };
  const bloqueJess = {
    autor_name: 'Jessica', gestionados: 130,
    llamadas: { del_dia: 14, data_dura: 27, llamada_whatsapp: 31, total: 72 },
    whatsapp: { nuevos: 12, gestionados: 44, total: 56 },
    canales: jessica,
  };
  assert.equal(totalCanalesVisibles(jessica), 130);
  const con = diarioCsvLines('2026-10-13', '', '2026-10-13', [bloqueJess], []);
  const fila = con.at(-2).split(',');
  const cabecera = campos(con[4]);
  const el = nombres => cabecera.findIndex(h => h === csvReporteField(nombres));
  const iInstagram = el('Canal Instagram');
  const iTotales = el('Total canales');
  assert.ok(iInstagram > -1 && iTotales > -1, 'columnas de canal presentes');
  assert.equal(fila[iInstagram], csvReporteField('0'));
  assert.equal(fila[iTotales], csvReporteField('130'));
   // Llamadas = llamada + data dura + llamada whatsapp; WhatsApp = el resto.
   // Sumar ambos grupos devuelve todas las gestiones, sin repetir la combinada.
   const sumaCanalCsv = ['Llamadas del día', 'Llamadas Data Dura', 'Llamada WhatsApp', 'Total WhatsApp']
    .reduce((a, n) => a + Number(fila[el(n)].slice(1, -1)), 0);
  assert.equal(sumaCanalCsv, 130);
  assert.equal(Number(fila[el('Total llamadas')].slice(1, -1)), 72);
  assert.equal(Number(fila[el('Total WhatsApp')].slice(1, -1)), 58);
});

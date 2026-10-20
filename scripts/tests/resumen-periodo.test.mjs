import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidateLeadsById } from '../../src/legacy/helpers.js';
import {
  buildPeriodSummary,
  csvReporteField,
  periodoCsvLines,
  periodoGestionesCsvLines,
  periodoPct,
  validatePeriodoActividad,
  validatePeriodoSummary,
} from '../../src/legacy/reportes.js';
import { csvFields } from './csv-fields.mjs';

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

// --- periodoCsvLines + validatePeriodoActividad (fase 14) ---
const actividad = {
  desde: '2026-02-01', hasta: '2026-02-28',
  gestiones: {
    total_eventos: 5, leads_unicos: 3, agendados_normales: 2, agendados_data_dura: 1,
    inscritos_normales: 1, inscritos_data_dura: 0,
    por_estado: [
      { label: 'INSCRITO', eventos: 2, leads: 1 },
      { label: 'AGENDADO C', eventos: 3, leads: 2 },
    ],
  },
  canales: { llamadas_normales: 2, llamadas_data_dura: 1, llamada_whatsapp: 1, whatsapp: 0, otros: 0 },
  citas: {
    programadas_normales: 1, programadas_data_dura: 0, asistieron: 1, no_asistieron: 0,
    canceladas: 0, reprogramadas: 0, doral_normal: 0, doral_data_dura: 0,
    weston_normal: 1, weston_data_dura: 0, sin_sede: 0,
  },
};

test('validatePeriodoActividad aprueba una respuesta coherente y falla alterada', () => {
  assert.equal(validatePeriodoActividad(actividad, '2026-02-01', '2026-02-28'), actividad);
  const alterada = { ...actividad, gestiones: { ...actividad.gestiones, total_eventos: -1 } };
  assert.throws(() => validatePeriodoActividad(alterada, '2026-02-01', '2026-02-28'), /actividad del período/);
  assert.throws(() => validatePeriodoActividad(actividad, '2026-03-01', '2026-02-28'), /actividad del período/);
  const malEstado = { ...actividad, gestiones: { ...actividad.gestiones, por_estado: [{ label: 'X', eventos: 'n', leads: 1 }] } };
  assert.throws(() => validatePeriodoActividad(malEstado, '2026-02-01', '2026-02-28'), /actividad del período/);
});

test('csv del periodo: cabecera, generado y excluidos en orden', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  const lines = periodoCsvLines(s, actividad, '2026-10-13');
  assert.equal(lines[0], csvReporteField('Reporte por período'));
  assert.equal(lines[1], [csvReporteField('Desde (inclusive)'), csvReporteField(s.desde), csvReporteField('Hasta (inclusive)'), csvReporteField(s.hasta)].join(','));
  assert.equal(lines[3], [csvReporteField('Generado (Miami)'), csvReporteField('2026-10-13')].join(','));
  assert.equal(lines[4], [csvReporteField('Leads sin fecha válida (excluidos)'), csvReporteField(s.fechas_invalidas)].join(','));
});

test('csv del periodo: tres bloques de resumen con TOTAL y % via periodoPct', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  const texto = periodoCsvLines(s, actividad, '2026-10-13');
  const iMedios = texto.findIndex(t => t.includes('Resumen general de leads por entrada (Medio)'));
  assert.ok(iMedios > 0);
  // la fila de cabecera Categoría/Leads/% y el TOTAL cierran cada bloque
  assert.ok(texto[iMedios + 1].includes('Categoría'));
  assert.ok(texto.slice(iMedios, iMedios + 6).some(t => t === [csvReporteField('TOTAL'), csvReporteField(s.total), csvReporteField(periodoPct(s.total, s.total))].join(',')));
  const iMatriz = texto.findIndex(t => t.includes('Matriz gestión actual × campaña'));
  assert.ok(iMatriz > iMedios);
  // por_estado sale ordenado alfabeticamente: AGENDADO C antes que INSCRITO
  const iPorEstado = texto.findIndex(t => t.includes('Gestiones por estado'));
  const entre = texto.slice(iPorEstado, iPorEstado + 4).join('|');
  assert.ok(entre.indexOf('AGENDADO C') < entre.indexOf('INSCRITO'));
  // canales y agenda cierran el documento con su orden exacto
  assert.ok(texto.some(t => t.includes('Canales de la actividad')));
  assert.ok(texto.some(t => t.includes('Llamada y WhatsApp')));
  assert.equal(texto.filter(t => t.includes('Reporte por período')).length, 1);
});

test('csv del periodo usa siempre campos envueltos por csvReporteField', () => {
  const s = buildPeriodSummary(leads, catalogs, '2026-02-01', '2026-02-28');
  const lines = periodoCsvLines(s, actividad, '2026-10-13');
  // Las lineas separadoras son vacias; el resto empieza y termina entre
  // comillas (los textos con comas internas romperian un split naive).
  assert.ok(lines.every(l => l === '' || (l.startsWith('"') && l.endsWith('"'))));
});

// --- periodoGestionesCsvLines (detalle de gestiones del período) ---
const gestionRow = (extra = {}) => ({
  fecha: '2026-10-03', hora: '09:30', nombre: 'Luis Pérez', telefono: '3051234567',
  asesoraGestion: 'Ana', asesoraAsignada: 'Ana', canal: 'WhatsApp', dataDura: 'No',
  gestionAnterior: 'NO CONTESTA', gestionNueva: 'EN VISTO', observaciones: 'Cliente', ...extra,
});

test('csv de gestiones: la campaña es la última columna y no mueve las anteriores', () => {
  const lines = periodoGestionesCsvLines([gestionRow({ campana: 'Verano 2026' })], '2026-10-13');
  const header = csvFields(lines[3]);
  assert.deepEqual(header, ['Fecha', 'Hora', 'Nombre', 'Teléfono', 'Asesora gestión', 'Asesora asignada',
    'Canal', 'Data Dura', 'Gestión anterior', 'Gestión nueva', 'Observaciones', 'Campaña']);
  const row = csvFields(lines[4]);
  assert.equal(row.length, header.length);
  assert.equal(row.at(-1), 'Verano 2026');
  // El resto de columnas conserva su valor y su posición.
  assert.equal(row[0], '2026-10-03');
  assert.equal(row[2], 'Luis Pérez');
  assert.equal(row[3], "'3051234567");
});

test('csv de gestiones: campaña vacía deja la celda vacía sin desplazar columnas', () => {
  const lines = periodoGestionesCsvLines([gestionRow({ campana: '' }), gestionRow({ campana: undefined })], '2026-10-13');
  const header = csvFields(lines[3]);
  for (const linea of lines.slice(4)) {
    const row = csvFields(linea);
    assert.equal(row.length, header.length);
    assert.equal(row.at(-1), '');
  }
});

test('csv de gestiones: campaña con comas y comillas no rompe las columnas', () => {
  const lines = periodoGestionesCsvLines([gestionRow({ campana: 'Verano, "Otoño" 2026' })], '2026-10-13');
  const header = csvFields(lines[3]);
  const row = csvFields(lines[4]);
  assert.equal(row.length, header.length);
  assert.equal(row.at(-1), 'Verano, "Otoño" 2026');
});

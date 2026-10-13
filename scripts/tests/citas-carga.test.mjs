// Caracterizacion de la carga de Citas (fase 18): ordenar y unir con leads.
// El golden del flujo completo queda en el t5 de citas (leads sinteticos).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ordenarCitasDesc, unirCitasConLeads } from '../../src/legacy/citas.js';

const citas = [
  { id: 3, scheduled_at: '2026-10-24T18:00:00.000Z', lead_id: 2 },
  { id: 5, scheduled_at: '2026-10-24T18:00:00.000Z', lead_id: 1 },
  { id: 9, scheduled_at: '2026-10-25T10:00:00.000Z', lead_id: 3 },
  { id: 11, scheduled_at: '2026-10-23T08:00:00.000Z', lead_id: 4 },
];

test('ordenarCitasDesc: fecha descendente y empate por id descendente, sin mutar', () => {
  const entrada = [...citas];
  const salida = ordenarCitasDesc(citas);
  assert.deepEqual(salida.map(r => r.id), [9, 5, 3, 11]);
  assert.deepEqual(citas.map(r => r.id), [3, 5, 9, 11], 'la entrada no se muta');
  void entrada;
});

const leads = [
  { id: 1, Nombre: 'Ana' },
  { id: 2, Nombre: 'Beto', archived_at: '2026-10-01' },
  { id: 3, Nombre: 'Ceni' },
];
const filas = [
  { id: 1, lead_id: 1, status: 'PROGRAMADA' },
  { id: 2, lead_id: 2, status: 'PROGRAMADA' },
  { id: 3, lead_id: 3, status: 'ASISTIO' },
  { id: 4, lead_id: 99, status: 'PROGRAMADA' },
  { id: 5, lead_id: null, status: 'PROGRAMADA' },
];

test('unirCitasConLeads: une activos y contabiliza archivadas y faltantes', () => {
  const { citas: unidas, omitidas, aviso } = unirCitasConLeads(filas, leads);
  assert.deepEqual(unidas.map(r => r.id), [1, 3]);
  assert.deepEqual(unidas.map(r => r.lead?.Nombre), ['Ana', 'Ceni']);
  // sin lead_id se descuenta en silencio (sin contador)
  assert.deepEqual(omitidas, { sinLead: 1, archivadas: 1 });
  assert.equal(aviso, 'Omitidas: 1 cita(s) sin lead asociado; 1 cita(s) de lead(s) archivado(s).');
});

test('unirCitasConLeads: aviso vacio cuando nada se omite', () => {
  const soloActivas = [{ id: 1, lead_id: 1, status: 'PROGRAMADA' }];
  const res = unirCitasConLeads(soloActivas, leads);
  assert.deepEqual(res.aviso, '');
  assert.equal(res.citas.length, 1);
  // duplicados de lead funcionan: ambos citas comparten el mismo lead
  const dobles = [{ id: 1, lead_id: 1 }, { id: 2, lead_id: 1 }];
  assert.equal(unirCitasConLeads(dobles, leads).citas.length, 2);
});

test('unirCitasConLeads: entradas vacias devuelven vacias sin aviso', () => {
  assert.deepEqual(unirCitasConLeads([], leads), { citas: [], omitidas: { sinLead: 0, archivadas: 0 }, aviso: '' });
  assert.deepEqual(unirCitasConLeads(filas, []), { citas: [], omitidas: { sinLead: 4, archivadas: 0 }, aviso: 'Omitidas: 4 cita(s) sin lead asociado.' });
});

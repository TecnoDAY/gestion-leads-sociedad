// Caracterizacion del estado de leads (fase 20): upsert y remove puros.
// El estado es explícito: { allLeads, completeCurrentLeads,
// completeCurrentLoaded, totalDatabaseCount, leadDataRevision }.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aplicarRemoveLead, aplicarUpsertLead } from '../../src/legacy/leads.js';

const estado = (extra = {}) => ({
  allLeads: [{ id: 1, Nombre: 'Ana' }, { id: 2, Nombre: 'Beto' }],
  completeCurrentLeads: [],
  completeCurrentLoaded: false,
  totalDatabaseCount: 2,
  leadDataRevision: 0,
  ...extra,
});

test('upsert: lead nuevo alta en allLeads y cache, revisa el total y marca revision', () => {
  const res = aplicarUpsertLead(estado(), { id: 3, Nombre: 'Ceni' });
  assert.equal(res.esNuevo, true);
  assert.deepEqual(res.estado.allLeads.map(l => l.id), [3, 2, 1]);
  assert.equal(res.estado.totalDatabaseCount, 3);
  assert.equal(res.estado.leadDataRevision, 1);
});

test('upsert existente: consolida campos sin sumar total y no es nuevo', () => {
  const res = aplicarUpsertLead(estado(), { id: 1, GESTION: 'AGENDADO' });
  assert.equal(res.esNuevo, false);
  assert.equal(res.estado.totalDatabaseCount, 2);
  assert.equal(res.estado.leadDataRevision, 1);
  const enLista = res.estado.allLeads.find(l => String(l.id) === '1');
  assert.equal(enLista.GESTION, 'AGENDADO');
  assert.equal(enLista.Nombre, 'Ana', 'consolido sin borrar lo anterior');
});

test('upsert cache-only: lead fuera de allLeads pero en cache completa', () => {
  const base = estado({ completeCurrentLeads: [{ id: 7, Nombre: 'Cache' }], completeCurrentLoaded: true, totalDatabaseCount: 2 });
  const res = aplicarUpsertLead(base, { id: 7, Telefono: '1-786' });
  assert.equal(res.esNuevo, false);
  // no se agregó a allLeads
  assert.deepEqual(res.estado.allLeads.map(l => l.id), [1, 2]);
  const enCache = res.estado.completeCurrentLeads[0];
  assert.equal(enCache.Telefono, '1-786');
  assert.equal(enCache.Nombre, 'Cache');
  assert.equal(res.estado.totalDatabaseCount, 2, 'el total no crece en cache-only');
  assert.equal(res.estado.leadDataRevision, 1);
});

test('upsert con cache completa y alta: entra en allLeads y en la cache', () => {
  const base = estado({ completeCurrentLeads: [{ id: 2, Nombre: 'Beto' }], completeCurrentLoaded: true });
  const res = aplicarUpsertLead(base, { id: 5, Nombre: 'Eve' });
  assert.equal(res.esNuevo, true);
  assert.deepEqual(res.estado.allLeads.map(l => l.id), [5, 2, 1]);
  assert.deepEqual(res.estado.completeCurrentLeads.map(l => l.id), [5, 2]);
  assert.equal(res.estado.totalDatabaseCount, 3);
});

test('upsert respeta loadedLeadTarget recortando por el final', () => {
  const base = estado({ allLeads: [{ id: 10 }, { id: 9 }], totalDatabaseCount: 2 });
  const res = aplicarUpsertLead(base, { id: 11 }, 2);
  // consolidate deja [11, 10, 9] y el límite recorta por el final
  assert.deepEqual(res.estado.allLeads.map(l => l.id), [11, 10]);
  assert.equal(res.estado.totalDatabaseCount, 3);
});

test('remove: quita de allLeads y de la cache completa si viene cargada', () => {
  const base = estado({ completeCurrentLeads: [{ id: 1 }, { id: 2 }], completeCurrentLoaded: true });
  const res = aplicarRemoveLead(base, '1');
  assert.equal(res.removedVisible, true);
  assert.deepEqual(res.estado.allLeads.map(l => l.id), [2]);
  assert.deepEqual(res.estado.completeCurrentLeads.map(l => l.id), [2]);
  assert.equal(res.estado.totalDatabaseCount, 1);
  assert.equal(res.estado.leadDataRevision, 1);
});

test('remove inexistente: no cambia el estado ni el total', () => {
  const res = aplicarRemoveLead(estado(), 99);
  assert.equal(res.removedVisible, false);
  assert.equal(res.estado.totalDatabaseCount, 2);
  assert.equal(res.estado.leadDataRevision, 0);
  assert.deepEqual(res.estado.allLeads, [{ id: 1, Nombre: 'Ana' }, { id: 2, Nombre: 'Beto' }]);
});

test('remove con piso en cero y entrada rara', () => {
  const res = aplicarRemoveLead(estado({ allLeads: [{ id: 5 }], totalDatabaseCount: 1 }), 5);
  assert.equal(res.estado.totalDatabaseCount, 0);
  const resNula = aplicarRemoveLead(estado({ allLeads: [] }), undefined);
  assert.equal(resNula.removedVisible, false);
});

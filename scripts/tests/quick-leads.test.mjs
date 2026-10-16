// Caracterizacion de leads recientes (fase 28), sin navegador ni red.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { badgeGestionHtml, quickLeadsHtml } from '../../src/legacy/leads.js';
import { escapeAttr, escapeHtml } from '../../src/legacy/helpers.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const start = html.indexOf('    function renderQuickLeads() {');
const listenerStart = html.indexOf("    document.getElementById('quickLeadsList')?.addEventListener", start);
const end = html.indexOf('    // Delegacion de clics de la matriz', listenerStart);
assert.ok(start >= 0 && listenerStart > start && end > listenerStart, 'Wrapper y listener reales presentes');
const wrapperSource = html.slice(start, listenerStart);
const listenerSource = html.slice(listenerStart, end);
const nombres = marcado => [...marcado.matchAll(/class="font-semibold text-left[^>]*>(.*?)<\/button>/g)].map(m => m[1]);

test('orden numerico descendente, limite cuatro y entrada congelada sin mutacion', () => {
  const leads = Object.freeze(['12', '11', '10', '0010', '9', '8', '7', '6', '2', '1'].map(id => Object.freeze({ id, Nombre: id })));
  assert.deepEqual(nombres(quickLeadsHtml(leads)), ['12', '11', '10', '0010', '9', '8', '7', '6']);
  assert.deepEqual(leads.map(l => l.id), ['12', '11', '10', '0010', '9', '8', '7', '6', '2', '1']);
  assert.equal((quickLeadsHtml(leads).match(/class="quick-lead-row text-xs"/g) || []).length, 8);
});

test('ids no numericos conservan la semantica Number y la estabilidad original', () => {
  const leads = [{ id: 'abc', Nombre: 'primero' }, { id: 2, Nombre: 'segundo' }, { id: 10, Nombre: 'tercero' }];
  assert.deepEqual(nombres(quickLeadsHtml(leads)), ['primero', 'tercero', 'segundo']);
});

test('defaults y HTML exacto de una tarjeta actual, incluido WhatsApp sin telefono', () => {
  assert.equal(quickLeadsHtml([{ id: 7 }]), `<div class="quick-lead-row text-xs">
          <div class="quick-lead-meta"><button type="button" data-quick-action="view" data-lead-id="7" data-origin="actual" class="font-semibold text-left text-white hover:text-indigo-400 cursor-pointer">Sin nombre</button><p class="mt-1 text-slate-400">Sin fecha</p></div>
          <span class="quick-lead-campaign quick-lead-meta text-slate-300">Sin campaña</span>
          <span class="quick-lead-status">${badgeGestionHtml('Sin estado')}</span>
          <div class="quick-lead-actions">
            <button type="button" disabled title="Disponible cuando se conecte la API de WhatsApp" aria-label="WhatsApp deshabilitado hasta conectar la API" class="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-400 opacity-60 cursor-not-allowed">WhatsApp · Próximamente</button>
            <button type="button" data-quick-action="edit" data-lead-id="7" data-origin="actual" class="rounded-lg border border-indigo-500/40 px-3 py-1.5 font-semibold text-indigo-300 hover:bg-indigo-500/10 cursor-pointer">Gestionar</button>
            <button type="button" data-quick-action="view" data-lead-id="7" data-origin="actual" class="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer">Ver ficha</button>
          </div>
        </div>`);
  assert.deepEqual(nombres(quickLeadsHtml([{ id: 7, Nombre: '', Fecha: '', 'Campaña': '', GESTION: '' }])), ['Sin nombre']);
});

test('escapa textos e id de las tres acciones, normaliza origen y reutiliza badge', () => {
  const payload = '<img src=x onerror="bad">&\'';
  const marcado = quickLeadsHtml([{ id: payload, Nombre: payload, Fecha: payload, 'Campaña': payload, GESTION: payload, __origin: payload }]);
  assert.equal((marcado.match(/&lt;img/g) || []).length, 7);
  assert.equal((marcado.match(/data-origin="actual"/g) || []).length, 3);
  assert.equal((marcado.match(/data-quick-action="view"/g) || []).length, 2);
  assert.equal((marcado.match(/data-quick-action="edit"/g) || []).length, 1);
  assert.ok(marcado.includes(`data-lead-id="${escapeAttr(payload)}"`));
  assert.ok(marcado.includes(escapeHtml(payload)));
  assert.ok(marcado.includes(badgeGestionHtml(payload)));
  assert.doesNotMatch(marcado, /<img|onerror="bad"|onclick=|href=/);
});

test('historico y actual con mismo id mantienen origen, etiqueta y badges de gestion', () => {
  const marcado = quickLeadsHtml([{ id: 5, Nombre: 'Viejo', Fecha: '3/10/2025', GESTION: 'INSCRITO', __origin: 'historico' }, { id: 5, Nombre: 'Actual', GESTION: 'AGENDADO', __origin: 'actual', Telefono: '123' }]);
  assert.deepEqual(nombres(marcado), ['Viejo', 'Actual']);
  assert.equal((marcado.match(/ · Histórico 2025/g) || []).length, 1);
  assert.match(marcado, /3\/10\/2025 · Histórico 2025/);
  for (const origin of ['historico', 'actual']) assert.equal((marcado.match(new RegExp(`data-lead-id="5" data-origin="${origin}"`, 'g')) || []).length, 3);
  for (const estado of ['INSCRITO', 'AGENDADO']) assert.ok(marcado.includes(badgeGestionHtml(estado)));
  assert.equal((marcado.match(/type="button" disabled title="Disponible cuando se conecte la API de WhatsApp"/g) || []).length, 2);
});

test('vacio mantiene mensaje y accion de limpiar filtros exactos', () => {
  assert.equal(quickLeadsHtml([]), '<div class="quick-leads-empty"><p class="text-sm font-semibold">No hay leads con los filtros seleccionados.</p><p class="mt-1 text-xs">Prueba con otros criterios o limpia los filtros para ver los registros.</p><button type="button" data-ev="click:resetAllFilters()">Limpiar filtros</button></div>');
});

test('wrapper real delega conjunto filtrado, actualiza DOM y tolera contenedor ausente', () => {
  const container = { innerHTML: 'anterior' };
  const filteredLeads = Object.freeze([Object.freeze({ id: 2 }), Object.freeze({ id: 10 })]);
  const context = vm.createContext({ filteredLeads, quickLeadsHtml, document: { getElementById(id) { assert.equal(id, 'quickLeadsList'); return container; } } });
  vm.runInContext(wrapperSource, context);
  context.dashboardVisibleLeads = null;
  context.renderQuickLeads();
  assert.equal(container.innerHTML, quickLeadsHtml(filteredLeads));
  context.filteredLeads = [];
  context.renderQuickLeads();
  assert.equal(container.innerHTML, quickLeadsHtml([]));
  context.document.getElementById = () => null;
  context.quickLeadsHtml = () => assert.fail('No debe generar marcado sin contenedor');
  assert.doesNotThrow(() => context.renderQuickLeads());
  assert.doesNotMatch(wrapperSource, /\.sort\(|\.slice\(|\.map\(|quick-lead-row/);
});

test('listener real enruta edit/view por id y origen e ignora acciones ajenas', () => {
  let listener;
  const calls = [];
  const context = vm.createContext({
    document: { getElementById(id) { assert.equal(id, 'quickLeadsList'); return { addEventListener(event, callback) { assert.equal(event, 'click'); listener = callback; } }; } },
    openEditLeadModal: (...args) => calls.push(['edit', ...args]),
    openViewLeadModal: (...args) => calls.push(['view', ...args]),
  });
  vm.runInContext(listenerSource, context);
  for (const origin of ['actual', 'historico']) {
    for (const quickAction of ['edit', 'view', 'other']) {
      listener({ target: { closest(selector) { assert.equal(selector, '[data-quick-action]'); return { dataset: { quickAction, leadId: '5', origin } }; } } });
    }
  }
  listener({ target: { closest: () => null } });
  listener({ target: {} });
  assert.deepEqual(calls, [['edit', '5', 'actual'], ['view', '5', 'actual'], ['edit', '5', 'historico'], ['view', '5', 'historico']]);
  context.document.getElementById = () => null;
  assert.doesNotThrow(() => vm.runInContext(listenerSource, context));
});

test('registro window para el script clasico', async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    const mod = await import('../../src/legacy/leads.js?fase28-window');
    assert.equal(globalThis.window.quickLeadsHtml, mod.quickLeadsHtml);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

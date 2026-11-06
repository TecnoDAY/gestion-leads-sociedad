import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import * as helpers from '../../src/legacy/helpers.js';
import { interesadoBadge, filaLeadHtml, tarjetaLeadMovilHtml } from '../../src/legacy/leads.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  for (let end = html.indexOf('}', start); end !== -1; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const cases = [
  ['actual primero', { 'INTERESADO EN': 'Actual <&>', 'Interesado en ': 'Antiguo' }, 'Actual <&>'],
  ['historico primero', { 'Interesado en ': 'Antiguo', 'INTERESADO EN': 'Actual <&>' }, 'Actual <&>'],
  ['actual nulo', { 'Interesado en ': 'Antiguo', 'INTERESADO EN': null }, ''],
  ['nulo primero', { 'INTERESADO EN': null, 'Interesado en ': 'Antiguo' }, ''],
  ['actual vacio', { 'INTERESADO EN': '', 'Interesado en ': 'Antiguo' }, ''],
  ['actual undefined', { 'INTERESADO EN': undefined, 'Interesado en ': 'Antiguo' }, ''],
  ['solo historico', { 'Interesado en ': 'Antiguo' }, ''],
  ['alias de tarea', { interesadoEn: 'Antiguo' }, ''],
  ['sin interes', {}, ''],
];

for (const [name, fields, expected] of cases) {
  test(`lector y render publico: ${name}`, () => {
    const lead = { id: 1, Nombre: 'Prueba', ...fields };
    const before = { ...lead };
    assert.equal(helpers.getLeadInterest(lead), expected);
    for (const rendered of [interesadoBadge(lead), filaLeadHtml(lead, { leadId: 1, origin: 'actual', isAdmin: false }), tarjetaLeadMovilHtml(lead, { leadId: 1, origin: 'actual', isAdmin: false })]) {
      assert.equal(rendered.includes('Interés:'), Boolean(expected));
      assert.ok(!rendered.includes('Antiguo'));
      if (expected) assert.ok(rendered.includes('Actual &lt;&amp;&gt;'));
    }
    assert.deepEqual(lead, before, 'leer no modifica los datos');
  });

  test(`busqueda para tareas: ${name}`, () => {
    const context = vm.createContext({ ...helpers, allLeads: [{ id: 1, Nombre: 'Prueba', ...fields }] });
    vm.runInContext(extract('searchLeadsForTask'), context);
    assert.equal(context.searchLeadsForTask('Prueba')[0].interesadoEn, expected);
  });

  for (const isAdmin of [false, true]) {
    test(`formulario real (${isAdmin ? 'admin' : 'asesora'}): ${name}`, () => {
      const elements = new Map();
      const element = id => {
        if (!elements.has(id)) elements.set(id, {
          value: '', dataset: {}, options: [], innerHTML: '',
          classList: { add() {}, remove() {}, toggle() {} }, appendChild() {},
        });
        return elements.get(id);
      };
      const lead = { id: 1, Nombre: 'Prueba', 'OBSERVACIONES ': 'Nota conservada', ...fields };
      const context = vm.createContext({
        ...helpers, document: { getElementById: element, createElement: () => ({}) }, window: {},
        findLeadByOrigin: () => lead, currentAccess: { nombre: 'Asesora' }, isAdmin,
        currentEditOrigin: '', editLeadRequestGeneration: 0, editLeadAdvisorGeneration: 0,
        editAdvisorsLoading: false, editLeadSubmitting: false, editLeadPreviousGestion: '',
        inscripcionErroresVisibles: {}, editProgramaInscripcionPrevio: '', editInteresadoEnPrevio: '',
        hideEditAppointmentFields() {}, updateEditEstadoChip() {}, actualizarResumenDatosAutomaticos() {},
        applyEditAppointmentVisibility() {}, renderInscripcionProgramas() {}, setProgramaInscripcionValue() {},
        applyEditInscripcionVisibility() {}, loadEditEnrollments() {},
        editLeadNeedsAppointment: () => false, editLeadStaysAgendado: () => false,
        setInteresadoEn: (prefix, value) => { element(prefix + 'InteresadoEn').value = value; },
      });
      vm.runInContext(extract('openEditLeadModal'), context);
      context.openEditLeadModal(1, 'actual');
      assert.equal(element('editInteresadoEn').value, expected);
      assert.equal(context.editInteresadoEnPrevio, expected);
      assert.equal(element('editObservaciones').value, 'Nota conservada');
    });
  }
}

test('lector de interes tolera lead ausente y conserva conversion a texto', () => {
  assert.equal(helpers.getLeadInterest(null), '');
  assert.equal(helpers.getLeadInterest(undefined), '');
  assert.equal(helpers.getLeadInterest({ 'INTERESADO EN': 42 }), '42');
});

test('getField mantiene los campos fisicos con espacios finales y sus alias', () => {
  const lead = { 'OBSERVACIONES ': 'Nota', 'Fecha Última Gestión ': '01/01/2026', 'Agente ': 'Ana' };
  assert.equal(helpers.getField(lead, 'OBSERVACIONES'), 'Nota');
  assert.equal(helpers.getField(lead, 'Fecha Última Gestión'), '01/01/2026');
  assert.equal(helpers.getField(lead, 'AGENTE'), 'Ana');
});

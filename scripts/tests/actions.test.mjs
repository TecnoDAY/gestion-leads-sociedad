// Caracterizacion del dispatcher src/legacy/actions.js (fase 15): el
// atributo data-ev y su tokenizer deben aceptar exactamente las formas
// presentes en el markup migrado y rechazar cualquier cosa distinta.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTOS, parseDataAtributo, llamarAccion } from '../../src/legacy/actions.js';

const globals = { args: (...a) => a, fn1: () => 'resultado' };
const base = { buscarGlobal: n => globals[n] };

test('eventos soportados y formato multi-tipo', () => {
  assert.ok(['click', 'change', 'input', 'submit', 'focus', 'blur', 'pointerenter'].every(t => EVENTOS.has(t)));
  assert.deepEqual(parseDataAtributo(`click:switchTab('leads')`), { tipos: ['click'], cuerpo: `switchTab('leads')` });
  assert.deepEqual(parseDataAtributo('pointerenter,focus,click:positionPeriodoTip(this)'), { tipos: ['pointerenter', 'focus', 'click'], cuerpo: 'positionPeriodoTip(this)' });
});

test('data-ev invalida lanza', () => {
  assert.throws(() => parseDataAtributo(''), /vacia/);
  assert.throws(() => parseDataAtributo('switchTab()'), /sin tipo/);
  assert.throws(() => parseDataAtributo('hover:fn()'), /tipo de evento/);
  assert.throws(() => parseDataAtributo('click:'), /sin cuerpo/);
});

test('llamadas con literales, this, event y escapes se resuelven', () => {
  assert.equal(llamarAccion('fn1()', base), 'resultado');
  assert.deepEqual(llamarAccion(`args('AGENDADO', 12, true, false, null)`, base), ['AGENDADO', 12, true, false, null]);
  assert.deepEqual(llamarAccion(`args('con \\'escape\\' y \\\\')`, base), [`con 'escape' y \\`]);
  assert.deepEqual(llamarAccion(`args('-3.5', 0)`, base), ['-3.5', 0]);
  assert.deepEqual(llamarAccion(`args(-3.5, 0)`, base), [-3.5, 0]);
  assert.deepEqual(llamarAccion('args(this, event)', { ...base, elemento: 'EL', evento: 'EV' }), ['EL', 'EV']);
});

test('this es el elemento: conserva la ligadura de los handlers inline', () => {
  let visto;
  const con = { elemento: 'ELEMENTO', buscarGlobal: n => ({ usaThis(arg) { visto = [this, arg]; } })[n] };
  llamarAccion('usaThis(7)', con);
  assert.deepEqual(visto, ['ELEMENTO', 7]);
});

test('token no soportado o sintaxis rara se rechaza (sin eval)', () => {
  assert.throws(() => llamarAccion('args(currentViewId)', base), /no soportado/);
  assert.throws(() => llamarAccion("document.getElementById('x')", base), /cuerpo de data-ev/);
  assert.throws(() => llamarAccion('args(); args(1)', base), /sobrante|inesperada/);
  assert.throws(() => llamarAccion('args(a ? b : c)', base), /no soportado/);
  assert.throws(() => llamarAccion(`args('sin cerrar)`, base), /sin cerrar/);
  assert.throws(() => llamarAccion('args(1 2)', base), /inesperada/);
  assert.throws(() => llamarAccion('args(1,))', base), /sobrante|inesperada/);
});

test('funcion global ausente lanza con nombre claro', () => {
  assert.throws(() => llamarAccion('noExiste(1)', { buscarGlobal: () => undefined }), /ausente/);
});

// Caracterizacion del dispatcher src/legacy/actions.js (fase 15): el
// atributo data-ev y su tokenizer deben aceptar exactamente las formas
// presentes en el markup migrado y rechazar cualquier cosa distinta.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { EVENTOS, HANDLERS, parseDataAtributo, llamarAccion } from '../../src/legacy/actions.js';

const globals = { args: (...a) => a, fn1: () => 'resultado' };
const base = { buscarGlobal: n => globals[n] };
// Los tests usan nombres sinteticos: se les pasa una allowlist propia.
const testeo = { ...base, permitidos: new Set(['args', 'fn1', 'usaThis']) };

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
  assert.equal(llamarAccion('fn1()', testeo), 'resultado');
  assert.deepEqual(llamarAccion(`args('AGENDADO', 12, true, false, null)`, testeo), ['AGENDADO', 12, true, false, null]);
  assert.deepEqual(llamarAccion(`args('con \\'escape\\' y \\\\')`, testeo), [`con 'escape' y \\`]);
  assert.deepEqual(llamarAccion(`args('-3.5', 0)`, testeo), ['-3.5', 0]);
  assert.deepEqual(llamarAccion(`args(-3.5, 0)`, testeo), [-3.5, 0]);
  assert.deepEqual(llamarAccion('args(this, event)', { ...testeo, elemento: 'EL', evento: 'EV' }), ['EL', 'EV']);
});

test('this es el elemento: conserva la ligadura de los handlers inline', () => {
  let visto;
  const con = { ...testeo, elemento: 'ELEMENTO', buscarGlobal: n => ({ usaThis(arg) { visto = [this, arg]; } })[n] };
  llamarAccion('usaThis(7)', con);
  assert.deepEqual(visto, ['ELEMENTO', 7]);
});

test('token no soportado o sintaxis rara se rechaza (sin eval)', () => {
  assert.throws(() => llamarAccion('args(currentViewId)', testeo), /no soportado/);
  assert.throws(() => llamarAccion("document.getElementById('x')", testeo), /cuerpo de data-ev/);
  assert.throws(() => llamarAccion('args(); args(1)', testeo), /sobrante|inesperada/);
  assert.throws(() => llamarAccion('args(a ? b : c)', testeo), /no soportado/);
  assert.throws(() => llamarAccion(`args('sin cerrar)`, testeo), /sin cerrar/);
  assert.throws(() => llamarAccion('args(1 2)', testeo), /inesperada/);
  assert.throws(() => llamarAccion('args(1,))', testeo), /sobrante|inesperada/);
});

test('funcion global ausente lanza con nombre claro', () => {
  assert.throws(() => llamarAccion('noExiste(1)', { ...testeo, permitidos: new Set(['noExiste']), buscarGlobal: () => undefined }), /ausente/);
});

test('la allowlist bloquea cualquier handler que no este declarado', () => {
  // Sin allowlist explicita manda la de la app: un HTML inyectado no puede
  // invocar un global arbitrario (por ejemplo fetch).
  assert.throws(() => llamarAccion('fetch(1)', { buscarGlobal: () => () => 'x' }), /no permitido/);
  assert.throws(() => llamarAccion('eval("1")', { buscarGlobal: () => () => 'x' }), /no permitido/);
  assert.throws(() => llamarAccion('locationReload(1)', { buscarGlobal: () => () => 'x' }), /no permitido/);
  // Un handler declarado si se puede invocar.
  assert.equal(llamarAccion('switchTab(1)', { buscarGlobal: () => () => 'ok' }), 'ok');
});

test('todos los data-ev del repo usan handlers declarados en la allowlist', () => {
  const raiz = new URL('../../', import.meta.url);
  const ficheros = ['index.html', ...readdirSync(new URL('src/legacy/', raiz)).map(f => `src/legacy/${f}`)];
  const usados = new Set();
  for (const fichero of ficheros) {
    if (!fichero.endsWith('.html') && !fichero.endsWith('.js')) continue;
    const txt = readFileSync(new URL(fichero, raiz), 'utf8');
    for (const m of txt.matchAll(/data-ev="([^"]*)"/g)) {
      const cuerpo = (m[1].split(':')[1] || '').trim();
      const handler = /^([A-Za-z_$][\w$]*)\s*\(/.exec(cuerpo);
      if (handler) usados.add(handler[1]);
    }
  }
  const fuera = [...usados].filter(h => !HANDLERS.has(h));
  assert.deepEqual(fuera, [], `handlers sin declarar en la allowlist: ${fuera.join(', ')}`);
});

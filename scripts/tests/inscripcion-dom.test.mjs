import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Comportamiento de la seccion de inscripcion en el DOM.
//
// Mini-DOM: soporta el subconjunto de HTML que genera inscripcionProgramasHtml
// (div/label/select/option/p/input/span) y los selectores por atributo que usa
// el codigo ([data-x="y"]). Escribe a proposito: el fallo que motivó este test
// fue mezclar el atributo hidden con la clase hidden (mismo nombre, distinto
// mecanismo), asi que el DOM debe honorarlos como mecanismos separados.
class Nodo {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = { ...attrs };
    this.hijos = [];
    this.texto = '';
    this._value = '';
    this._checked = false;
    this._disabled = false;
    this.listeners = {};
  }

  get classList() {
    const nodo = this;
    const lista = () => String(nodo.attrs.class || '').split(/\s+/).filter(Boolean);
    return {
      toggle: (cls, force) => {
        const l = lista();
        const tiene = l.includes(cls);
        const nuevo = force === undefined ? !tiene : Boolean(force);
        if (nuevo && !tiene) l.push(cls);
        if (!nuevo && tiene) l.splice(l.indexOf(cls), 1);
        nodo.attrs.class = l.join(' ');
      },
      contains: cls => lista().includes(cls),
    };
  }

  // El atributo hidden y la clase hidden son mecanismos distintos: el atributo
  // manda en este mini-DOM (igual que en el navegador).
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }

  get value() { return this._value; }
  set value(v) { this._value = String(v ?? ''); }
  get checked() { return this._checked; }
  set checked(v) { this._checked = Boolean(v); }
  get disabled() { return this._disabled; }
  set disabled(v) { this._disabled = Boolean(v); }
  get textContent() { return this.texto; }
  set textContent(v) { this.texto = String(v ?? ''); }

  get dataset() {
    const data = {};
    for (const [k, v] of Object.entries(this.attrs)) {
      if (!k.startsWith('data-')) continue;
      data[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    return data;
  }

  addEventListener(tipo, fn) { (this.listeners[tipo] = this.listeners[tipo] || []).push(fn); }
  setAttribute(nombre, valor) { this.attrs[nombre] = String(valor); }
  getAttribute(nombre) { return nombre in this.attrs ? this.attrs[nombre] : null; }
  disparar(tipo) { (this.listeners[tipo] || []).forEach(fn => fn({ target: this })); }

  get innerHTML() { return this._html || ''; }
  set innerHTML(v) {
    this._html = v;
    this.hijos = parsear(v);
    // El valor de un select es la opcion marcada (o la primera).
    for (const nodo of recorrer(this)) {
      if (nodo.tag !== 'select') continue;
      const opciones = nodo.hijos.filter(h => h.tag === 'option');
      const marcada = opciones.find(o => 'selected' in o.attrs);
      const elegida = marcada || opciones[0];
      nodo._value = elegida ? (elegida.attrs.value ?? elegida.texto) : '';
    }
  }

  _coincide(sel) {
    const m = /^\[([a-zA-Z0-9_:.-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (!m) return false;
    const [, attr, valor] = m;
    if (!(attr in this.attrs)) return false;
    return valor === undefined || this.attrs[attr] === valor;
  }

  querySelector(sel) {
    for (const nodo of recorrer(this)) if (nodo._coincide(sel)) return nodo;
    return null;
  }

  querySelectorAll(sel) {
    return recorrer(this).filter(nodo => nodo._coincide(sel));
  }
}

function recorrer(raiz) {
  const salida = [];
  for (const hijo of raiz.hijos) { salida.push(hijo, ...recorrer(hijo)); }
  return salida;
}

function parsear(html) {
  const raiz = new Nodo('root');
  const pila = [raiz];
  const re = /<\/?([a-zA-Z0-9]+)((?:\s+[a-zA-Z0-9_:.-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[4] !== undefined) {
      const texto = m[4].trim();
      if (texto) pila[pila.length - 1].texto += texto;
      continue;
    }
    const [, tag, attrsTxt, cierre] = m;
    if (m[0].startsWith('</')) { if (pila.length > 1) pila.pop(); continue; }
    const attrs = {};
    for (const a of attrsTxt.matchAll(/([a-zA-Z0-9_:.-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    const nodo = new Nodo(tag, attrs);
    pila[pila.length - 1].hijos.push(nodo);
    if (!cierre && tag !== 'input') pila.push(nodo);
  }
  return raiz.hijos;
}

// --- Extraccion del codigo del arbol (mismo metodo que t5-frontend-edge) ----
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('async function loadCitas'));

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  assert.ok(match, `${name} ausente en index.html`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const inscripcionesMod = await import('../../src/legacy/inscripciones.js');
const { PROGRAMAS_INSCRIPCION, esInscritoGestion, inscripcionPayload, inscripcionDesdeFilas, programaEtiqueta,
  programaRequiereDetalle, programasInscripcionDisponibles } = inscripcionesMod;

/** Monta el DOM de la seccion de inscripcion y ejecuta el codigo real del arbol. */
function montar({ prefix = 'edit', filas = [], guardados = [] } = {}) {
  const box = new Nodo('div');
  const aviso = new Nodo('p');
  const gestion = new Nodo('select');
  gestion.value = 'INSCRITO';
  const elementos = {
    [prefix + 'InscripcionProgramas']: box,
    [prefix + 'InscripcionAviso']: aviso,
    [prefix === 'new' ? 'newGestion' : 'editGestion']: gestion,
  };
  const ctx = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    document: { getElementById: id => elementos[id] ?? null },
    window: {},
    escapeAttr: s => String(s ?? ''),
    escapeHtml: s => String(s ?? ''),
    PROGRAMAS_INSCRIPCION, esInscritoGestion, inscripcionPayload, inscripcionDesdeFilas, programaEtiqueta,
    editInscripcionFilas: guardados,
  });
  const fuente = [
    // var (no const) para que el test pueda leerlo desde el contexto.
    'var inscripcionErroresVisibles = { new: false, edit: false };',
    ...['inscripcionProgramasHtml', 'renderInscripcionProgramas', 'syncInscripcionFila',
      'inscripcionProgramasGuardados', 'inscripcionSeleccion', 'inscripcionFaltanNiveles',
      'updateInscripcionAviso', 'updateInscripcionPendiente'].map(extractFunction),
  ].join('\n');
  vm.runInContext(fuente, ctx);
  ctx.renderInscripcionProgramas(prefix, filas);
  return { ctx, box, aviso };
}

describe('inscripcion - visibilidad de los campos de cada programa', () => {
  test('al marcar un programa se muestran nivel y fecha', () => {
    const { ctx, box } = montar();
    const check = box.querySelector('[data-inscripcion-programa="TEATRO_MUSICAL"]');
    check.checked = true;
    check.disparar('change');
    const campos = box.querySelector('[data-inscripcion-campos="TEATRO_MUSICAL"]');
    assert.equal(campos.hidden, false, 'los campos deben verse al marcar el programa');
    assert.equal(box.querySelector('[data-inscripcion-nivel="TEATRO_MUSICAL"]').disabled, false);
    assert.equal(box.querySelector('[data-inscripcion-fecha="TEATRO_MUSICAL"]').disabled, false);
    assert.equal(ctx.inscripcionSeleccion('edit').length, 1);
  });

  test('al desmarcar se ocultan y se conservan los valores escritos', () => {
    const { ctx, box } = montar();
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    const nivel = box.querySelector('[data-inscripcion-nivel="ACTUACION"]');
    const fecha = box.querySelector('[data-inscripcion-fecha="ACTUACION"]');
    nivel.value = 'Acting Teens';
    fecha.value = '2026-09-20';
    check.checked = false;
    check.disparar('change');
    assert.equal(box.querySelector('[data-inscripcion-campos="ACTUACION"]').hidden, true);
    assert.equal(nivel.value, 'Acting Teens', 'el valor se conserva al desmarcar');
    assert.equal(fecha.value, '2026-09-20');
    check.checked = true;
    check.disparar('change');
    assert.equal(box.querySelector('[data-inscripcion-campos="ACTUACION"]').hidden, false);
    assert.equal(nivel.value, 'Acting Teens');
  });

  test('un programa ya guardado muestra el aviso de baja al desmarcarlo', () => {
    const { box } = montar({ guardados: [{ programa: 'TEATRO_MUSICAL', activa: true }] });
    const nota = box.querySelector('[data-inscripcion-nota="TEATRO_MUSICAL"]');
    assert.equal(nota.hidden, true, 'sin tocar nada no hay aviso');
    const check = box.querySelector('[data-inscripcion-programa="TEATRO_MUSICAL"]');
    check.checked = true;
    check.disparar('change');
    check.checked = false;
    check.disparar('change');
    assert.equal(nota.hidden, false, 'el aviso de baja debe verse');
    assert.match(nota.textContent, /Se registrará la baja/);
  });

  test('el aviso de baja no aparece si el programa no estaba guardado', () => {
    const { box } = montar({ guardados: [] });
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    check.checked = false;
    check.disparar('change');
    assert.equal(box.querySelector('[data-inscripcion-nota="ACTUACION"]').hidden, true);
  });
});

describe('inscripcion - error de nivel junto al campo', () => {
  test('no aparece al marcar el programa: solo tras intentar guardar', () => {
    const { ctx, box } = montar();
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    const error = box.querySelector('[data-inscripcion-error="ACTUACION"]');
    assert.equal(error.hidden, true, 'marcar un programa no es un error');
    ctx.inscripcionErroresVisibles.edit = true;
    ctx.updateInscripcionAviso('edit');
    assert.equal(error.hidden, false, 'tras intentar guardar debe verse el error');
    assert.match(error.textContent, /Falta elegir el nivel/);
  });

  test('desaparece en cuanto se elige el nivel', () => {
    const { ctx, box } = montar();
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    ctx.inscripcionErroresVisibles.edit = true;
    ctx.updateInscripcionAviso('edit');
    const nivel = box.querySelector('[data-inscripcion-nivel="ACTUACION"]');
    nivel.value = 'Acting Teens';
    nivel.disparar('change');
    assert.equal(box.querySelector('[data-inscripcion-error="ACTUACION"]').hidden, true);
  });
});

describe('inscripcion - estado de la fecha en la tarjeta', () => {
  test('al marcar un programa sin fecha aparece el chip "Sin fecha"', () => {
    const { box } = montar();
    const chip = box.querySelector('[data-inscripcion-pendiente="ACTUACION"]');
    assert.equal(chip.hidden, true, 'sin marcar no hay chip');
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    assert.equal(chip.hidden, false, 'marcado y sin fecha debe avisar');
  });

  test('el chip desaparece al poner la fecha y vuelve al quitarla', () => {
    const { box } = montar();
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    const chip = box.querySelector('[data-inscripcion-pendiente="ACTUACION"]');
    const fecha = box.querySelector('[data-inscripcion-fecha="ACTUACION"]');
    fecha.value = '2026-09-20';
    fecha.disparar('change');
    assert.equal(chip.hidden, true);
    fecha.value = '';
    fecha.disparar('change');
    assert.equal(chip.hidden, false);
  });
});

describe('inscripcion - la seccion vacia no es un error', () => {
  test('sin programa el aviso informa y no se pinta como error', () => {
    const { ctx, aviso } = montar();
    ctx.inscripcionErroresVisibles.edit = true;
    ctx.updateInscripcionAviso('edit');
    assert.match(aviso.textContent, /opcional/i, `aviso=${aviso.textContent}`);
    assert.doesNotMatch(String(aviso.className || ''), /amber/, 'no es un aviso de error');
  });

  test('con programa sin nivel el aviso si explica el nivel que falta', () => {
    const { ctx, box, aviso } = montar();
    const check = box.querySelector('[data-inscripcion-programa="ACTUACION"]');
    check.checked = true;
    check.disparar('change');
    ctx.inscripcionErroresVisibles.edit = true;
    ctx.updateInscripcionAviso('edit');
    assert.match(aviso.textContent, /Falta elegir el nivel/, `aviso=${aviso.textContent}`);
  });
});

describe('inscripcion - programa de inscripcion (campañas activas del catálogo)', () => {
  const catalogos = {
    campana: [
      { value: 'Actuacion adultos', active: true },
      { value: 'Actuacion kids', active: true },
      { value: 'Kids doral inglés', active: true },
      { value: 'Sin definir', active: true },
      { value: 'Taller camara', active: true },
      { value: 'Weston', active: true },
      { value: 'Casting bootcamp', active: false },
      { value: 'Summer camp', active: false },
    ],
  };

  test('solo se ofrecen las campañas activas y sin "Sin definir"', () => {
    assert.deepEqual(programasInscripcionDisponibles(catalogos), [
      'Actuacion adultos', 'Actuacion kids', 'Kids doral inglés', 'Taller camara', 'Weston',
    ]);
  });

  test('sin catálogo o sin campañas activas no hay opciones', () => {
    assert.deepEqual(programasInscripcionDisponibles(null), []);
    assert.deepEqual(programasInscripcionDisponibles({ campana: [] }), []);
    assert.deepEqual(programasInscripcionDisponibles({ campana: [{ value: 'X', active: false }] }), []);
  });

  test('Actuación Adultos y Taller de cámara no llevan el detalle de nivel', () => {
    assert.equal(programaRequiereDetalle('Actuacion adultos'), false);
    assert.equal(programaRequiereDetalle('Taller camara'), false);
    assert.equal(programaRequiereDetalle('taller cámara'), false, 'la comparación ignora tildes y mayúsculas');
    assert.equal(programaRequiereDetalle('Actuacion kids'), true);
    assert.equal(programaRequiereDetalle('Kids doral inglés'), true);
    assert.equal(programaRequiereDetalle(''), true, 'sin programa se mantiene el detalle');
  });
});

describe('inscripcion - un solo mecanismo de ocultacion', () => {
  test('el markup usa el atributo hidden, nunca la clase hidden', () => {
    const fuente = extractFunction('inscripcionProgramasHtml');
    assert.ok(!/class="[^"]*\bhidden\b/.test(fuente), 'la clase hidden no debe usarse en el markup');
    assert.match(fuente, /data-inscripcion-campos="\$\{escapeAttr\(p\.id\)\}"\$\{abierto \? '' : ' hidden'\}/);
  });

  test('el codigo cambia la propiedad hidden, no la clase', () => {
    const fuente = extractFunction('syncInscripcionFila');
    assert.match(fuente, /campos\.hidden\s*=\s*!activo/);
    assert.ok(!/classList\.toggle\('hidden'/.test(fuente), 'no se debe togglear la clase hidden');
  });
});

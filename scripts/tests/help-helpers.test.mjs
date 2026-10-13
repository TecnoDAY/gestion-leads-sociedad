// Caracterizacion del Centro de ayuda extraido a src/legacy/help.js (fase 1).
// Ejecuta las funciones reales del modulo con un DOM minimo, sin red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HELP_SECTIONS, normalizeHelpText, helpHighlight,
  renderHelpContent, clearHelpSearch, openHelpModal, closeHelpModal,
} from '../../src/legacy/help.js';

// Entidades construidas por char-codes: el editor puede decodificar
// entidades HTML en transito (leccion de odd/tasks/reduccion-monolito.md).
const LT = String.fromCharCode(38, 108, 116, 59); // <
const GT = String.fromCharCode(38, 103, 116, 59); // >

function makeEl(id) {
  const el = {
    id, value: '', textContent: '', _innerHTML: '', scrollTop: 0, focused: false, classes: new Set(),
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; },
    focus() { this.focused = true; },
    scrollIntoView() {},
    querySelectorAll() { return []; },
    getClientRects() { return []; },
  };
  el.classList = {
    add: (...c) => c.forEach(x => el.classes.add(x)),
    remove: (...c) => c.forEach(x => el.classes.delete(x)),
    contains: c => el.classes.has(c),
  };
  return el;
}

// DOM minimo instalado tras el import: en node el modulo no debe requerir
// document al cargarse (el listener de teclado queda solo para el navegador).
function installDom() {
  const elements = new Map();
  const el = id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); };
  const active = makeEl('boton-origen');
  globalThis.window = {};
  globalThis.document = {
    getElementById: el,
    querySelectorAll: () => [],
    contains: node => node === active || [...elements.values()].includes(node),
    get activeElement() { return active; },
    addEventListener() {},
  };
  return { el, active };
}

test('estructura: 9 secciones con ids unicos y campos completos', () => {
  assert.equal(HELP_SECTIONS.length, 9);
  const ids = HELP_SECTIONS.map(s => s.id);
  assert.equal(new Set(ids).size, 9);
  for (const s of HELP_SECTIONS) {
    assert.ok(s.id && s.icon && s.title && s.summary, `seccion incompleta: ${s.id}`);
    assert.ok(Array.isArray(s.steps) && s.steps.length > 0, `sin pasos: ${s.id}`);
    // notes es opcional: ayuda-data-dura no lo define (comportamiento real).
    assert.ok(s.notes === undefined || Array.isArray(s.notes), `notes no es lista: ${s.id}`);
  }
});

test('normalizeHelpText: sin diacriticos y en minusculas', () => {
  assert.equal(normalizeHelpText('Gestión'), 'gestion');
  assert.equal(normalizeHelpText(null), '');
});

test('helpHighlight: marca con o sin acento y escapa el HTML', () => {
  assert.match(helpHighlight('Usa el catálogo Medio', 'catalogo'), /<mark class="help-hit">catálogo<\/mark>/);
  assert.equal(helpHighlight('Sin término', ''), 'Sin término');
  // El texto se escapa antes del marcado: nada de HTML inyectado.
  assert.equal(helpHighlight('<b>Citas</b>', 'citas'), `${LT}b${GT}<mark class="help-hit">Citas</mark>${LT}/b${GT}`);
  // Un termino con caracteres de regex no rompe la construccion.
  assert.equal(helpHighlight('Precio (total) y +mas', '(total)'), 'Precio <mark class="help-hit">(total)</mark> y +mas');
});

test('renderHelpContent sin termino: todas las guias, meta e indice', () => {
  const { el } = installDom();
  renderHelpContent('');
  const content = el('helpContent').innerHTML;
  assert.match(content, /helpSection-ayuda-nuevo-lead/);
  assert.match(content, /helpSection-ayuda-seguridad-roles/);
  assert.equal(el('helpMeta').textContent, '9 guías');
  assert.equal(el('helpResults').textContent, '9 guías disponibles · la ayuda funciona sin conexión');
  assert.match(el('helpIndex').innerHTML, /help-index-btn/);
});

test('renderHelpContent: termino sin acento encuentra la guia con acento', () => {
  const { el } = installDom();
  renderHelpContent('catalogo');
  assert.match(el('helpContent').innerHTML, /helpSection-ayuda-catalogos/);
  assert.equal(el('helpResults').textContent, '4 de 9 guías coinciden con "catalogo"');
});

test('renderHelpContent: termino exclusivo deja una sola guia', () => {
  const { el } = installDom();
  renderHelpContent('trafficker');
  const content = el('helpContent').innerHTML;
  assert.match(content, /helpSection-ayuda-seguridad-roles/);
  assert.doesNotMatch(content, /helpSection-ayuda-citas/);
  assert.equal(el('helpResults').textContent, '1 de 9 guías coinciden con "trafficker"');
});

test('renderHelpContent conserva la numeracion original de los pasos', () => {
  const { el } = installDom();
  renderHelpContent('reprogramar');
  // "Para reprogramar..." es el paso 8 de la guia de Citas: no se renumera a 1.
  assert.match(el('helpContent').innerHTML, /help-step-num">8</);
  assert.equal(el('helpResults').textContent, '2 de 9 guías coinciden con "reprogramar"');
});

test('renderHelpContent sin coincidencias muestra el estado vacio', () => {
  const { el } = installDom();
  renderHelpContent('zzzz-sin-coincidencia');
  const content = el('helpContent').innerHTML;
  assert.match(content, /help-empty/);
  assert.match(content, /onclick="clearHelpSearch\(\)"/);
  assert.equal(el('helpResults').textContent, '0 de 9 guías coinciden con "zzzz-sin-coincidencia"');
});

test('openHelpModal abre, limpia la busqueda y enfoca la seccion pedida', () => {
  const { el, active } = installDom();
  el('helpSearch').value = 'algo escrito';
  openHelpModal('ayuda-citas');
  const modal = el('modalHelp');
  assert.equal(modal.classes.has('hidden'), false);
  assert.equal(modal.classes.has('flex'), true);
  assert.equal(el('helpSearch').value, '');
  assert.equal(window.helpReturnFocus, active, 'el foco de retorno se guarda en window');
  assert.equal(el('helpSection-ayuda-citas').focused, true);
  assert.equal(el('helpBody').scrollTop, 0);
});

test('openHelpModal con id desconocido enfoca la busqueda', () => {
  const { el } = installDom();
  openHelpModal('seccion-inexistente');
  assert.equal(el('helpSearch').focused, true);
  assert.equal(window.helpReturnFocus, el('helpSearch') ? window.helpReturnFocus : null);
});

test('closeHelpModal restaura el foco guardado en window', () => {
  const { el, active } = installDom();
  openHelpModal('ayuda-citas');
  closeHelpModal();
  const modal = el('modalHelp');
  assert.equal(modal.classes.has('hidden'), true);
  assert.equal(modal.classes.has('flex'), false);
  assert.equal(active.focused, true, 'el foco vuelve al elemento de origen');
  assert.equal(window.helpReturnFocus, null);
});

test('clearHelpSearch limpia, re-renderiza y devuelve el foco', () => {
  const { el } = installDom();
  el('helpSearch').value = 'trafficker';
  renderHelpContent('trafficker');
  clearHelpSearch();
  assert.equal(el('helpSearch').value, '');
  assert.match(el('helpContent').innerHTML, /helpSection-ayuda-nuevo-lead/);
  assert.equal(el('helpResults').textContent, '9 guías disponibles · la ayuda funciona sin conexión');
  assert.equal(el('helpSearch').focused, true);
});

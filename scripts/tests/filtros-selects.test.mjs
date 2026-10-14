// Fase 32: caracterizacion de los selects de filtros y catalogos.
// GOLDEN: populateFilterOptions/populateSelect/fillSelectFromCatalog de HEAD
// (git show) corren en sandbox vm contra un DOM falso y se serializan como
// opciones [{value,label,selected}] + writes de innerHTML + primera option.
// El arbol de trabajo (wrappers que delegan en piezas puras de
// src/legacy/catalogos.js) debe coincidir deepEqual en los mismos samples:
// vacios/'SN', duplicados con capitalizacion y acentos, current dentro y
// fuera del catalogo, values vacio y los cinco filtros con catalogRows mixtos.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { getField, catalogLabel, sortAlphaEs } from '../../src/legacy/helpers.js';
import * as catalogosApi from '../../src/legacy/catalogos.js';
import { FILTROS_CATALOGO, opcionesCatalogoData, opcionesSelectData, uniqueFieldValues } from '../../src/legacy/catalogos.js';

const root = new URL('../..', import.meta.url).pathname;
const headHtml = execSync('git show HEAD:index.html', { cwd: root, encoding: 'utf8' });
const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

const scriptOf = html => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('function populateFilterOptions'));

// Extrae la funcion real (equilibrando llaves via vm.Script), patron de fases previas.
function extractFunction(name, src, label) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(match, `${name} ausente en ${label}`);
  for (let end = src.indexOf('}', match.index); end !== -1; end = src.indexOf('}', end + 1)) {
    const candidate = src.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name} de ${label}`);
}

const FUNCIONES = ['populateFilterOptions', 'populateSelect', 'fillSelectFromCatalog', 'activeCatalogValues', 'catalogOptions'];
const headFuente = FUNCIONES.map(n => extractFunction(n, scriptOf(headHtml), 'HEAD')).join('\n');
const treeFuente = FUNCIONES.map(n => extractFunction(n, scriptOf(treeHtml), 'árbol de trabajo')).join('\n');

// --- Samples compartidos (identicos para HEAD y arbol) -----------------------
const SAMPLES = [
  {
    nombre: 'cinco filtros con catalogRows mixtos',
    leads: [
      { Mes: 'ENERO', 'Campaña': 'Weston', Medio: 'Instagram', GESTION: 'INSCRITO', 'Agente ': 'Ana' },
      { Mes: 'enero', 'Campaña': 'weston', Medio: 'instagram ', GESTION: 'sn', 'Agente ': 'ana' },
      { Mes: ' SEPTIEMBRE ', 'Campaña': '   ', Medio: '', GESTION: 'Agendado', 'Agente ': 'Álvaro' },
      { 'Campaña': 'Acuario', Medio: 'TikTok', GESTION: 'NO CONTESTA', 'Agente ': 'alvaro' },
      { Mes: 'MARZO', 'Campaña': 'Oculto', GESTION: 'SN', 'Agente ': null },
      null,
    ],
    catalogRows: {
      mes: [{ value: 'ENERO', active: true }, { value: 'OCTUBRE', active: true }, { value: 'MARZO', active: false }],
      campana: [{ value: 'Weston', active: true }, { value: 'Oculto', active: false }],
      medio: [],
      gestion: [{ value: 'INSCRITO', active: true }, { value: 'AGENDADO', active: true }],
      agente: [{ value: 'Ana', active: true }],
    },
    selects: {
      filterMes: { value: '' }, filterCampana: { value: 'weston' }, filterMedio: { value: '' },
      filterGestion: { value: 'INSCRITO' }, filterAsesora: { value: 'alvaro' },
      newMes: { value: 'SEPTIEMBRE' }, newCampana: { value: 'TEMPORADA' }, newMedio: { value: 'WhatsApp' },
      newGestion: { value: '' }, editGestion: { value: 'INSCRITO' },
    },
    fills: [
      { id: 'newMes', values: ['Agosto', 'Septiembre'] },       // canonico: 'SEPTIEMBRE' → 'Septiembre'
      { id: 'newCampana', values: ['Acuario', 'Weston'] },      // fuera del catalogo → se anade al final
      { id: 'newMedio', values: [] },                            // vacio → no toca el HTML
      { id: 'newGestion', values: ['AGENDADO', 'INSCRITO'] },   // current '' → nada seleccionado
      { id: 'editGestion', values: ['Agendado'] },               // 'INSCRITO' sin canonico → al final
    ],
  },
  {
    nombre: 'datos sin valores utilizables (vacio y SN)',
    leads: [{ Mes: '', 'Campaña': '   ', Medio: 'SN', GESTION: 'SN', 'Agente ': null }, {}],
    catalogRows: { mes: [], campana: [], medio: [], gestion: [], agente: [] },
    selects: {
      filterMes: { value: '' }, filterCampana: { value: 'x' }, filterMedio: { value: '' },
      filterGestion: { value: '' }, filterAsesora: { value: '' },
    },
    fills: [],
  },
  {
    nombre: 'acentos en la clave es (fillSelectFromCatalog)',
    leads: [],
    catalogRows: { mes: [], campana: [], medio: [], gestion: [], agente: [] },
    selects: {
      filterMes: { value: '' }, filterCampana: { value: '' }, filterMedio: { value: '' },
      filterGestion: { value: '' }, filterAsesora: { value: '' },
      newAgente: { value: 'ÁLVARO' },
    },
    fills: [{ id: 'newAgente', values: ['alvaro', 'Álvaro', 'ÁLVARO'] }],
  },
];

// --- Sandbox con DOM falso ---------------------------------------------------
function crearSelect(spec) {
  const first = { value: spec.first?.value ?? '', textContent: spec.first?.textContent ?? 'Todos' };
  return {
    innerHTMLWrites: 0, options: [first], value: spec.value ?? '', firstOption: first,
    set innerHTML(v) { this.innerHTMLWrites++; this.options = []; this.value = ''; },
    get innerHTML() { return `#write:${this.innerHTMLWrites}`; },
    appendChild(opt) { this.options.push(opt); if (opt.selected || this.options.length === 1) this.value = opt.value; },
  };
}
// HEAD asigna opt.innerText; el wrapper nuevo usa textContent. Ambos son
// semantica de texto (innerText no interpreta HTML): se lee la que exista.
const labelOf = o => (o.innerText !== undefined ? o.innerText : o.textContent);

function ejecutar(fuente, sample) {
  const selects = new Map();
  const element = id => {
    if (!selects.has(id)) selects.set(id, crearSelect(sample.selects[id] || {}));
    return selects.get(id);
  };
  let created = 0;
  const c = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    document: {
      getElementById: id => (id in sample.selects ? element(id) : null),
      createElement: () => { created++; return {}; },
    },
    getVisibleBaseLeads: () => sample.leads,
    catalogRows: sample.catalogRows,
    catalogosApi, getField, catalogLabel,
  });
  vm.runInContext(fuente, c);
  c.populateFilterOptions();
  for (const fill of sample.fills || []) c.fillSelectFromCatalog(fill.id, fill.values);
  // Select inexistente: los dos wrappers de relleno salen sin crear nada.
  created = 0;
  c.populateSelect('noexiste', ['a']);
  c.fillSelectFromCatalog('noexiste', ['a']);
  assert.equal(created, 0, 'select ausente no debe llegar a createElement');
  const out = {};
  for (const id of Object.keys(sample.selects)) {
    const sel = element(id);
    out[id] = {
      writes: sel.innerHTMLWrites,
      primeraConservada: sel.options[0] === sel.firstOption,
      valor: sel.value,
      opciones: sel.options.map(o => ({ value: o.value, label: labelOf(o), selected: !!o.selected })),
    };
  }
  return out;
}

// --- Golden: arbol == HEAD en los mismos samples -----------------------------
test('golden: los wrappers del arbol reproducen las opciones de HEAD (3 samples)', () => {
  for (const sample of SAMPLES) {
    assert.deepEqual(ejecutar(treeFuente, sample), ejecutar(headFuente, sample),
      `discrepancia con HEAD en sample: ${sample.nombre}`);
  }
});

test('golden: HEAD conserva la primera option en populateSelect y no toca el HTML en fill vacio', () => {
  // El golden captura HEAD: newMedio (values vacio) no escribe innerHTML y los
  // cinco filtros conservan su primera <option>. Si HEAD cambiara, el test
  // anterior fallaria; este fija las dos invariants exigidas en el arbol.
  const out = ejecutar(treeFuente, SAMPLES[0]);
  assert.equal(out.newMedio.writes, 0, 'fillSelectFromCatalog vacio no reemplaza innerHTML');
  assert.deepEqual(out.newMedio.opciones.map(o => o.value), [''], 'las opciones preexistentes quedan intactas');
  assert.equal(out.newMedio.valor, 'WhatsApp', 'el value actual sobrevive al salto del fill');
  for (const id of ['filterMes', 'filterCampana', 'filterMedio', 'filterGestion', 'filterAsesora']) {
    assert.equal(out[id].primeraConservada, true, `${id} conserva la primera <option> en populateSelect`);
    assert.equal(out[id].opciones[0].label, 'Todos');
  }
});

// --- Piezas puras: comportamiento propio --------------------------------------
test('FILTROS_CATALOGO declara los cinco filtros con los literales exactos del monolito', () => {
  assert.deepEqual(FILTROS_CATALOGO, [
    { id: 'filterMes', kind: 'mes', campo: 'Mes' },
    { id: 'filterCampana', kind: 'campana', campo: 'Campaña' },
    { id: 'filterMedio', kind: 'medio', campo: 'Medio' },
    { id: 'filterGestion', kind: 'gestion', campo: 'GESTION' },
    { id: 'filterAsesora', kind: 'agente', campo: 'Agente ' },
  ]);
});

test('uniqueFieldValues recorta, descarta vacios y SN exactos, deduplica y conserva el sort del monolito', () => {
  const leads = [
    { Medio: 'SN', 'Agente ': ' Ana ', GESTION: 'sn' },
    { Medio: '  ', 'Agente ': 'ana', GESTION: 'INSCRITO' },
    { 'Agente ': 'Álvaro' }, { 'Agente ': 'alvaro' }, { 'Agente ': null }, null,
  ];
  assert.deepEqual(uniqueFieldValues(leads, 'Medio'), [], "'SN' exacto y vacios se descartan");
  assert.deepEqual(uniqueFieldValues(leads, 'GESTION'), ['INSCRITO', 'sn'], "'sn' en minusculas NO es 'SN'");
  // Decision registrada (golden): orden Array.from(set).sort() del monolito
  // (UTF-16: 'Ana' < 'alvaro' < 'ana' < 'Álvaro'), no sortAlphaEs. Es lo que
  // fija los empates estables de catalogOptions ('alvaro' antes que 'Álvaro').
  assert.deepEqual(uniqueFieldValues(leads, 'Agente '), ['Ana', 'alvaro', 'ana', 'Álvaro']);
  assert.notDeepEqual(uniqueFieldValues(leads, 'Agente '), sortAlphaEs(uniqueFieldValues(leads, 'Agente ')));
  assert.deepEqual(uniqueFieldValues(null, 'Mes'), []);
  assert.deepEqual(uniqueFieldValues(undefined, 'Mes'), []);
});

test('opcionesSelectData etiqueta con catalogLabel y selecciona solo por coincidencia exacta', () => {
  assert.deepEqual(opcionesSelectData(['a', 'B'], 'a'), [
    { value: 'a', label: 'A', selected: true },
    { value: 'B', label: 'B', selected: false },
  ]);
  assert.deepEqual(opcionesSelectData([], 'a'), [], 'values vacio produce array vacio');
  assert.deepEqual(opcionesSelectData(null, 'a'), []);
});

test('opcionesCatalogoData canonicaliza en es, prefiere la forma del catalogo y anade el current al final', () => {
  assert.deepEqual(opcionesCatalogoData(['Agosto', 'Septiembre'], 'SEPTIEMBRE'), [
    { value: 'Agosto', label: 'Agosto', selected: false },
    { value: 'Septiembre', label: 'Septiembre', selected: true },
  ], 'la seleccion migra a la forma canonica');
  assert.deepEqual(opcionesCatalogoData(['Acuario'], 'TEMPORADA').at(-1),
    { value: 'TEMPORADA', label: 'Temporada', selected: true }, 'sin canonico, el current va al final');
  assert.deepEqual(opcionesCatalogoData(['alvaro', 'Álvaro', 'ÁLVARO'], 'ÁLVARO').map(o => o.selected),
    [false, true, false], 'primera forma con clave es igual se lleva la seleccion');
  assert.deepEqual(opcionesCatalogoData(['a'], ''), [{ value: 'a', label: 'A', selected: false }],
    'current vacio: ninguna opcion seleccionada y nada se anade');
});

test('contrato "no tocar": el guard de values vacio vive en el wrapper (fiel a HEAD)', () => {
  // HEAD: `if (!select || !values.length) return;` dentro de fillSelectFromCatalog.
  // Se conserva ahi y la pieza pura se documenta como llamada solo con values
  // no vacio (con values vacio daria una lista enganosa, no un "no tocar").
  const fn = extractFunction('fillSelectFromCatalog', scriptOf(treeHtml), 'árbol');
  assert.match(fn, /if \(!select \|\| !values\.length\) return;/, 'el guard del wrapper se conserva literal');
});

// --- Wrappers sin reglas de negocio inline (criterio de aceptacion) -----------
test('los wrappers del monolito solo hacen DOM: sin reglas de negocio, sin innerText y sin innerHTML de contenido', () => {
  const tree = scriptOf(treeHtml);
  const fills = extractFunction('fillSelectFromCatalog', tree, 'árbol');
  const pSelect = extractFunction('populateSelect', tree, 'árbol');
  const pFilter = extractFunction('populateFilterOptions', tree, 'árbol');
  for (const fn of [fills, pSelect]) {
    assert.doesNotMatch(fn, /innerText/, 'el texto se asigna con textContent');
    for (const m of fn.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) {
      assert.equal(m[1].trim(), "''", 'innerHTML solo se usa para el reset, nunca para contenido');
    }
    assert.match(fn, /catalogosApi\./, 'las reglas viven en src/legacy/catalogos.js');
  }
  assert.doesNotMatch(pFilter, /new Set\(|'SN'|getUniqueValues/, 'la deduccion de valores ya no es inline');
  assert.match(pFilter, /catalogosApi\.FILTROS_CATALOGO/, 'los cinco filtros salen de la declaracion pura');
});

test('las piezas nuevas quedan registradas en window.catalogosApi', () => {
  const fuente = readFileSync(new URL('../../src/legacy/catalogos.js', import.meta.url), 'utf8');
  const registro = /window\.catalogosApi\s*=\s*\{([^}]*)\}/.exec(fuente)?.[1] ?? '';
  for (const nombre of ['activeCatalogValues', 'catalogOptions', 'uniqueFieldValues', 'FILTROS_CATALOGO', 'opcionesSelectData', 'opcionesCatalogoData']) {
    assert.match(registro, new RegExp(`\\b${nombre}\\b`), `${nombre} debe exponerse en window.catalogosApi`);
  }
});

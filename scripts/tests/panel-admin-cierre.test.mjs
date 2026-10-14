// Regresion (2026-10-14): el boton Cerrar de Gestion de accesos no ocultaba
// el panel. toggleAdminUsers(false) quitaba 'hidden' incondicionalmente y
// luego solo 'flex', dejando el fixed/inset-0 como bloque visible (el
// formulario "cambiaba de posicion" en vez de cerrarse).
// Este test ejecuta la funcion REAL del monolito en vm con un mock de
// classList, contrasta el fixed del arbol contra la version buggy (embebida:
// el commit del fix la sacar de HEAD y la caracterizacion no puede depender
// de eso) y fija la semantica nueva: cerrar => hidden presente y flex
// ausente, sin recargas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

// Extrae la funcion real equilibrando llaves (patrón de ficha-campos).
function extractToggle(htmlSource, label) {
  const script = [...htmlSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function toggleAdminUsers'));
  const match = /function\s+toggleAdminUsers\s*\(/.exec(script);
  assert.ok(match, `toggleAdminUsers ausente en ${label}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer toggleAdminUsers de ${label}`);
}

const treeFn = extractToggle(treeHtml, 'arbol de trabajo');

// Version buggy tal como estaba en 898f88f y anteriores, embebida a proposito:
// tras commitear el fix ya no existe en HEAD y esta caracterizacion debe
// seguir demostrando que el test detecta el fallo (no solo describirlo).
const headBuggyFn = `function toggleAdminUsers(abrir) {
      const panel = document.getElementById('panelAdminUsers');
      if (!panel) return;
      panel.classList.remove('hidden');
      if (abrir) { panel.classList.add('flex'); loadAuthorizedUsers(); loadAgentSessionsReport(); }
      else panel.classList.remove('flex');
    }`;

// Clase inicial EXACTA del markup real (linea del #panelAdminUsers).
const CLASES_BASE = 'hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm items-center justify-center p-4';

function sandbox({ panel = true } = {}) {
  const calls = { usuarios: 0, sesiones: 0 };
  const el = { className: CLASES_BASE };
  const clases = () => el.className.split(/\s+/).filter(Boolean);
  el.classList = {
    add(...names) { const s = new Set(clases()); names.forEach(n => s.add(n)); el.className = [...s].join(' '); },
    remove(...names) { const s = new Set(clases()); names.forEach(n => s.delete(n)); el.className = [...s].join(' '); },
    contains(name) { return clases().includes(name); },
  };
  const ctx = {
    document: { getElementById: id => (id === 'panelAdminUsers' && panel ? el : null) },
    loadAuthorizedUsers() { calls.usuarios += 1; },
    loadAgentSessionsReport() { calls.sesiones += 1; },
  };
  vm.createContext(ctx);
  return { ctx, el, calls, clases };
}

test('tree: abrir muestra el overlay centrado y dispara ambas cargas', () => {
  const { ctx, calls, clases } = sandbox();
  vm.runInContext(`(${treeFn})`, ctx)(true);
  const s = clases();
  assert.ok(!s.includes('hidden'), 'al abrir no debe quedar hidden');
  assert.ok(s.includes('flex'), 'al abrir debe estar en flex (centrado)');
  assert.equal(calls.usuarios, 1);
  assert.equal(calls.sesiones, 1);
});

test('tree: cerrar oculta de verdad (hidden presente, flex ausente) y no recarga', () => {
  const { ctx, calls, clases } = sandbox();
  vm.runInContext(`(${treeFn})`, ctx)(true);
  calls.usuarios = calls.sesiones = 0;
  vm.runInContext(`(${treeFn})`, ctx)(false);
  const s = clases();
  assert.ok(s.includes('hidden'), 'tras cerrar debe quedar hidden');
  assert.ok(!s.includes('flex'), 'tras cerrar no debe quedar flex');
  // el resto de clases del overlay (fixed/inset-0/…) se conservan intactas
  assert.ok(s.includes('fixed') && s.includes('inset-0'));
  assert.equal(calls.usuarios, 0, 'cerrar no vuelve a cargar usuarios');
  assert.equal(calls.sesiones, 0, 'cerrar no vuelve a cargar sesiones');
});

test('tree: reabrir tras cerrar restaura flex sin hidden (ciclo abierto-cerrado)', () => {
  const { ctx, clases } = sandbox();
  const toggle = vm.runInContext(`(${treeFn})`, ctx);
  toggle(true); toggle(false); toggle(true);
  const s = clases();
  assert.ok(s.includes('flex') && !s.includes('hidden'));
});

test('caracterizacion de la regresión: la version buggy deja el panel visible al cerrar', () => {
  const { ctx, clases } = sandbox();
  const toggle = vm.runInContext(`(${headBuggyFn})`, ctx);
  toggle(true);
  toggle(false);
  const s = clases();
  // Bug antiguo: 'hidden' se quitaba incondicionalmente y cerrar solo restaba
  // 'flex' → el fixed/inset-0 seguia visible (el bug que reporto el humano).
  assert.ok(!s.includes('hidden'), 'la version con bug NO deja hidden al cerrar');
  assert.ok(!s.includes('flex'), 'HEAD quita flex pero el panel sigue en pantalla');
  // El arbol nuevo corrige justo eso:
  const treeSandbox = sandbox();
  const toggleTree = vm.runInContext(`(${treeFn})`, treeSandbox.ctx);
  toggleTree(true); toggleTree(false);
  assert.ok(treeSandbox.clases().includes('hidden'), 'el fix si oculta el panel');
});

test('panel ausente: toggle es no-op sin lanzar (ambas variantes)', () => {
  for (const fn of [headBuggyFn, treeFn]) {
    const { ctx, calls } = sandbox({ panel: false });
    vm.runInContext(`(${fn})`, ctx)(true);
    vm.runInContext(`(${fn})`, ctx)(false);
    assert.equal(calls.usuarios, 0);
    assert.equal(calls.sesiones, 0);
  }
});

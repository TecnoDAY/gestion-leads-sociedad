// Carga de inscripciones de la lista rapida del dashboard: sin reintentos en
// bucle, sin respuestas antiguas y con la misma seleccion que se pinta.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { quickLeadsSelection } from '../../src/legacy/leads.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function loadDashboardInscripciones'));
assert.ok(script, 'script con el cargador de inscripciones presente');

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  assert.ok(match, `Funcion real ausente: ${name}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function lead(id, extra = {}) {
  return { id, Nombre: `Lead ${id}`, GESTION: 'INSCRITO', ...extra };
}

/**
 * Contexto con el cargador real y un cliente Supabase controlado.
 * @param {{datos?: Array<object>, error?: object|null, repintar?: boolean}} opciones
 */
function crearContexto({ datos = [], error = null, repintar = true, manual = false } = {}) {
  const consultas = [];
  const pendientes = [];
  const c = {
    dashboardPriority: 'inscrito',
    sessionGeneration: 0,
    currentUser: { id: 'u1' },
    dashboardInscripciones: new Map(),
    dashboardInscripcionesClave: '',
    dashboardInscripcionesEstado: 'idle',
    dashboardInscripcionesGeneration: 0,
    quickLeadsSelection,
    getLeadOrigin: l => l.__origin || 'actual',
    renderQuickLeads() {
      c.renders += 1;
      // El render real vuelve a pedir la carga: el guard evita el bucle.
      if (repintar) c.loadDashboardInscripciones(c.leads);
    },
    renders: 0,
    leads: [],
    supabaseClient: {
      from(tabla) {
        const q = {
          select() { return q; },
          in(_columna, ids) { consultas.push({ tabla, ids: [...ids] }); pendientes.push(deferred()); return q; },
          eq() {
            const actual = pendientes[pendientes.length - 1];
            if (!manual) actual.resolve({ data: datos, error });
            return actual.promise;
          },
        };
        return q;
      },
    },
    console: { warn() {}, error() {} },
  };
  vm.createContext(c);
  vm.runInContext(
    extractFunction('resetDashboardInscripciones') + '\n' + extractFunction('loadDashboardInscripciones'),
    c,
  );
  c.consultas = consultas;
  c.pendiente = (indice = 0) => pendientes[indice];
  return c;
}

test('consulta solo a las personas visibles y con la misma seleccion que el render', async () => {
  const c = crearContexto();
  c.leads = [
    lead(10), lead(9), lead(8), lead(7), lead(6), lead(5), lead(4), lead(3),
    lead(2, { __origin: 'historico' }), lead(1),
  ];
  await c.loadDashboardInscripciones(c.leads);
  assert.equal(c.consultas.length, 1);
  // El render limita a ocho por id descendente: 10..3, y el historico se excluye.
  assert.deepEqual(c.consultas[0].ids, [10, 9, 8, 7, 6, 5, 4, 3]);
  assert.equal(c.consultas[0].tabla, 'lead_program_enrollments');
});

test('un error no dispara consultas en bucle y deja el aviso de reintento', async () => {
  const c = crearContexto({ error: { message: 'sin permiso' } });
  c.leads = [lead(10), lead(9)];
  await c.loadDashboardInscripciones(c.leads);
  assert.equal(c.dashboardInscripcionesEstado, 'error');
  assert.equal(c.consultas.length, 1);
  // El repintado vuelve a pedir la carga, pero no se consulta otra vez.
  c.renderQuickLeads();
  c.renderQuickLeads();
  assert.equal(c.consultas.length, 1);
  assert.equal(c.dashboardInscripcionesEstado, 'error');
});

test('el reintento manual vuelve a consultar el mismo conjunto', async () => {
  const c = crearContexto({ error: { message: 'sin permiso' } });
  c.leads = [lead(10), lead(9)];
  await c.loadDashboardInscripciones(c.leads);
  c.resetDashboardInscripciones();
  assert.equal(c.dashboardInscripcionesEstado, 'idle');
  await c.loadDashboardInscripciones(c.leads);
  assert.equal(c.consultas.length, 2);
  assert.deepEqual(c.consultas[1].ids, [10, 9]);
});

test('cambiar de filtro durante la carga descarta la respuesta antigua', async () => {
  const c = crearContexto({ repintar: false, manual: true });
  c.leads = [lead(10), lead(9)];
  const primera = c.loadDashboardInscripciones(c.leads);
  // Cambia el filtro: entra otra consulta con otras personas.
  c.leads = [lead(50), lead(40)];
  const segunda = c.loadDashboardInscripciones(c.leads);
  assert.equal(c.consultas.length, 2);
  c.pendiente(0).resolve({ data: [{ lead_id: 10, programa: 'TEATRO_MUSICAL', nivel: 'MT Teens' }], error: null });
  await primera;
  // La respuesta vieja no se publica.
  assert.equal(c.dashboardInscripciones.size, 0);
  assert.equal(c.dashboardInscripcionesEstado, 'cargando');
  c.pendiente(1).resolve({ data: [{ lead_id: 50, programa: 'ACTUACION', nivel: 'Acting Teens' }], error: null });
  await segunda;
  assert.equal(c.dashboardInscripcionesEstado, 'listo');
  assert.deepEqual([...c.dashboardInscripciones.keys()], ['50']);
});

test('cambiar de sesion durante la carga descarta la respuesta', async () => {
  const c = crearContexto({ repintar: false, manual: true });
  c.leads = [lead(10)];
  const carga = c.loadDashboardInscripciones(c.leads);
  c.sessionGeneration += 1;
  c.pendiente().resolve({ data: [{ lead_id: 10, programa: 'TEATRO_MUSICAL', nivel: 'MT Teens' }], error: null });
  await carga;
  assert.equal(c.dashboardInscripciones.size, 0);
  assert.notEqual(c.dashboardInscripcionesEstado, 'listo');
});

test('tras guardar se vuelve a consultar el conjunto', async () => {
  const c = crearContexto({ repintar: false, manual: true });
  c.leads = [lead(10)];
  const carga = c.loadDashboardInscripciones(c.leads);
  c.pendiente(0).resolve({ data: [{ lead_id: 10, programa: 'TEATRO_MUSICAL', nivel: 'MT Teens' }], error: null });
  await carga;
  assert.equal(c.dashboardInscripcionesEstado, 'listo');
  assert.deepEqual([...c.dashboardInscripciones.keys()], ['10']);
  // Guardar invalida lo cacheado (resetDashboardInscripciones).
  c.resetDashboardInscripciones();
  assert.equal(c.dashboardInscripcionesEstado, 'idle');
  assert.equal(c.dashboardInscripciones.size, 0);
  const recarga = c.loadDashboardInscripciones(c.leads);
  assert.equal(c.consultas.length, 2);
  c.pendiente(1).resolve({ data: [{ lead_id: 10, programa: 'ACTUACION', nivel: 'Acting 101 (Teens)' }], error: null });
  await recarga;
  assert.equal([...c.dashboardInscripciones.get('10')].map(f => f.nivel).join('|'), 'Acting 101 (Teens)');
});

test('con el mismo conjunto cargado no se vuelve a consultar', async () => {
  const c = crearContexto({ repintar: false });
  c.leads = [lead(10), lead(9)];
  const carga = c.loadDashboardInscripciones(c.leads);
  c.pendiente().resolve({ data: [], error: null });
  await carga;
  await c.loadDashboardInscripciones(c.leads);
  assert.equal(c.consultas.length, 1);
});

test('guardar una inscripcion invalida las etiquetas de la lista', async () => {
  const c = crearContexto({ repintar: false });
  c.leads = [lead(10)];
  const carga = c.loadDashboardInscripciones(c.leads);
  c.pendiente().resolve({ data: [{ lead_id: 10, programa: 'TEATRO_MUSICAL', nivel: 'MT Teens' }], error: null });
  await carga;
  assert.equal(c.dashboardInscripcionesEstado, 'listo');
  c.supabaseClient = {
    rpc: async () => ({ error: null }),
    from: () => { throw new Error('no debe consultar'); },
  };
  c.showToast = () => {};
  vm.runInContext(extractFunction('guardarInscripciones'), c);
  const ok = await c.guardarInscripciones(10, { TEATRO_MUSICAL: { nivel: 'MT Teens' } });
  assert.equal(ok, true);
  assert.equal(c.dashboardInscripcionesEstado, 'idle');
  assert.equal(c.dashboardInscripcionesClave, '');
  assert.equal(c.dashboardInscripciones.size, 0);
});

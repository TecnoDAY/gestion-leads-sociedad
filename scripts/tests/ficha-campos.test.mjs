// Fase 30: caracterización del HTML completo de la ficha (ver lead).
// GOLDEN capturado del render de openViewLeadModal en HEAD (git show),
// corrido en una sandbox vm minimal; el resultado nuevo (fichaLeadHtml en
// src/legacy/leads.js via el wrapper reducido del monolito) debe coincidir
// byte a byte con el golden en los mismos samples sintéticos.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import * as helpers from '../../src/legacy/helpers.js';
import * as leads from '../../src/legacy/leads.js';

const { getField, escapeHtml, escapeAttr } = helpers;
const { badgeGestionHtml, bannerPrimeraEntradaHtml, bloqueRepetidosHtml, fichaLeadHtml, formatPhone,
  primeraEntradaLead, isAgendadoGestion, ordenRepetidos, relacionadosPorTelefono, repetidosYBannerHtml } = leads;

const headHtml = execSync('git show HEAD:index.html', {
  cwd: new URL('../..', import.meta.url).pathname,
  encoding: 'utf8',
});
const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

// Extrae la función real (equilibrando llaves) del script del monolito.
function extractOpenViewLeadModal(htmlSource, label) {
  const script = [...htmlSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('function openViewLeadModal'));
  const match = /(async\s+)?function\s+openViewLeadModal\s*\(/.exec(script);
  assert.ok(match, `openViewLeadModal ausente en ${label}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer openViewLeadModal de ${label}`);
}

const headFn = extractOpenViewLeadModal(headHtml, 'HEAD');
const treeFn = extractOpenViewLeadModal(treeHtml, ' árbol de trabajo');

// Sandbox minimal: DOM falso que captura innerHTML de cada elemento y estado
// global sintético. Ambas variantes (HEAD y árbol) corren en la MISMA sandbox
// para que la igualdad solo dependa de la plantilla, no del entorno.
function sandbox(sample) {
  const elements = new Map();
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const el = { innerHTML: '', textContent: '', className: '', reset() {},
      querySelector: () => null, querySelectorAll: () => [] };
    el.classList = {
      contains: name => el.className.split(/\s+/).includes(name),
      toggle(name, force) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean));
        const add = force ?? !classes.has(name);
        if (add) classes.add(name); else classes.delete(name);
        el.className = [...classes].join(' ');
      },
      add(...names) { names.forEach(n => this.toggle(n, true)); },
      remove(...names) { names.forEach(n => this.toggle(n, false)); },
    };
    elements.set(id, el);
    return el;
  };
  const c = vm.createContext({
    console: { warn() {}, log() {}, error() {} },
    document: { getElementById: element },
    window: {},
    // Estado global sintetico del monolito
    viewLeadGeneration: 0, sessionGeneration: 0,
    currentViewOrigin: 'actual', currentViewId: null,
    allLeads: sample.leads, completeCurrentLeads: sample.leads, completeCurrentLoaded: true,
    allHistorico: sample.historico, historicoLoaded: sample.alcanceCompleto,
    leadNotesCache: [], leadGestionesCache: [], leadAppointmentsCache: [], editingNoteId: null,
    leadAppointmentAdvisors: [], pendingAppointmentMutations: new Map(), leadAppointmentCreateBlocked: true,
    isAdmin: false, currentUser: null, currentAccess: null,
    // Fuentes puras del legacy (en navegador entran por window.*, aqui directo)
    getField, escapeHtml, escapeAttr, formatPhone, isAgendadoGestion, badgeGestionHtml,
    renderGestionBadge: badgeGestionHtml,
    relacionadosPorTelefono, primeraEntradaLead, ordenRepetidos, bloqueRepetidosHtml, bannerPrimeraEntradaHtml,
    fichaLeadHtml, repetidosYBannerHtml,
    // Busqueda por origen+id exactos (T4): stub determinista para ambos renders
    findLeadByOrigin(origin, id) {
      const fuente = origin === 'historico' ? sample.historico : sample.leads;
      return fuente.find(l => String(l.id) === String(id)) || null;
    },
  });
  vm.runInContext(sample.sourceFn, c);
  return { c, element };
}

// Ejecuta el render y devuelve el innerHTML final del contenedor de la ficha.
// Tras la escritura el monolito lanza contra dependencias no simuladas (carga
// de notas por red): se captura el HTML ya escrito y se ignora el resto.
function renderFicha(sourceFn, sample, leadId, origin) {
  const { c, element } = sandbox({ ...sample, sourceFn });
  try { c.openViewLeadModal(leadId, origin); } catch { /* reportería posterior al innerHTML */ }
  return element('viewLeadContent').innerHTML;
}

const BASE = {
  id: 101, Nombre: 'Sintético <t>', Telefono: '(305) 555-1234', Fecha: '10/01/2026', Mes: 'Enero',
  'Campaña': 'Verano & Río', 'Medio': 'Meta Ads', 'Agente ': 'Loli', 'ULTIMO AGENTE ': 'Ana',
  'Fecha Última Gestión ': '12/01/2026', 'GESTION': 'INSCRITO', 'OBSERVACIONES ': 'Contactó   por WhatsApp',
};

const HIST_SHELL = { id: 900, Nombre: 'Histórico Sintético', Telefono: '3055551234', Fecha: '05/01/2025', Mes: 'Enero 2025', 'Campaña': 'Verano 2025', 'Medio': 'Meta', 'Agente ': 'Ana', 'GESTION': 'AGENDADO', 'OBSERVACIONES ': 'Antiguo', __origin: 'historico' };

const LEADS_VACIOS = [BASE];
const SOURCES = [
  { leadId: 101, origin: 'actual', alcanceCompleto: true, leads: [BASE], historico: [], titulo: 'actual completo sin repetidos' },
  { leadId: 101, origin: 'actual', alcanceCompleto: false, leads: [BASE], historico: [], titulo: 'actual con aviso de alcance' },
  { leadId: 900, origin: 'historico', alcanceCompleto: true, leads: [BASE], historico: [HIST_SHELL], titulo: 'historico solo lectura' },
  {
    // repetidos: banner de primera entrada (histórico más viejo) y bloque amber
    leadId: 101, origin: 'actual', alcanceCompleto: false,
    leads: [BASE, { id: 88, Telefono: '305 555 1234', Fecha: '09/01/2026', __origin: 'actual' }],
    historico: [HIST_SHELL],
    titulo: 'repetidos + banner primera entrada',
  },
  {
    // bordes: sin teléfono, sin observaciones, gestión agendada (formulario activo)
    leadId: 77, origin: 'actual', alcanceCompleto: true,
    leads: [{ id: 77, Nombre: 'Vacio S/N', Telefono: '', GESTION: 'AGENDADO', __origin: 'actual' }],
    historico: [],
    titulo: 'bordes S/N y agendado',
  },
];

function findLead(sample, leadId, origin) {
  const fuente = origin === 'historico' ? sample.historico : sample.leads;
  return fuente.find(l => String(l.id) === String(leadId));
}

for (const s of SOURCES) {
  test(`fichaLeadHtml coincide byte a byte con el render de HEAD: ${s.titulo}`, () => {
    const golden = renderFicha(headFn, s, s.leadId, s.origin);
    const nuevo = renderFicha(treeFn, s, s.leadId, s.origin);
    assert.ok(golden.includes('lead-detail-hero'), 'golden capturado con hero');
    assert.ok(golden.includes(escapeHtml(getField(findLead(s, s.leadId, s.origin), 'Nombre'))));
    assert.equal(nuevo, golden);
  });
}

// Composición explícita: los fragmentos ya nacidos en fases 26-29 llegan por
// ctx y salen incrustados sin volver a resolverse dentro de la plantilla.
test('fichaLeadHtml incrusta primera entrada y repetidos tal cual llegan por ctx', () => {
  const html = fichaLeadHtml(BASE, { finalOrigin: 'actual', alcanceCompleto: false, firstEntryHtml: '<banner-ctx>', repetidosHtml: '<repetidos-ctx>' });
  assert.ok(html.includes('</div><banner-ctx>'), 'banner incrustado tras el hero');
  assert.ok(html.includes('base completa.</p><repetidos-ctx>'), 'repetidos incrustados tras el aviso de alcance');
  // sin WhatsApp cuando el telefono no tiene dígitos y observaciones con fallback
  const sN = fichaLeadHtml({ ...BASE, Telefono: '', 'OBSERVACIONES ': '' }, { finalOrigin: 'actual', alcanceCompleto: true, firstEntryHtml: '', repetidosHtml: '' });
  assert.ok(sN.includes('<span class="lead-detail-value font-mono">S/N</span>'));
  assert.ok(sN.includes('Sin observaciones registradas.'));
  assert.ok(!sN.includes('message-circle'));
});

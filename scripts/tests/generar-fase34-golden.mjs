#!/usr/bin/env node
// Genera scripts/tests/fixtures/fase34-golden.json (fase 34, golden ANCLADO).
//
// Ejecuta handleCreateLead/handleUpdateLead/formatSaveError del commit FIJO
// 609e1df (el ultimo que los tenia inline en index.html) dentro de vm con un
// DOM falso y un spy de supabaseClient.rpc que registra los argumentos
// p_lead/p_fields, y serializa los payloads resultantes. La leccion de la
// fase 33: el test NO compara contra `git show HEAD` en runtime (ese golden
// se rompe al commitear); compara contra este fixture, regenerable aqui.
//
// El mock de citas es funcional pero acotado: appointmentInputISO/
// appointmentLocal/validAppointmentId son los reales (citas.js), mientras
// close*/toasts/state son spies. El fixture SOLO caracteriza la construccion
// del payload y los mensajes de error (lo que se extrae a leads.js), no el
// flujo de citas (fuera de alcance: envuelve argumentos RPC ya cubiertos por
// t5-frontend-edge). Si se regenera, la salida debe ser identica (sin
// timestamps): dif de cero = golden estable.
//
// Uso: node scripts/tests/generar-fase34-golden.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { formatPhone, isAgendadoGestion } from '../../src/legacy/leads.js';
import { appointmentInputISO, appointmentLocal, validAppointmentId } from '../../src/legacy/citas.js';

const COMMIT = '609e1df';
const OUT = fileURLToPath(new URL('fixtures/fase34-golden.json', import.meta.url));
const HOY_MIAMI = '2026-10-05'; // miamiToday stubbed; unico reloj del fixture

const html = execFileSync('git', ['show', `${COMMIT}:index.html`], { encoding: 'utf8' });
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function handleCreateLead'));
assert.ok(script, `script inline con handleCreateLead ausente en ${COMMIT}`);

// Extraccion por balanceo de llaves via vm.Script (patron de fases previas).
function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  assert.ok(match, `${name} ausente en ${COMMIT}:index.html`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const HANDLERS = ['handleCreateLead', 'handleUpdateLead', 'editLeadNeedsAppointment',
  'editLeadStaysAgendado', 'editSessionValid', 'editAppointmentSubmitBlocked',
  'updateEditSubmitState', 'appointmentDetailsFrom', 'confirmAppointmentCreation',
  'appointmentCampusFrom'];
const fuenteHandlers = HANDLERS.map(extractFunction).join('\n');
const fuenteFormatSaveError = extractFunction('formatSaveError');

// --- Samples de alta (p_lead) --------------------------------------------------
// inputs: id -> value del DOM mock; acceso: campos de currentAccess (nombre
// ausente => undefined, como en HEAD); cita: { campus, advisor } habilita el
// flujo agendado hasta el RPC sin caracterizar los argumentos de cita.
const ALTA = [
  { nombre: 'alta-admin-completa', isAdmin: true, acceso: { nombre: 'Admin Root' }, fechaSel: '2026-10-01',
    inputs: { newNombre: ' Ana María ', newTelefono: '(305) 123-4567', newMes: 'SEPTIEMBRE', newCampana: 'VERANO',
      newMedio: 'Facebook', newGestion: 'Información', newUltimaGestion: 'Llamada Data Dura', newAgente: '  ',
      newCiudad: '  Miami  ', newObservaciones: 'Hola' } },
  { nombre: 'alta-admin-vacios', isAdmin: true, acceso: { nombre: 'Admin Root' }, fechaSel: '', inputs: {} },
  { nombre: 'alta-asesora-normal', isAdmin: false, acceso: { nombre: 'Loli' }, fechaSel: '',
    inputs: { newNombre: 'Pedro', newTelefono: '5551234', newGestion: '', newAgente: 'Ignorado', newUltimaGestion: 'WhatsApp' } },
  { nombre: 'alta-asesora-sin-nombre-cita', isAdmin: false, acceso: { nombre: 'Loli' }, fechaSel: '2026-09-15',
    cita: { campus: 'DORAL' },
    inputs: { newNombre: '   ', newGestion: 'AGENDADO', newAppointmentDate: '2026-10-06T18:00' } },
  { nombre: 'alta-admin-agente-default', isAdmin: true, acceso: {}, fechaSel: '2026-10-05',
    inputs: { newNombre: 'A', newAgente: '', newUltimaGestion: '', newObservaciones: '   ' } },
  { nombre: 'alta-asesora-acceso-indefinido', isAdmin: false, acceso: {}, fechaSel: '2026-10-05',
    inputs: { newNombre: 'Zoe' } },
  { nombre: 'alta-asesora-acceso-null', isAdmin: false, acceso: { nombre: null }, fechaSel: '2026-10-05',
    inputs: { newNombre: 'Nul' } },
  { nombre: 'alta-admin-cita-agendada', isAdmin: true, acceso: { nombre: 'Admin Root' }, fechaSel: '',
    cita: { campus: 'WESTON', advisor: 'adv-1' },
    inputs: { newNombre: 'Con Cita', newGestion: 'Agendado', newAppointmentDate: '2026-10-06T18:00',
      newAppointmentAdvisor: 'adv-1' } },
  { nombre: 'alta-admin-fecha-enero', isAdmin: true, acceso: { nombre: 'Admin Root' }, fechaSel: '2026-01-31',
    inputs: { newNombre: 'Ene' } },
];

// --- Samples de edicion (p_fields / p_lead de update_lead_full) ---------------
// editTelefonoOriginal: dataset.original del input (ausente => sin dataset).
const EDICION = [
  { nombre: 'edicion-asesora-tel-igual', isAdmin: false, acceso: { nombre: 'Loli' }, previousGestion: 'Información',
    inputs: { editNombre: 'Sofía', editGestion: 'Seguimiento', editFechaUltima: ' 10/10/2026 ',
      editUltimaGestion: 'Llamada', editObservaciones: 'Nota', editTelefono: '(305) 111-2222' },
    editTelefonoOriginal: '(305) 111-2222' },
  { nombre: 'edicion-asesora-tel-distinto', isAdmin: false, acceso: { nombre: 'Loli' }, previousGestion: 'Información',
    inputs: { editNombre: 'Sofía', editGestion: 'Seguimiento', editTelefono: '7865559999' },
    editTelefonoOriginal: '3051112222' },
  { nombre: 'edicion-asesora-vacios', isAdmin: false, acceso: { nombre: 'Loli' }, previousGestion: '', inputs: {} },
  { nombre: 'edicion-admin-tel-igual-full', isAdmin: true, acceso: { nombre: 'Admin Root' }, previousGestion: 'Información',
    inputs: { editNombre: 'A', editGestion: 'INSCRITO', editFechaUltima: 'x', editUltimaGestion: 'Visita',
      editObservaciones: 'y', editMes: 'SEPTIEMBRE', editFecha: '01/09/2026', editCampana: 'VERANO',
      editMedio: 'Facebook', editCiudad: 'Miami', editAgenteAdmin: '', editOdoo: 'ODOO-1',
      editFechaAtencion: '2026-09-02T10:00', editLanding: 'LDP' } },
  { nombre: 'edicion-admin-tel-distinto-cita', isAdmin: true, acceso: {}, previousGestion: 'Información',
    cita: { campus: 'WESTON', advisor: 'adv-9', advisors: [{ user_id: 'adv-9' }] },
    inputs: { editNombre: 'Cambiado', editGestion: 'AGENDADO', editTelefono: '7860000000',
      editAppointmentDate: '2026-10-06T18:00', editAppointmentAdvisor: 'adv-9' },
    editTelefonoOriginal: '' },
  { nombre: 'edicion-admin-vacios', isAdmin: true, acceso: {}, previousGestion: '', inputs: {} },
  { nombre: 'edicion-asesora-gestion-espacios', isAdmin: false, acceso: { nombre: 'Loli' }, previousGestion: '',
    inputs: { editNombre: '  ', editGestion: '   ', editUltimaGestion: '   ', editFechaUltima: ' ',
      editObservaciones: '   ', editTelefono: '', editTelefonoOriginal: '' } },
];

function crearContexto(sample) {
  const elements = new Map();
  const toasts = [];
  const rpcCalls = [];
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', innerText: '', innerHTML: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        reset() {}, querySelector: () => null, querySelectorAll: () => [],
      });
    }
    return elements.get(id);
  };
  const querySelector = sel => (sample.cita && /Campus"\]:checked$/.test(sel)) ? { value: sample.cita.campus } : null;
  const ctx = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    document: { getElementById: element, querySelector, querySelectorAll: () => [] },
    window: {},
    confirm: () => true,
    showToast: (...a) => toasts.push(a),
    miamiToday: () => HOY_MIAMI,
    formatPhone, isAgendadoGestion, appointmentInputISO, appointmentLocal, validAppointmentId,
    isAdmin: sample.isAdmin,
    currentUser: { id: 'user-1' },
    currentAccess: { activo: true, updated_at: 'v1', ...sample.acceso },
    sessionGeneration: 1,
    newLeadSubmitting: false, newLeadRequestGeneration: 0, newPhoneCheckGeneration: 0, newLeadAdvisorGeneration: 0,
    editLeadSubmitting: false, editLeadRequestGeneration: 0, editLeadAdvisorGeneration: 0,
    editLeadPreviousGestion: sample.previousGestion ?? '', currentEditOrigin: 'actual',
    editExistingAppointment: null, leadAppointmentAdvisors: sample.cita?.advisors ?? [],
    isSupabaseLive: true,
    upsertLeadInState() {}, updateConnectionStatus() {}, loadLeadsData: async () => {},
    closeNewLeadModal() {}, closeEditLeadModal() {}, populateFilterOptions() {}, applyFilters() {},
    toggleNewAppointmentFields() {}, invalidateCitasCache() {},
    supabaseClient: {
      rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { id: 4590 }, error: null }; },
    },
  });
  for (const [id, value] of Object.entries(sample.inputs)) element(id).value = value;
  if (sample.fechaSel !== undefined) element('newFechaLlegada').value = sample.fechaSel;
  element('editLeadId').value = '4590';
  if (sample.editTelefonoOriginal !== undefined) element('editTelefono').dataset = { original: sample.editTelefonoOriginal };
  return { ctx, toasts, rpcCalls };
}

async function capturarAlta(sample) {
  const { ctx, toasts, rpcCalls } = crearContexto(sample);
  vm.runInContext(fuenteHandlers, ctx);
  await ctx.handleCreateLead({ preventDefault() {} });
  assert.equal(rpcCalls.length, 1, `alta ${sample.nombre}: el flujo no llego al RPC; toasts=${JSON.stringify(toasts)}`);
  const raw = rpcCalls[0].args.p_lead;
  return { nombre: sample.nombre, isAdmin: sample.isAdmin, acceso: sample.acceso, fechaSel: sample.fechaSel,
    cita: sample.cita ?? null, inputs: sample.inputs, rpcName: rpcCalls[0].name,
    payloadKeys: Object.keys(raw), payload: JSON.parse(JSON.stringify(raw)) };
}

async function capturarEdicion(sample) {
  const { ctx, toasts, rpcCalls } = crearContexto(sample);
  vm.runInContext(fuenteHandlers, ctx);
  await ctx.handleUpdateLead({ preventDefault() {} });
  assert.equal(rpcCalls.length, 1, `edicion ${sample.nombre}: el flujo no llego al RPC; toasts=${JSON.stringify(toasts)}`);
  const raw = rpcCalls[0].args.p_fields ?? rpcCalls[0].args.p_lead;
  assert.ok(raw, `edicion ${sample.nombre}: sin p_fields/p_lead en ${rpcCalls[0].name}`);
  const inputs = { ...sample.inputs };
  if (sample.editTelefonoOriginal !== undefined) inputs.editTelefonoOriginal = sample.editTelefonoOriginal;
  return { nombre: sample.nombre, isAdmin: sample.isAdmin, acceso: sample.acceso, previousGestion: sample.previousGestion ?? '',
    cita: sample.cita ?? null, inputs, rpcName: rpcCalls[0].name,
    payloadKeys: Object.keys(raw), payload: JSON.parse(JSON.stringify(raw)) };
}

// --- Matriz de errores de formatSaveError (agendado sin uso en HEAD) ----------
const ERRORES = [
  { nombre: 'PGRST202 por code', error: { code: 'PGRST202', message: '' } },
  { nombre: 'function missing por message', error: { message: 'Could not find the function public.create_lead' } },
  { nombre: 'transicion agendada requerida', error: { message: 'appointment_required_for_agendado_transition' } },
  { nombre: 'agendado_transition_required', error: { message: 'agendado_transition_required: falta cita' } },
  { nombre: 'correo invalido', error: { message: 'appointment_email_invalid' } },
  { nombre: 'edad invalida', error: { message: 'appointment_age_invalid' } },
  { nombre: 'campus invalido', error: { message: 'campus_invalid' } },
  { nombre: 'asesor inactivo', error: { message: 'advisor_not_active' } },
  { nombre: 'campana fuera de catalogo', error: { message: 'campaign_not_in_catalog' } },
  { nombre: 'fecha de llegada invalida', error: { message: 'fecha_llegada_invalida' } },
  { nombre: 'scheduled_at requerido', error: { message: 'scheduled_at_required' } },
  { nombre: 'nota larga', error: { message: 'notes_too_long' } },
  { nombre: 'message vacio', error: { message: '' } },
  { nombre: 'sin message ni code', error: {} },
  { nombre: 'error null', error: null },
  { nombre: 'desconocido', error: { message: 'connection reset by peer' } },
];

function capturarErrores() {
  const fn = vm.runInContext(`(${fuenteFormatSaveError})`, vm.createContext({}));
  return ERRORES.map(({ nombre, error }) => ({
    nombre, error, esperadoSinCita: fn(error, false), esperadoConCita: fn(error, true),
  }));
}

// --- Display de fecha: golden derivado del payload 'Fecha' de cada alta ------
const fixture = {
  meta: {
    sourceCommit: COMMIT,
    fuente: 'index.html extraido via git show (handleCreateLead/handleUpdateLead/formatSaveError)',
    hoyMiami: HOY_MIAMI,
    nota: 'golden anclado de la fase 34: regenerable con node scripts/tests/generar-fase34-golden.mjs; salida determinista (sin timestamps). payloadKeys conserva el orden literal de HEAD; un AGENTE undefined (asesora sin currentAccess.nombre) sobrevive en payloadKeys pero no en payload JSON. En HEAD `agendado` esta declarado sin uso en formatSaveError: esperadoSinCita === esperadoConCita lo caracteriza.',
  },
  alta: [], edicion: [], fechas: [], errores: [],
};
for (const s of ALTA) {
  const e = await capturarAlta(s);
  fixture.alta.push(e);
  fixture.fechas.push({ fechaSel: s.fechaSel, hoyMiami: HOY_MIAMI, esperado: e.payload['Fecha'] });
}
for (const s of EDICION) fixture.edicion.push(await capturarEdicion(s));
fixture.errores = capturarErrores();

mkdirSync(new URL('fixtures/', import.meta.url), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`golden fase 34 escrito en ${OUT}: ${fixture.alta.length} alta, ${fixture.edicion.length} edicion, ${fixture.fechas.length} fechas, ${fixture.errores.length} errores`);

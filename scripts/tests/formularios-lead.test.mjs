// Fase 34: caracterizacion de los payloads puros de alta/edicion de leads
// extraidos a src/legacy/leads.js (leadCreatePayload, leadUpdateFields,
// fechaLlegadaDisplay, formatSaveErrorLead).
// GOLDEN ANCLADO (leccion de la fase 33): el test compara contra
// fixtures/fase34-golden.json, capturado en runtime CERO veces contra git: el
// fixture se regenera con node scripts/tests/generar-fase34-golden.mjs, que si
// ejecuta el handleCreateLead/handleUpdateLead/formatSaveError del commit FIJO
// 609e1df en vm con DOM+rpc mock. Aqui se leen arbol de trabajo + fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import {
  formatPhone, isAgendadoGestion, fechaLlegadaDisplay, leadCreatePayload,
  leadUpdateFields, formatSaveErrorLead,
} from '../../src/legacy/leads.js';
import { appointmentInputISO, appointmentLocal, validAppointmentId } from '../../src/legacy/citas.js';
// Inscripciones por programa y nivel (src/legacy/inscripciones.js). El golden
// es una caracterizacion del PAYLOAD del lead: las inscripciones van en su
// propia RPC (save_lead_enrollments) y no alteran el payload del lead.
import { PROGRAMAS_INSCRIPCION, esInscritoGestion, inscripcionPayload, inscripcionDesdeFilas, programaRequiereDetalle, programasInscripcionDisponibles } from '../../src/legacy/inscripciones.js';

const fx = JSON.parse(readFileSync(new URL('fixtures/fase34-golden.json', import.meta.url), 'utf8'));
const HOY = fx.meta.hoyMiami;

// --- Reconstruccion de los argumentos del builder a partir del sample --------
const val = (inputs, id) => inputs[id] ?? '';
function valsAlta(s) {
  return {
    nombre: val(s.inputs, 'newNombre'), telefono: val(s.inputs, 'newTelefono'), mes: val(s.inputs, 'newMes'),
    fechaHoy: fechaLlegadaDisplay(s.fechaSel, HOY), campana: val(s.inputs, 'newCampana'), medio: val(s.inputs, 'newMedio'),
    gestion: val(s.inputs, 'newGestion'), ultimaGestion: val(s.inputs, 'newUltimaGestion'),
    agente: val(s.inputs, 'newAgente'), ciudad: val(s.inputs, 'newCiudad'),
    observaciones: val(s.inputs, 'newObservaciones'),
  };
}
const ctxDe = s => ({ isAdmin: s.isAdmin, nombreAcceso: s.acceso?.nombre });

// --- Builders vs fixture -------------------------------------------------------
test('golden alta: leadCreatePayload reproduce payload y orden de claves del commit 609e1df', () => {
  assert.equal(fx.meta.sourceCommit, '609e1df', 'fixture anclado al commit con handlers inline');
  for (const s of fx.alta) {
    const payload = leadCreatePayload(valsAlta(s), ctxDe(s));
    assert.deepEqual(Object.keys(payload), s.payloadKeys, `orden de claves en ${s.nombre}`);
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), s.payload, `payload en ${s.nombre}`);
    assert.equal(s.rpcName === 'create_lead' || s.rpcName === 'create_lead_with_appointment', true, `rpc de alta en ${s.nombre}`);
  }
});

test('golden edicion: leadUpdateFields reproduce payload y orden de claves del commit 609e1df', () => {
  for (const s of fx.edicion) {
    const v = {
      nombre: val(s.inputs, 'editNombre'), gestion: val(s.inputs, 'editGestion'),
      fechaUltima: val(s.inputs, 'editFechaUltima'), ultimaGestion: val(s.inputs, 'editUltimaGestion'),
      observaciones: val(s.inputs, 'editObservaciones'), telefono: val(s.inputs, 'editTelefono'),
      telOriginal: val(s.inputs, 'editTelefonoOriginal'), mes: val(s.inputs, 'editMes'), fecha: val(s.inputs, 'editFecha'),
      campana: val(s.inputs, 'editCampana'), medio: val(s.inputs, 'editMedio'), ciudad: val(s.inputs, 'editCiudad'),
      agenteAdmin: val(s.inputs, 'editAgenteAdmin'), odoo: val(s.inputs, 'editOdoo'),
      fechaAtencion: val(s.inputs, 'editFechaAtencion'), landing: val(s.inputs, 'editLanding'),
    };
    const payload = leadUpdateFields(v, ctxDe(s));
    assert.deepEqual(Object.keys(payload), s.payloadKeys, `orden de claves en ${s.nombre}`);
    assert.deepEqual(JSON.parse(JSON.stringify(payload)), s.payload, `payload en ${s.nombre}`);
  }
});

test('golden fechas: fechaLlegadaDisplay reproduce el display del monolito', () => {
  for (const f of fx.fechas) {
    assert.equal(fechaLlegadaDisplay(f.fechaSel, f.hoyMiami), f.esperado, `fechaSel=${JSON.stringify(f.fechaSel)}`);
  }
});

test('golden errores: formatSaveErrorLead reproduce la tabla (y agendado no influye)', () => {
  for (const e of fx.errores) {
    assert.equal(formatSaveErrorLead(e.error, false), e.esperadoSinCita, `sin cita: ${e.nombre}`);
    assert.equal(formatSaveErrorLead(e.error, true), e.esperadoConCita, `con cita: ${e.nombre}`);
    assert.equal(e.esperadoSinCita, e.esperadoConCita, 'HEAD no usaba el parametro agendado');
  }
});

// --- Casos borde literales (ademas del fixture) --------------------------------
test('casos borde alta: defaults exactos con espacios finales y AGENTE por rol', () => {
  const vacios = { nombre: '', telefono: '', mes: '', campana: '', medio: '', gestion: '', ultimaGestion: '', agente: '', ciudad: '', observaciones: '' };
  const asesora = leadCreatePayload({ ...vacios, fechaHoy: '01/02/2026' }, { isAdmin: false, nombreAcceso: 'Loli' });
  assert.equal(asesora['Nombre'], 'Sin Nombre');
  assert.equal(asesora['GESTION'], 'Información ', 'default con espacio final preservado');
  assert.equal(asesora['Campaña'], 'Sin definir');
  assert.equal(asesora['Medio'], 'Whatsapp');
  assert.equal(asesora['ULTIMA GESTION'], 'WhatsApp');
  assert.equal(asesora['OBSERVACIONES'], 'Nuevo lead registrado desde el panel.');
  assert.equal(asesora['AGENTE'], 'Loli', 'la asesora usa currentAccess.nombre tal cual');
  assert.equal(asesora['Telefono'], '');

  // Nombre en blanco -> 'Sin Nombre'; telefono normalizado por formatPhone.
  const blanco = leadCreatePayload({ ...vacios, nombre: '   ', telefono: ' (305) 123-4567 ', fechaHoy: '01/02/2026' }, { isAdmin: false, nombreAcceso: 'Loli' });
  assert.equal(blanco['Nombre'], 'Sin Nombre');
  assert.equal(blanco['Telefono'], formatPhone('(305) 123-4567'));

  // Admin: orden de fallback AGENTE = input | nombreAcceso | 'Agente'.
  assert.equal(leadCreatePayload({ ...vacios, fechaHoy: 'x' }, { isAdmin: true, nombreAcceso: 'Root' })['AGENTE'], 'Root');
  assert.equal(leadCreatePayload({ ...vacios, agente: '  ', fechaHoy: 'x' }, { isAdmin: true, nombreAcceso: undefined })['AGENTE'], 'Agente');
  assert.equal(leadCreatePayload({ ...vacios, agente: ' Elegida ', fechaHoy: 'x' }, { isAdmin: true, nombreAcceso: 'Root' })['AGENTE'], 'Elegida');
  // Asesora con acceso.nombre undefined/null: AGENTE viaja undefined/null (HEAD igual).
  assert.equal('AGENTE' in leadCreatePayload({ ...vacios, fechaHoy: 'x' }, { isAdmin: false, nombreAcceso: undefined }), true);
  assert.equal(leadCreatePayload({ ...vacios, fechaHoy: 'x' }, { isAdmin: false, nombreAcceso: undefined })['AGENTE'], undefined);

  // Mes/campana/medio/gestion viajan sin trim ni normalizacion (passthrough).
  const pasa = leadCreatePayload({ ...vacios, mes: 'SEPTIEMBRE', gestion: '   ', campana: ' VER ', medio: '  ', ultimaGestion: ' Llamada WhatsApp ', fechaHoy: 'x' }, { isAdmin: false, nombreAcceso: 'L' });
  assert.equal(pasa['Mes'], 'SEPTIEMBRE');
  assert.equal(pasa['GESTION'], '   ', 'gestion en blanco NO cae en default ni se trimea (igual que HEAD)');
  assert.equal(pasa['Campaña'], ' VER ');
  assert.equal(pasa['Medio'], '  ');
  assert.equal(pasa['ULTIMA GESTION'], ' Llamada WhatsApp ');
});

test('casos borde edicion: regla del telefono y bloque admin', () => {
  const base = { nombre: 'A', gestion: 'Seguimiento', fechaUltima: '', ultimaGestion: '', observaciones: '', telefono: '3051234567', telOriginal: '3051234567', mes: '', fecha: '', campana: '', medio: '', ciudad: '', agenteAdmin: '', odoo: '', fechaAtencion: '', landing: '' };
  const sinCambio = leadUpdateFields(base, { isAdmin: false, nombreAcceso: 'Loli' });
  assert.equal('Telefono' in sinCambio, false, 'asesora sin cambio de telefono no lo envia');
  const conCambio = leadUpdateFields({ ...base, telefono: '7860000000' }, { isAdmin: false, nombreAcceso: 'Loli' });
  assert.equal(conCambio['Telefono'], '1 (786) 000-0000', 'formateado por formatPhone interno');
  const formatosIguales = leadUpdateFields({ ...base, telefono: '(305) 123-4567' }, { isAdmin: false, nombreAcceso: 'Loli' });
  assert.equal('Telefono' in formatosIguales, false, 'mismo numero con otro formato no viaja');
  const admin = leadUpdateFields({ ...base, telefono: '' }, { isAdmin: true, nombreAcceso: 'Root' });
  assert.equal(admin['Telefono'], '', 'admin siempre incluye Telefono, incluso vacio');
  assert.equal(admin['AGENTE'], 'Root', 'admin con agenteAdmin vacio usa nombreAcceso');
  const adminVacio = leadUpdateFields(base, { isAdmin: true, nombreAcceso: undefined });
  assert.equal(adminVacio['AGENTE'], '', 'admin sin acceso ni agente: cadena vacia (HEAD igual)');
  const orden = Object.keys(leadUpdateFields({ ...base, telefono: '9998887777' }, { isAdmin: true, nombreAcceso: 'R' }));
  assert.deepEqual(orden, ['Nombre', 'GESTION', 'Fecha Última Gestión', 'ULTIMA GESTION', 'OBSERVACIONES', 'Telefono', 'Mes', 'Fecha', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Odoo', 'Fecha de Atencion', 'LANDING'],
    'Telefono de base no se reordena al ser sobrescrito por Object.assign');
  const defaults = leadUpdateFields({ ...base, nombre: '  ', gestion: '', ultimaGestion: '', observaciones: '  ' }, { isAdmin: false, nombreAcceso: 'L' });
  assert.equal(defaults['Nombre'], 'Sin Nombre');
  assert.equal(defaults['GESTION'], 'Información ', 'espacio final preservado');
  assert.equal(defaults['ULTIMA GESTION'], 'Llamada', 'default de edicion es Llamada (no WhatsApp)');
  assert.equal(defaults['OBSERVACIONES'], '');
});

test('casos borde formatSaveError: fila a fila de la tabla', () => {
  assert.equal(formatSaveErrorLead({ code: 'PGRST202', message: '' }, false), 'La aplicación necesita actualizarse. Recarga la página con Ctrl + F5 e inténtalo de nuevo');
  assert.equal(formatSaveErrorLead({ message: 'Could not find the function public.create_lead' }, false), 'La aplicación necesita actualizarse. Recarga la página con Ctrl + F5 e inténtalo de nuevo');
  assert.equal(formatSaveErrorLead({ message: 'campus_invalid' }, true), 'Sede no válida');
  assert.equal(formatSaveErrorLead({ message: 'notes_too_long' }, true), 'Nota demasiado larga');
  assert.equal(formatSaveErrorLead({ message: 'fecha_llegada_invalida' }, false), 'Fecha de llegada no válida');
  assert.equal(formatSaveErrorLead({ message: '' }, false), 'No se pudo conectar para guardar. Revisa tu conexión e inténtalo nuevamente');
  assert.equal(formatSaveErrorLead(null, false), 'No se pudo conectar para guardar. Revisa tu conexión e inténtalo nuevamente');
  assert.equal(formatSaveErrorLead({ message: 'boom raro' }, false), 'No se pudo guardar. Revisa los datos e inténtalo nuevamente');
});

// --- Replay del wrapper del arbol contra el fixture ----------------------------
// Ejecuta los handleCreateLead/handleUpdateLead FORMATEADOS EN EL ARBOL (que
// ahora delegan) con el mismo DOM/rpc mock del generador, y exige el mismo
// payload que el fixture: prueba que la lectura de inputs del wrapper equivale
// a lo que HEAD construia inline.
const treeHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const treeScript = [...treeHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).find(s => s.includes('async function handleCreateLead'));
function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(treeScript);
  assert.ok(match, `${name} ausente en index.html del arbol`);
  for (let end = treeScript.indexOf('}', match.index); end !== -1; end = treeScript.indexOf('}', end + 1)) {
    const candidate = treeScript.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}
const fuenteWrapper = ['handleCreateLead', 'handleUpdateLead', 'editLeadNeedsAppointment', 'editLeadStaysAgendado',
  'editSessionValid', 'editAppointmentSubmitBlocked', 'updateEditSubmitState', 'appointmentDetailsFrom',
  'confirmAppointmentCreation', 'appointmentCampusFrom', 'formatSaveError',
  'inscripcionErrorTexto', 'inscripcionCambioNecesario', 'resetDashboardInscripciones', 'guardarInscripciones',
  'inscripcionFaltanNiveles', 'updateInscripcionAviso', 'guardarProgramaInscripcion', 'programaInscripcionValue'].map(extractFunction).join('\n');

function sandbox(sample) {
  const elements = new Map(), toasts = [], rpcCalls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerText: '', innerHTML: '', disabled: false,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      reset() {}, querySelector: () => null, querySelectorAll: () => [],
    });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    console: { warn() {}, error() {}, log() {} },
    document: {
      getElementById: element,
      querySelector: sel => (sample.cita && /Campus"\]:checked$/.test(sel)) ? { value: sample.cita.campus } : null,
      querySelectorAll: () => [],
    },
    window: {}, confirm: () => true, showToast: (...a) => toasts.push(a),
    miamiToday: () => HOY,
    // los builders/puros del modulo, como window.* del navegador
    fechaLlegadaDisplay, leadCreatePayload, leadUpdateFields, formatSaveErrorLead,
    isAgendadoGestion, formatPhone, appointmentInputISO, appointmentLocal, validAppointmentId,
    // Inscripciones: la seleccion del formulario la aporta el test; el
    // golden sigue verificando el payload del lead.
    PROGRAMAS_INSCRIPCION, esInscritoGestion, inscripcionPayload, inscripcionDesdeFilas,
    programaRequiereDetalle, programasInscripcionDisponibles,
    inscripcionSeleccion: () => sample.inscripcion || [],
    inscripcionErroresVisibles: { new: false, edit: false },
    editInscripcionFilas: sample.inscripcionFilas || [],
    editProgramaInscripcionPrevio: sample.programaPrevio ?? '',
    isAdmin: sample.isAdmin, currentUser: { id: 'user-1' },
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
    supabaseClient: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: { id: 4590 }, error: null }; } },
  });
  for (const [id, value] of Object.entries(sample.inputs)) {
    if (id === 'editTelefonoOriginal') { element('editTelefono').dataset = { original: value }; continue; }
    element(id).value = value;
  }
  if (sample.fechaSel !== undefined) element('newFechaLlegada').value = sample.fechaSel;
  element('editLeadId').value = '4590';
  vm.runInContext(fuenteWrapper, ctx);
  return { ctx, toasts, rpcCalls };
}

test('wrapper del arbol: handleCreateLead/handleUpdateLead entregan el payload del fixture', async () => {
  for (const s of fx.alta) {
    const { ctx, toasts, rpcCalls } = sandbox(s);
    await ctx.handleCreateLead({ preventDefault() {} });
    assert.equal(rpcCalls.length, 1, `alta ${s.nombre}: no hubo RPC; toasts=${JSON.stringify(toasts)}`);
    assert.equal(rpcCalls[0].name, s.rpcName, `alta ${s.nombre}: rpc`);
    const raw = rpcCalls[0].args.p_lead;
    assert.deepEqual(Object.keys(raw), s.payloadKeys, `alta ${s.nombre}: orden de claves`);
    assert.deepEqual(JSON.parse(JSON.stringify(raw)), s.payload, `alta ${s.nombre}: payload`);
    // el wrapper conserva la firma historica del toast de exito
    assert.equal(toasts.at(-1)?.[1], 'success', `alta ${s.nombre}: toast`);
  }
  for (const s of fx.edicion) {
    // Un lead que pasa a INSCRITO exige programa y nivel (nueva regla): el
    // test aporta la seleccion; el golden sigue fijando el payload del lead.
    const inscripcion = esInscritoGestion(s.inputs.editGestion || '')
      ? [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15' }]
      : [];
    const { ctx, toasts, rpcCalls } = sandbox({ ...s, inscripcion });
    await ctx.handleUpdateLead({ preventDefault() {} });
    const llamadasLead = rpcCalls.filter(c => c.name !== 'save_lead_enrollments');
    assert.equal(llamadasLead.length, 1, `edicion ${s.nombre}: no hubo RPC; toasts=${JSON.stringify(toasts)}`);
    assert.equal(llamadasLead[0].name, s.rpcName, `edicion ${s.nombre}: rpc`);
    const raw = llamadasLead[0].args.p_fields ?? llamadasLead[0].args.p_lead;
    assert.deepEqual(Object.keys(raw), s.payloadKeys, `edicion ${s.nombre}: orden de claves`);
    assert.deepEqual(JSON.parse(JSON.stringify(raw)), s.payload, `edicion ${s.nombre}: payload`);
    assert.equal(toasts.at(-1)?.[1], 'success', `edicion ${s.nombre}: toast`);
    if (inscripcion.length) {
      const llamadaInscripcion = rpcCalls.find(c => c.name === 'save_lead_enrollments');
      assert.ok(llamadaInscripcion, `edicion ${s.nombre}: la inscripcion se guarda en su RPC`);
      assert.deepEqual(llamadaInscripcion.args.p_enrollments, inscripcion, `edicion ${s.nombre}: payload de inscripcion`);
    }
  }
});

test('wrapper del arbol: delega en el modulo y conserva validaciones/flujo', () => {
  const create = extractFunction('handleCreateLead');
  const update = extractFunction('handleUpdateLead');
  const format = extractFunction('formatSaveError');
  assert.match(create, /leadCreatePayload\(\{/, 'handleCreateLead delega la construccion');
  assert.match(create, /fechaLlegadaDisplay\(fechaSel, hoyMiami\)/);
  assert.match(create, /nombreAcceso: currentAccess\?\.nombre/, 'el wrapper pasa el acceso como ctx');
  assert.doesNotMatch(create, /newLeadData = \{/, 'sin construccion inline del payload');
  assert.doesNotMatch(create, /"Nombre": document/, 'sin literales de payload inline');
  assert.match(create, /La fecha de llegada no puede ser futura/, 'la validacion de fecha futura sigue en el wrapper');
  assert.match(create, /requestGeneration === newLeadRequestGeneration|newLeadRequestGeneration\+\+|\+\+newLeadRequestGeneration/);
  assert.match(create, /p_lead: newLeadData/, 'el RPC recibe el payload del builder');
  assert.match(update, /leadUpdateFields\(\{/, 'handleUpdateLead delega');
  assert.doesNotMatch(update, /updatedFields = \{/, 'sin construccion inline');
  assert.doesNotMatch(update, /Object\.assign\(updatedFields/, 'el bloque admin no se duplica');
  assert.match(update, /p_fields: updatedFields/, 'el RPC recibe los campos del builder');
  assert.match(update, /update_lead_full|update_lead_followup/, 'la eleccion de RPC sigue en el wrapper');
  assert.match(format, /return formatSaveErrorLead\(error, agendado\);/, 'formatSaveError es solo un delegador');
  assert.doesNotMatch(format, /PGRST202/, 'la tabla de errores ya no vive en el monolito');
  assert.match(create, /appointmentInputISO|confirmAppointmentCreation/, 'el flujo de citas sigue intacto');
  assert.doesNotMatch(update, /loadEditExistingAppointment/, 'no se toco la carga de cita existente');
});

// La inscripcion es OPCIONAL: el estado Inscrito no exige programa y nivel.
test('inscripcion opcional: un lead inscrito se guarda sin programa', async () => {
  const base = fx.alta.find(s => s.nombre === 'alta-admin-vacios');
  const { ctx, toasts, rpcCalls } = sandbox({ ...base, inputs: { ...base.inputs, newGestion: 'Inscrito' }, inscripcion: [] });
  await ctx.handleCreateLead({ preventDefault() {} });
  assert.equal(rpcCalls.length, 1, 'solo el alta: sin llamada de inscripciones');
  assert.equal(rpcCalls[0].name, 'create_lead');
  assert.equal(toasts.at(-1)?.[1], 'success', 'el alta no se bloquea');
});

test('inscripcion opcional: pasar a inscrito no bloquea el guardado de la asesora', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const { ctx, toasts, rpcCalls } = sandbox({ ...base, inputs: { ...base.inputs, editGestion: 'Inscrito' }, inscripcion: [] });
  await ctx.handleUpdateLead({ preventDefault() {} });
  const llamadasLead = rpcCalls.filter(c => c.name !== 'save_lead_enrollments');
  assert.equal(llamadasLead.length, 1, `no hubo RPC; toasts=${JSON.stringify(toasts)}`);
  assert.equal(llamadasLead[0].name, 'update_lead_followup');
  assert.equal(rpcCalls.filter(c => c.name === 'save_lead_enrollments').length, 0, 'sin programa no hay RPC de inscripciones');
  assert.equal(toasts.at(-1)?.[1], 'success', 'el cambio de estado no se bloquea');
});

test('inscripcion opcional: las inscripciones guardadas se conservan si la seccion no se toca', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const guardada = { programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15', activa: true };
  const { ctx, toasts, rpcCalls } = sandbox({
    ...base,
    inputs: { ...base.inputs, editGestion: 'Inscrito' },
    inscripcion: [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '2026-09-15' }],
    inscripcionFilas: [guardada],
  });
  await ctx.handleUpdateLead({ preventDefault() {} });
  assert.equal(rpcCalls.filter(c => c.name === 'save_lead_enrollments').length, 0, 'no se llama a la RPC: la inscripcion guardada se conserva');
  assert.equal(toasts.at(-1)?.[1], 'success');
});

test('inscripcion opcional: un programa sin nivel sigue bloqueando el guardado', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const { ctx, toasts, rpcCalls } = sandbox({
    ...base,
    inputs: { ...base.inputs, editGestion: 'Inscrito' },
    inscripcion: [{ programa: 'TEATRO_MUSICAL', nivel: '', fecha_inscripcion: '' }],
  });
  await ctx.handleUpdateLead({ preventDefault() {} });
  assert.equal(rpcCalls.length, 0, 'no se guarda con un programa sin nivel');
  assert.match(toasts.at(-1)[0], /Revisa los datos de inscripción/, `toast=${toasts.at(-1)?.[0]}`);
  assert.equal(toasts.at(-1)[1], 'warning');
});

test('inscripcion opcional: un programa con nivel si se guarda', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const inscripcion = [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: '' }];
  const { ctx, toasts, rpcCalls } = sandbox({
    ...base,
    inputs: { ...base.inputs, editGestion: 'Inscrito' },
    inscripcion,
  });
  await ctx.handleUpdateLead({ preventDefault() {} });
  const llamada = rpcCalls.find(c => c.name === 'save_lead_enrollments');
  assert.ok(llamada, 'la inscripcion se guarda en su RPC');
  // La fecha vacia viaja como null (pendiente), no como cadena.
  assert.deepEqual(llamada.args.p_enrollments, [{ programa: 'TEATRO_MUSICAL', nivel: 'MT Teens', fecha_inscripcion: null }]);
  assert.equal(toasts.at(-1)?.[1], 'success');
});

test('programa de inscripcion: se guarda solo cuando cambia', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const inputs = { ...base.inputs, editGestion: 'Inscrito', editProgramaInscripcion: 'Actuacion kids' };
  const { ctx, toasts, rpcCalls } = sandbox({ ...base, inputs, inscripcion: [] });
  await ctx.handleUpdateLead({ preventDefault() {} });
  const llamada = rpcCalls.find(c => c.name === 'set_lead_inscripcion_programa');
  assert.ok(llamada, 'el programa elegido se guarda en su RPC');
  assert.equal(llamada.args.p_programa, 'Actuacion kids');
  assert.equal(llamada.args.p_lead_id, 4590);
  assert.equal(toasts.at(-1)?.[1], 'success');
});

test('programa de inscripcion: sin cambios no se llama a la RPC', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const inputs = { ...base.inputs, editGestion: 'Inscrito', editProgramaInscripcion: 'Taller camara' };
  const { ctx, rpcCalls } = sandbox({ ...base, inputs, inscripcion: [], programaPrevio: 'Taller camara' });
  await ctx.handleUpdateLead({ preventDefault() {} });
  assert.equal(rpcCalls.filter(c => c.name === 'set_lead_inscripcion_programa').length, 0, 'sin cambio no se escribe');
});

test('programa de inscripcion: sin programa elegido no se llama a la RPC', async () => {
  const base = fx.edicion.find(s => s.nombre === 'edicion-asesora-tel-igual');
  const inputs = { ...base.inputs, editGestion: 'Inscrito', editProgramaInscripcion: '' };
  const { ctx, toasts, rpcCalls } = sandbox({ ...base, inputs, inscripcion: [] });
  await ctx.handleUpdateLead({ preventDefault() {} });
  assert.equal(rpcCalls.filter(c => c.name === 'set_lead_inscripcion_programa').length, 0);
  assert.equal(toasts.at(-1)?.[1], 'success', 'el lead se guarda igual sin programa');
});

test('programa de inscripcion: en el alta se guarda tras crear el lead', async () => {
  const base = fx.alta.find(s => s.nombre === 'alta-admin-vacios');
  const inputs = { ...base.inputs, newGestion: 'Inscrito', newProgramaInscripcion: 'Actuacion adultos' };
  const { ctx, toasts, rpcCalls } = sandbox({ ...base, inputs, inscripcion: [] });
  await ctx.handleCreateLead({ preventDefault() {} });
  const llamada = rpcCalls.find(c => c.name === 'set_lead_inscripcion_programa');
  assert.ok(llamada, 'el programa se guarda tras el alta');
  assert.equal(llamada.args.p_programa, 'Actuacion adultos');
  assert.equal(toasts.at(-1)?.[1], 'success');
});

test('leads.js: las piezas nuevas son puras y quedan registradas en window', () => {
  const fuente = readFileSync(new URL('../../src/legacy/leads.js', import.meta.url), 'utf8');
  const inicio = fuente.indexOf('// --- Formularios de alta/edicion');
  const fin = fuente.indexOf('// --- Registro en window');
  assert.ok(inicio > 0 && fin > inicio, 'seccion de formularios presente antes del registro');
  const segmento = fuente.slice(inicio, fin);
  assert.doesNotMatch(segmento, /\bdocument\b/, 'los builders no tocan DOM');
  assert.doesNotMatch(segmento, /supabaseClient|localStorage/, 'ni red ni almacenamiento');
  for (const n of ['fechaLlegadaDisplay', 'leadCreatePayload', 'leadUpdateFields', 'formatSaveErrorLead']) {
    assert.match(fuente, new RegExp(`window\\.${n} = ${n};`), `${n} registrado en window`);
  }
  assert.equal(typeof formatSaveErrorLead, 'function');
  assert.equal(formatSaveErrorLead.length, 2, 'la firma (error, agendado) se conserva');
});

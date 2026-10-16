// Caracterizacion de la plantilla de citas de la ficha (fase 27), sin DOM/red.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { appointmentLocal, citaHistorialHtml, citasLeadHtml } from '../../src/legacy/citas.js';
import { escapeHtml } from '../../src/legacy/helpers.js';

const cita = { id: 21, status: 'PROGRAMADA', advisor_user_id: 'assigned', scheduled_at: '2026-10-14T14:30:00Z', created_at: '2026-10-13T13:00:00Z' };
const permisos = { isAdmin: false, userId: 'assigned' };

test('autoria del INSERT separada de asignacion y de cambios posteriores', () => {
  const events = [
    { appointment_id: 21, status_anterior: 'PROGRAMADA', actor_name: 'Ultima asesora' },
    { appointment_id: 21, status_anterior: null, actor_name: 'Jessica' },
    { appointment_id: 22, status_anterior: null, actor_name: 'Ana' },
  ];
  const html = citasLeadHtml([{ ...cita, advisor_name: 'Ana', rescheduled_from_id: 9 }], { ...permisos, events });
  assert.match(html, /Reprogramada por: Jessica/);
  assert.match(html, /Asesora asignada: Ana/);
  assert.doesNotMatch(html, /Reprogramada por: (Ana|Ultima asesora)/);
  assert.match(citasLeadHtml([cita], { events }), /Creada por: Jessica/);
  assert.match(citasLeadHtml([cita], { events: events.slice(0, 1) }), /Creada por: Autor no disponible/);
  assert.match(citasLeadHtml([cita], { events: [{ appointment_id: 21, status_anterior: null, actor_name: '  ' }] }), /Autor no disponible/);
  assert.match(citasLeadHtml([cita], { historyError: true }), /role="alert"[^>]*>No se pudo cargar el historial/);
  assert.doesNotMatch(html, /role="alert"/);
  const payload = '<img src=x>';
  assert.ok(citasLeadHtml([cita], { events: [{ appointment_id: 21, status_anterior: null, actor_name: payload }] }).includes(`Creada por: ${escapeHtml(payload)}`));
});

test('carga real usa cursor id, conserva todos los eventos y hace visible el fallo', async () => {
  const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const pager = source.slice(source.indexOf('    async function fetchRowsByIdCursor('), source.indexOf('    // Lotes pequeños'));
  const loader = source.slice(source.indexOf('async function loadLeadAppointments('), source.indexOf('    async function createLeadAppointment('));
  for (const fail of [false, true]) {
    const selected = {};
    const rows = {
      lead_appointments: [{ ...cita, advisor_name: 'Ana', rescheduled_from_id: 9 }],
      lead_appointment_events: [
        { id: 1, appointment_id: 21, status_anterior: null, actor_name: 'Jessica', created_at: '2026-10-13' },
        { id: 2, appointment_id: 21, status_anterior: 'PROGRAMADA', status_nuevo: 'ASISTIO', actor_name: 'Ana', created_at: '2026-10-14' },
      ],
    };
    const list = { innerHTML: '' };
    const context = vm.createContext({
      sessionGeneration: 1, viewLeadGeneration: 1, currentUser: { id: 'assigned' }, currentAccess: {}, isAdmin: false,
      leadAppointmentsCache: [], leadAppointmentEventsCache: [], leadAppointmentHistoryError: false,
      validAppointmentId: Number, appointmentSessionValid: () => true, updateLeadAppointmentCreateState() {},
      isAgendadoGestion: () => true, getField() {}, findLeadByOrigin: () => ({}), citasLeadHtml,
      document: { getElementById: id => id === 'leadAppointmentsList' ? list : null }, console,
      supabaseClient: { from(table) {
        let cursor = Infinity;
        const query = {
          select(columns) { selected[table] = columns.split(',').map(s => s.trim()); return this; },
          eq() { return this; }, in() { return this; }, lt(_column, value) { cursor = value; return this; },
          order(column, options) { assert.equal(column, 'id'); assert.equal(options.ascending, false); return this; },
          range() { return this; },
          then(resolve) {
            if (fail && table === 'lead_appointment_events') return Promise.resolve({ error: { message: 'denied' } }).then(resolve);
            const data = rows[table].filter(r => r.id < cursor).sort((a, b) => b.id - a.id)
              .map(r => Object.fromEntries(Object.entries(r).filter(([key]) => selected[table].includes(key))));
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      } },
    });
    vm.runInContext(pager + loader, context);
    await context.loadLeadAppointments(7, {});
    assert.ok(selected.lead_appointment_events.includes('id'));
    if (fail) {
      assert.match(list.innerHTML, /role="alert"/);
      assert.match(list.innerHTML, /Reprogramada por: Autor no disponible/);
    } else {
      assert.match(list.innerHTML, /Reprogramada por: Jessica/);
      assert.match(list.innerHTML, /Asesora asignada: Ana/);
      assert.equal(context.leadAppointmentEventsCache.length, 2);
      assert.equal(context.leadAppointmentEventsCache[0].id, 1);
      assert.match(list.innerHTML, /PROGRAMADA → ASISTIO/);
    }
  }
});

test('permisos y estados: editar admin/asignada; resolver solo PROGRAMADA; borrar solo admin', () => {
  for (const [isAdmin, userId, canEdit] of [[true, 'other', true], [false, 'assigned', true], [false, 'other', false]]) {
    for (const status of ['PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA', '', 'programada']) {
      const html = citasLeadHtml([{ ...cita, status }], { isAdmin, userId });
      for (const action of ['editAppointmentDetails', 'editAppointmentCampus']) assert.equal(html.includes(`click:${action}(21)`), canEdit);
      for (const estado of ['ASISTIO', 'NO_ASISTIO', 'CANCELADA']) assert.equal(html.includes(`click:setLeadAppointmentStatus(21, '${estado}')`), status === 'PROGRAMADA');
      const canReschedule = status === 'PROGRAMADA' && (isAdmin || Boolean(userId));
      assert.equal(html.includes('click:rescheduleLeadAppointment(21)'), canReschedule);
      assert.equal(html.includes('id="reschedule-21" type="datetime-local"'), canReschedule);
      assert.equal(html.includes('click:deleteLeadAppointment(21)'), isAdmin);
      assert.match(html, /data-appointment-id="21"/);
    }
  }
});

test('ids invalidos se omiten, cadenas numericas se normalizan y se conserva el orden', () => {
  const invalidas = [0, -1, 1.5, NaN, Infinity, null, undefined, '', 'abc', '21)" onclick="bad'].map(id => ({ ...cita, id }));
  assert.equal(citasLeadHtml(invalidas, { isAdmin: true, userId: 'assigned' }), '');
  const html = citasLeadHtml([...invalidas, { ...cita, id: '0021' }, { ...cita, id: 3 }], permisos);
  assert.match(html, /click:editAppointmentDetails\(21\)/);
  assert.doesNotMatch(html, /0021|onclick|NaN|Infinity/);
  assert.ok(html.indexOf('data-appointment-id="21"') < html.indexOf('data-appointment-id="3"'));
});

test('fechas Miami, campos opcionales y defaults mantienen el marcado actual', () => {
  const html = citasLeadHtml([{ ...cita, student_age: 0, rescheduled_from_id: '9' }], permisos);
  assert.ok(html.includes(`Cita para: ${escapeHtml(appointmentLocal(cita.scheduled_at))}`));
  assert.ok(html.includes(`Creada: ${escapeHtml(appointmentLocal(cita.created_at))}`));
  assert.match(html, /Estudiante: - · Correo: - · Edad: 0/);
  assert.match(html, /Sede: Sin sede/);
  assert.match(html, /reprogramada desde #9/);
  const minima = citasLeadHtml([{ ...cita, scheduled_at: 'bad', created_at: 'bad' }], permisos);
  assert.match(minima, /Cita para: -/);
  assert.match(minima, /Creada: -/);
  assert.doesNotMatch(minima, /Estudiante:|whitespace-pre-line|reprogramada desde/);
});

test('texto externo escapado y referencia invalida sin interpolacion insegura', () => {
  const payload = '<img src=x onerror="bad">&\'';
  const html = citasLeadHtml([{ ...cita, status: payload, advisor_name: payload, notes: payload, student_name: payload, contact_email: payload, student_age: payload, campus: payload, rescheduled_from_id: payload }], permisos);
  assert.equal((html.match(/&lt;img/g) || []).length, 7);
  assert.ok(html.includes(escapeHtml(payload)));
  assert.doesNotMatch(html, /<img|onerror="bad"/);
  assert.match(html, /reprogramada desde #<\/span>/);
});

test('otra asesora gestiona una cita programada sin ganar edicion ni borrado', () => {
  const html = citasLeadHtml([cita], { isAdmin: false, userId: 'other-advisor' });
  assert.match(html, /click:rescheduleLeadAppointment\(21\)/);
  for (const status of ['ASISTIO', 'NO_ASISTIO', 'CANCELADA']) assert.ok(html.includes(`click:setLeadAppointmentStatus(21, '${status}')`));
  assert.doesNotMatch(html, /editAppointmentDetails|editAppointmentCampus|deleteLeadAppointment/);
  assert.equal(citasLeadHtml([cita], {}).includes('Reprogramar'), false);
  assert.doesNotMatch(citasLeadHtml([cita], {}), /setLeadAppointmentStatus/);
});

test('historial acumula resultados con actor, fecha y estados, visible en la cita correcta', () => {
  const events = ['ASISTIO', 'NO_ASISTIO', 'CANCELADA'].map((status, index) => ({
    appointment_id: 21, actor_name: `Asesora ${index}`, created_at: '2026-10-16T14:00:00Z',
    status_anterior: 'PROGRAMADA', status_nuevo: status,
  }));
  const html = citasLeadHtml([cita], { ...permisos, events });
  for (const event of events) {
    assert.ok(html.includes(escapeHtml(`${event.actor_name} · PROGRAMADA → ${event.status_nuevo} · ${appointmentLocal(event.created_at)}`)));
  }
  assert.doesNotMatch(citasLeadHtml([{ ...cita, id: 22 }], { ...permisos, events }), /Asesora 0/);
});

test('historial muestra actor y horas sin ejecutar markup externo', () => {
  const payload = '<img src=x onerror="bad">';
  const html = citaHistorialHtml([
    { appointment_id: 21, actor_name: payload, created_at: '2026-10-16T14:00:00Z', status_anterior: 'PROGRAMADA', status_nuevo: 'REPROGRAMADA', scheduled_at_anterior: '2026-10-16T21:30:00Z', scheduled_at_nuevo: '2026-10-18T14:00:00Z' },
    { appointment_id: 'no', actor_name: 'ignorado' },
  ]);
  assert.match(html, /reprogramó el/);
  assert.ok(html.includes(escapeHtml(payload)));
  assert.doesNotMatch(html, /<img|onerror="bad"/);
  assert.equal(citaHistorialHtml([]), '');
});

test('lista vacia mantiene mensaje exacto y no muta las citas', () => {
  assert.equal(citasLeadHtml([], permisos), '<p class="text-[11px] text-slate-500">Sin citas registradas.</p>');
  const citas = Object.freeze([Object.freeze({ ...cita })]);
  assert.doesNotThrow(() => citasLeadHtml(citas, permisos));
});

test('registro en window para el script clasico', async () => {
  const previous = globalThis.window;
  globalThis.window = {};
  try {
    const mod = await import('../../src/legacy/citas.js?fase27-window');
    assert.equal(globalThis.window.citasLeadHtml, mod.citasLeadHtml);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

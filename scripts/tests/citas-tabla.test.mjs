// Caracterizacion de la tabla de Citas (fase 17): filtrado, conteo, fila y
// estado vacio viven en src/legacy/citas.js; el golden de marcado queda en
// los tests t5 de la seccion Citas.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITAS_TABLA_VACIA, conteoCitas, filaCitaHtml, filtrarCitas } from '../../src/legacy/citas.js';

const cita = extras => ({
  id: 7, status: 'PROGRAMADA', campus: 'DORAL', is_data_dura: false,
  advisor_name: 'Loli', advisor_user_id: 'user-loli',
  scheduled_at: '2026-10-24T18:10:00.000Z', created_at: '2026-10-13T15:06:06.000Z',
  student_name: 'Gillary', contact_email: 'g@x.test', student_age: 21,
  lead: { id: 6205 },
  ...extras,
});
const conLead = (nombre, telefono, campana, mes, medio) => cita({ lead: { id: 6205, Nombre: nombre, Telefono: telefono, Campaña: campana, Mes: mes, Medio: medio } });
const todas = [
  conLead('Ana', '1 (786) 555-1001', 'Kids', 'octubre', 'WhatsApp'),
  cita({ id: 8, status: 'ASISTIO', campus: 'WESTON' }),
  cita({ id: 9, status: 'CANCELADA', campus: null }),
];

test('filtrarCitas: status, campana, sede (incluida sin), medio y advisor', () => {
  assert.equal(filtrarCitas(todas, {}).length, 3);
  assert.equal(filtrarCitas(todas, { status: 'ASISTIO' }).at(0).id, 8);
  assert.equal(filtrarCitas(todas, { campana: 'Kids' }).at(0).id, 7);
  assert.equal(filtrarCitas(todas, { campana: 'Otra' }).length, 0);
  // sede 'sin' cambia el predicado a !campus
  assert.equal(filtrarCitas(todas, { sede: 'sin' }).at(0).id, 9);
  assert.equal(filtrarCitas(todas, { sede: 'WESTON' }).at(0).id, 8);
  assert.equal(filtrarCitas(todas, { medio: 'WhatsApp' }).at(0).id, 7);
  assert.equal(filtrarCitas(todas, { advisor: 'Loli' }).length, 3);
  assert.equal(filtrarCitas(todas, { advisor: 'Otra' }).length, 0);
  // combinado sin resultados
  assert.equal(filtrarCitas(todas, { status: 'PROGRAMADA', sede: 'sin' }).length, 0);
});

test('conteoCitas: los cinco estados canonicos y denom de asistencia', () => {
  const { counts, denom } = conteoCitas(todas);
  assert.equal(counts.PROGRAMADA, 1);
  assert.equal(counts.ASISTIO, 1);
  assert.equal(counts.NO_ASISTIO, 0);
  assert.equal(counts.CANCELADA, 1);
  assert.equal(counts.REPROGRAMADA, 0);
  assert.equal(denom, 1);
  assert.deepEqual(Object.keys(conteoCitas([]).counts), ['PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA']);
});

test('filaCitaHtml: datos escapados y acciones por permisos y validez de id', () => {
  const base = { isAdmin: false, userId: 'user-loli' };
  const html = filaCitaHtml(conLead('Ana <b>?</b>', '1 (786) 555-1001', 'Kids', 'octubre', 'WhatsApp'), base);
  assert.match(html, /data-ev="click:openViewLeadModal\(6205,'actual'\)"/);
  assert.match(html, /data-ev="click:editAppointmentDetails\(7\)"/, 'misma asesora puede editar');
  assert.doesNotMatch(html, /deleteLeadAppointment/, 'sin admin no borra');
  assert.doesNotMatch(html, /Ana <b>/, 'el nombre sale escapado');
  // admin ve todo
  const admin = filaCitaHtml(todas[0], { isAdmin: true, userId: 'otro' });
  assert.match(admin, /data-ev="click:editAppointmentDetails\(7\)"/);
  assert.match(admin, /data-ev="click:deleteLeadAppointment\(7\)"/);
  // id invalido: sin acciones
  const rota = filaCitaHtml(cita({ id: 12, lead: null }), base);
  assert.doesNotMatch(rota, /data-ev="click:openViewLeadModal\(/);
});

test('estado vacio: mensaje y boton de limpiar con data-ev', () => {
  assert.match(CITAS_TABLA_VACIA, /No hay citas para los filtros seleccionados/);
  assert.match(CITAS_TABLA_VACIA, /data-ev="click:resetCitasFilters\(\)"/);
});

// Caracterizacion de notas y gestiones de la ficha (fase 26).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fichaLeadHtml, gestionesLeadHtml, notasLeadHtml } from '../../src/legacy/leads.js';

test('ficha con teléfono muestra la llamada para leads actuales e históricos', () => {
  for (const finalOrigin of ['actual', 'historico']) {
    const html = fichaLeadHtml(
      { id: 7, Nombre: 'Prueba', Telefono: '3055551234' },
      { finalOrigin, alcanceCompleto: true, firstEntryHtml: '', repetidosHtml: '' },
    );
    assert.match(html, /lead-detail-hero/);
    assert.ok(html.includes("llamarLead('7','3055551234')"));
  }
});

test('notasLeadHtml: vacio, autor por defecto y fecha', () => {
  assert.equal(notasLeadHtml([], { isAdmin: false, editingNoteId: null }), '<p class="text-[11px] text-slate-500">Sin notas registradas.</p>');
  const nota = { id: 7, note: 'Llamar mañana', author_name: '', created_at: '2026-10-13T14:06:06.000Z' };
  const html = notasLeadHtml([nota], { isAdmin: false, editingNoteId: null });
  assert.match(html, /data-note-id="7"/);
  assert.match(html, /Agente/, 'autor por defecto');
  assert.match(html, /Llamar mañana/);
  assert.doesNotMatch(html, /editLeadNote|deleteLeadNote|saveLeadNoteInline/, 'sin admin no hay acciones');
  assert.doesNotMatch(html, /textarea/);
});

test('notasLeadHtml: admin con acciones, editada y edicion inline', () => {
  const nota = { id: 9, note: '<b>ojo</b>', author_name: 'Loli', created_at: '2026-10-13T14:06:06.000Z', updated_at: '2026-10-14T10:00:00.000Z' };
  const normal = notasLeadHtml([nota], { isAdmin: true, editingNoteId: null });
  assert.match(normal, /Loli/);
  assert.match(normal, /· editada/);
  assert.match(normal, /&lt;b&gt;ojo&lt;\/b&gt;/, 'nota escapada');
  assert.match(normal, /data-ev="click:editLeadNote\(9\)"/);
  assert.match(normal, /data-ev="click:deleteLeadNote\(9\)"/);
  const editando = notasLeadHtml([nota], { isAdmin: true, editingNoteId: 9 });
  assert.match(editando, /<textarea id="leadNoteEditInput"/);
  assert.match(editando, /data-ev="click:saveLeadNoteInline\(9\)"/);
  assert.match(editando, /data-ev="click:cancelLeadNoteEdit\(\)"/);
  // otra nota editandose no abre textarea en esta
  const otra = notasLeadHtml([nota], { isAdmin: true, editingNoteId: 5 });
  assert.doesNotMatch(otra, /textarea/);
});

test('gestionesLeadHtml: vacio, fecha invertida y flecha con anterior', () => {
  assert.equal(gestionesLeadHtml([]), '<p class="text-[11px] text-slate-500">Sin cambios registrados todavía.</p>');
  const cambio = { fecha_gestion: '2026-10-13', gestion_anterior: 'NUEVO', gestion_nueva: 'AGENDADO', canal: 'Llamada', autor_name: 'Loli' };
  const html = gestionesLeadHtml([cambio]);
  assert.match(html, /13\/10\/2026/);
  assert.match(html, /NUEVO[\s\S]*→[\s\S]*AGENDADO/);
  assert.match(html, /Llamada/);
  assert.doesNotMatch(html, /Escuchar/);
});

test('gestionesLeadHtml: etiqueta de canal normalizada y sin anterior', () => {
  const base = { fecha_gestion: '2026-10-13', gestion_nueva: 'INSCRITO', canal: 'Llamada', is_data_dura: true };
  assert.match(gestionesLeadHtml([{ ...base }]), /Llamada Data Dura/);
  assert.match(gestionesLeadHtml([{ ...base, is_data_dura: false }]), /Llamada/);
  assert.match(gestionesLeadHtml([{ ...base, is_data_dura: true, canal: 'Llamada y WhatsApp' }]), /Llamada WhatsApp/);
  assert.match(gestionesLeadHtml([{ ...base, canal: null, is_data_dura: false }]), /- · Agente/);
  const sinAnterior = gestionesLeadHtml([{ ...base, gestion_anterior: null }]);
  assert.doesNotMatch(sinAnterior, /→/);
});

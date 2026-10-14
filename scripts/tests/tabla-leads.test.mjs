// Caracterizacion de la tabla de leads y su paginacion (fase 25).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  badgeGestionHtml, controlesPaginacionHtml, filaLeadHtml, infoPaginacion,
  rangoPaginacion, tablaVaciaLeadsHtml,
} from '../../src/legacy/leads.js';

const lead = extras => ({ id: 11, Nombre: 'Ana', Telefono: '1 (786) 555-1234', 'Campaña': 'Kids', Medio: 'WhatsApp', Mes: 'octubre', Fecha: '3/10/2026', GESTION: 'AGENDADO', 'Agente ': 'Loli', ...extras });

test('badgeGestionHtml: clases por palabra clave (mismas familias)', () => {
  assert.match(badgeGestionHtml('INSCRITO'), /bg-emerald-500\/15 text-emerald-300/);
  assert.match(badgeGestionHtml('AGENDADO DATA DURA'), /bg-amber-500\/15 text-amber-300/);
  assert.match(badgeGestionHtml('Información'), /bg-blue-500\/15 text-blue-300/);
  assert.match(badgeGestionHtml('No contesta'), /bg-rose-500\/15 text-rose-300/);
  assert.match(badgeGestionHtml('Vive lejos'), /bg-purple-500\/15 text-purple-300/);
  assert.match(badgeGestionHtml('otra cosa'), /bg-slate-700\/50 text-slate-300/);
  // el texto sale escapado y sin trim vacio
  assert.match(badgeGestionHtml('<b>x</b>'), /&lt;b&gt;/);
});

test('filaLeadHtml: data-ev, telefono limpio y permisos', () => {
  const html = filaLeadHtml(lead(), { leadId: 11, origin: 'actual', isAdmin: false });
  assert.match(html, /#11/);
  assert.match(html, /data-ev="click:openViewLeadModal\('11', 'actual'\)"/);
  assert.match(html, /data-ev="click:openEditLeadModal\('11', 'actual'\)"/);
  assert.doesNotMatch(html, /archiveLead/, 'sin admin no archiva');
  assert.match(html, /WhatsApp deshabilitado hasta conectar la API/, 'con telefono hay boton deshabilitado');
  assert.doesNotMatch(html, /2025/, 'origen actual sin badge');
  const historico = filaLeadHtml(lead(), { leadId: 11, origin: 'historico', isAdmin: true });
  assert.doesNotMatch(historico, /archiveLead/, 'en historico no se archiva ni siendo admin');
  assert.match(historico, /2025/);
  const admin = filaLeadHtml(lead(), { leadId: 11, origin: 'actual', isAdmin: true });
  assert.match(admin, /data-ev="click:archiveLead\('11', 'actual'\)"/);
  // sin telefono no hay boton; sin nombre usa 'Sin Nombre'
  const sinTel = filaLeadHtml(lead({ Telefono: '' }), { leadId: 12, origin: 'actual', isAdmin: false });
  assert.doesNotMatch(sinTel, /message-circle/);
  assert.match(sinTel, />S\/N</);
  const sinNombre = filaLeadHtml(lead({ Nombre: '' }), { leadId: 13, origin: 'actual', isAdmin: false });
  assert.match(sinNombre, /Sin Nombre/);
});

test('tablaVaciaLeadsHtml: mensaje y limpiar filtros', () => {
  const html = tablaVaciaLeadsHtml();
  assert.match(html, /No se encontraron leads con los filtros actuales/);
  assert.match(html, /data-ev="click:resetAllFilters\(\)"/);
});

test('infoPaginacion: texto con separador y vacio', () => {
  assert.match(infoPaginacion(1, 20, 1205), /^Mostrando .* a .* de .* registros$/);
  assert.equal(infoPaginacion(0, 0, 0), 'Sin registros');
});

test('rangoPaginacion: tramos exactos', () => {
  assert.deepEqual(rangoPaginacion(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(rangoPaginacion(2, 10), [1, 2, 3, 4, 5, '...', 10]);
  assert.deepEqual(rangoPaginacion(9, 10), [1, '...', 6, 7, 8, 9, 10]);
  assert.deepEqual(rangoPaginacion(5, 10), [1, '...', 4, 5, 6, '...', 10]);
});

test('controlesPaginacionHtml: bordes deshabilitados, activa y etiqueta movil', () => {
  const primeraControles = controlesPaginacionHtml(1, 5);
  assert.match(primeraControles, /aria-label="Página anterior" data-ev="click:goToPage\(0\)" disabled/);
  assert.match(primeraControles, /data-ev="click:goToPage\(2\)" aria-label="Ir a la página 2"/);
  // la pagina activa (1) lleva aria-current y se marca una sola vez
  assert.equal((primeraControles.match(/aria-current="page"/g) || []).length, 1);
  assert.match(primeraControles, /click:goToPage\(1\)" aria-label="Ir a la página 1" aria-current="page"/);
  const media = controlesPaginacionHtml(3, 5);
  assert.match(media, /aria-current="page"/);
  assert.doesNotMatch(media, /pagination-ellipsis/);
  const ultima = controlesPaginacionHtml(5, 5);
  assert.match(ultima, /aria-label="Página siguiente" data-ev="click:goToPage\(6\)" disabled/);
  const larga = controlesPaginacionHtml(5, 20);
  assert.match(larga, /pagination-ellipsis/);
  assert.match(larga, /Página 5 de 20/);
});

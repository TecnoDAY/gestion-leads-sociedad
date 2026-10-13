/**
 * Capa 2 del patron strangler: helpers puros del area Citas extraidos del
 * monolito index.html. Importan directamente helpers.js y citas-calendar.js
 * (en lugar de resolver via window) para seguir testeandose en node sin DOM.
 * El script clasico sigue resolviendolas via window.* (registradas al final
 * de este modulo); sus llamadas quedaron intactas en index.html.
 */

import { escapeHtml, getField, miamiToday } from './helpers.js';
import { miamiNaive, addMinutesNaive, advisorColor } from '../citas-calendar.js';

/**
 * Convierte un valor a Date o null si es invalido.
 * @param {string|number|Date} value
 * @returns {Date|null}
 */
export function appointmentDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }

// datetime-local no incluye zona horaria. La hora escrita representa siempre
// la hora de pared de las sedes (America/New_York), no la del dispositivo.
// En los cambios DST se rechazan tanto la hora inexistente como la ambigua.
/**
 * Convierte 'YYYY-MM-DDTHH:mm' de un input datetime-local a ISO UTC,
 * interpretando la hora como hora de pared de Miami. Devuelve null si el
 * formato es invalido o la hora es inexistente/ambigua por DST.
 * @param {string} value
 * @returns {string|null}
 */
export function appointmentInputISO(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const candidates = ['-05:00', '-04:00'].map(offset => new Date(`${expected}:00${offset}`)).filter(date => {
    if (Number.isNaN(date.getTime())) return false;
    const parts = Object.fromEntries(formatter.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === expected;
  });
  return candidates.length === 1 ? candidates[0].toISOString() : null;
}

/**
 * Fecha y hora de una cita en hora Miami (formato es-ES corto); '-' si invalida.
 * @param {string|number|Date} value
 * @returns {string}
 */
export function appointmentLocal(value) { const d = appointmentDate(value); return d ? d.toLocaleString('es-ES', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' }) : '-'; }

/**
 * Badge de estado de cita para listas y fichas (HTML escapado).
 * @param {string} status
 * @returns {string} HTML del badge.
 */
export function appointmentBadge(status) { const s = String(status || ''); return `<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[11px] font-semibold">${escapeHtml(s || '-')}</span>`; }

/**
 * Rango por defecto del panel Citas: del dia 1 del mes actual en Miami a hoy.
 * @returns {[string, string]} [desde, hasta] en YYYY-MM-DD.
 */
export function citasDateDefaults() { const today = miamiToday(); return [`${today.slice(0, 7)}-01`, today]; }

/**
 * Convierte filas filtradas de citasCache a eventos FullCalendar: hora naive
 * Miami, duracion visual de 60 minutos y color estable por asesora.
 * @param {Array<object>} rows
 * @returns {Array<object>} Eventos para window.citasCalendarApi.updateEvents.
 */
export function citasEventsFromRows(rows) {
  return rows.map(r => {
    const l = r.lead;
    const leadId = Number(l?.id);
    const start = miamiNaive(r.scheduled_at) || '';
    const end = start ? addMinutesNaive(start, 60) : '';
    const advisorKey = r.advisor_user_id ?? r.advisor_name;
    const color = advisorColor(advisorKey) || '#2563eb';
    return {
      id: String(r.id),
      start,
      end,
      title: escapeHtml(getField(l, 'Nombre') || 'Sin nombre'),
      extendedProps: {
        leadId,
        advisorName: r.advisor_name,
        status: r.status,
        campus: r.campus,
        time: start ? start.split('T')[1] : '',
      },
      backgroundColor: color,
      borderColor: color,
      textColor: '#ffffff',
    };
  }).filter(e => e.start && e.end);
}

/**
 * Normaliza un id de cita: entero finito positivo o null.
 * @param {*} value
 * @returns {number|null}
 */
export function validAppointmentId(value) { const id = Number(value); return Number.isFinite(id) && Number.isInteger(id) && id > 0 ? id : null; }

/** Estados canonicos que la tabla de citas resalta por separado. */
const ESTADOS_CITAS = ['PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA'];

/**
 * Filtra la cache de citas con las mismas 5 condiciones de renderCitas,
 * en el mismo orden (status, campana del lead, sede con especial 'sin',
 * medio del lead y asesora). Un filtro vacio no filtra.
 * @param {object[]} citas
 * @param {{status?:string, campana?:string, sede?:string, medio?:string, advisor?:string}} filtros
 * @returns {object[]}
 */
export function filtrarCitas(citas, filtros) {
  const { status = '', campana = '', sede = '', medio = '', advisor = '' } = filtros || {};
  return (citas || []).filter(r => (!status || r.status === status)
    && (!campana || getField(r.lead, 'Campaña') === campana)
    && (!sede || (sede === 'sin' ? !r.campus : r.campus === sede))
    && (!medio || getField(r.lead, 'Medio') === medio)
    && (!advisor || r.advisor_name === advisor));
}

/**
 * Cuenta las citas por los estados canonicos y denom = ASISTIO + NO_ASISTIO.
 * @returns {{counts: Record<string, number>, denom: number}}
 */
export function conteoCitas(rows) {
  const counts = Object.fromEntries(ESTADOS_CITAS.map(s => [s, (rows || []).filter(r => r.status === s).length]));
  return { counts, denom: counts.ASISTIO + counts.NO_ASISTIO };
}

/**
 * Fila de la tabla de citas con la plantilla exacta del export original.
 * Los botones viajan via data-ev (fase 15); permisos identicos a hoy:
 * Editar para admin o asesora de la cita, borrar solo para admin.
 * @param {object} r Cita con lead incluido.
 * @param {{isAdmin: boolean, userId: string}} permisos
 * @returns {string}
 */
export function filaCitaHtml(r, { isAdmin, userId } = { isAdmin: false, userId: '' }) {
  const l = r.lead, id = Number(l?.id);
  return `<tr><td class="p-3"><span class="block font-medium">${escapeHtml(appointmentLocal(r.scheduled_at))}</span><span class="block text-[11px] text-slate-500">Cita creada: ${escapeHtml(appointmentLocal(r.created_at))}</span></td><td class="p-3">${escapeHtml(getField(l, 'Nombre'))}<br>${escapeHtml(getField(l, 'Telefono'))}</td><td class="p-3">${escapeHtml(r.student_name || '-')}</td><td class="p-3">${escapeHtml(r.contact_email || '-')}</td><td class="p-3">${escapeHtml(r.student_age != null ? String(r.student_age) : '-')}</td><td class="p-3">${escapeHtml(r.campus || 'Sin sede')}</td><td class="p-3">${escapeHtml(r.advisor_name)}</td><td class="p-3">${escapeHtml(getField(l, 'Campaña'))}</td><td class="p-3">${escapeHtml(getField(l, 'Mes'))}</td><td class="p-3">${escapeHtml(r.status)}</td><td class="p-3">${Number.isInteger(id) && id > 0 ? `<button data-ev="click:openViewLeadModal(${id},'actual')" class="text-indigo-400 hover:underline">Ver ficha</button>${(isAdmin || r.advisor_user_id === userId) ? `<button data-ev="click:editAppointmentDetails(${r.id})" class="block text-indigo-400 hover:underline">Editar datos</button>` : ''}${isAdmin ? `<button data-ev="click:deleteLeadAppointment(${r.id})" class="block text-rose-400 hover:underline">Eliminar cita</button>` : ''}` : ''}</td></tr>`;
}

/** Marcado exacto del cuerpo vacio de la tabla de citas. */
export const CITAS_TABLA_VACIA = '<tr><td colspan="11" class="appointments-empty"><p class="text-sm font-semibold">No hay citas para los filtros seleccionados.</p><p class="mt-1 text-xs">Prueba con otras fechas o limpia los filtros.</p><button type="button" data-ev="click:resetCitasFilters()">Limpiar filtros</button></td></tr>';

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') {
  window.appointmentDate = appointmentDate;  window.appointmentInputISO = appointmentInputISO;
  window.appointmentLocal = appointmentLocal;
  window.appointmentBadge = appointmentBadge;
  window.citasDateDefaults = citasDateDefaults;
  window.citasEventsFromRows = citasEventsFromRows;
  window.validAppointmentId = validAppointmentId;
  window.filtrarCitas = filtrarCitas;
  window.conteoCitas = conteoCitas;
  window.filaCitaHtml = filaCitaHtml;
  window.CITAS_TABLA_VACIA = CITAS_TABLA_VACIA;
}

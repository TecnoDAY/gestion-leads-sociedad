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

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') {
  window.appointmentDate = appointmentDate;  window.appointmentInputISO = appointmentInputISO;
  window.appointmentLocal = appointmentLocal;
  window.appointmentBadge = appointmentBadge;
  window.citasDateDefaults = citasDateDefaults;
  window.citasEventsFromRows = citasEventsFromRows;
  window.validAppointmentId = validAppointmentId;
}

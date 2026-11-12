// Pure presentation of the existing task heartbeat; no DOM, requests or timers.
import { escapeHtml } from './helpers.js';

export const TEAM_PRESENCE_TTL_MS = 3 * 60 * 1000;
const states = [
  ['online', 'En línea', 'En línea'],
  ['away', 'Ausentes', 'Ausente'],
  ['unknown', 'Sin datos', 'Sin datos'],
];

export function presenceStatus(lastSeenAt, now) {
  const last = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(last)) return 'unknown';
  return now - last <= TEAM_PRESENCE_TTL_MS ? 'online' : 'away';
}

export function groupPresence(rows, now) {
  const groups = { online: [], away: [], unknown: [] };
  for (const person of rows || []) groups[presenceStatus(person.last_seen_at, now)].push(person);
  return groups;
}

export function presenceSummary(groups) {
  return `${groups.online.length} en línea · ${groups.away.length} ausentes · ${groups.unknown.length} sin datos`;
}

export function presenceRelativeTime(timestamp, now) {
  const time = Date.parse(timestamp || '');
  if (!Number.isFinite(time)) return 'sin datos';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  if (seconds < 3600) return `hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `hace ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86400);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

// All displayed clock times use Miami, independently of the viewer's device zone.
const miamiClock = new Intl.DateTimeFormat('es', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const miamiDate = new Intl.DateTimeFormat('es', { timeZone: 'America/New_York', day: 'numeric', month: 'short' });
const weekLabels = ['Esta semana', 'Semana anterior', 'Hace 2 semanas', 'Hace 3 semanas'];

export function presenceDuration(seconds) {
  const minutes = Math.max(0, Math.floor((Number.isFinite(Number(seconds)) ? Number(seconds) : 0) / 60));
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  if (hours) parts.push(`${hours} h`);
  if (rest || !parts.length || hours) parts.push(`${rest} min`);
  return parts.join(' ');
}

export function presenceCounter(person, state, now) {
  if (state === 'unknown') return '';
  const start = Date.parse((state === 'online' ? person.current_period_started_at : person.last_seen_at) || '');
  if (!Number.isFinite(start)) return 'Inicio del periodo sin registrar';
  const elapsed = Math.max(0, now - start);
  // Over a day the start date is added, but the clock and the minute counter are kept.
  const since = elapsed >= 86400000 ? `${miamiDate.format(start)}, ${miamiClock.format(start)}` : miamiClock.format(start);
  return `desde ${since} · ${presenceDuration(elapsed / 1000)}`;
}

export function canViewPresenceHistory(access) {
  return access?.activo === true && ['admin', 'supervisor'].includes(access.role);
}

function historyDate(value) {
  // RPC dates have no timezone: noon UTC avoids shifting a local calendar date.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(`${value}T12:00:00Z`) : NaN;
  return Number.isFinite(date) ? miamiDate.format(date) : String(value || 'Sin fecha');
}

function historyTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? miamiClock.format(time) : '—';
}

export function presenceHistoryHtml(data) {
  const days = Array.isArray(data?.days) ? data.days.slice(0, 2) : [];
  const weeks = Array.isArray(data?.weeks) ? data.weeks.slice(0, 4) : [];
  const hasHistory = days.some(day => day.periods?.length) || weeks.some(week => Number(week.online_seconds) > 0);
  const empty = '<p class="team-empty">Aún no hay historial registrado</p>';
  const daily = days.map((day, index) => {
    const periods = Array.isArray(day.periods) ? day.periods : [];
    const rows = periods.map(period => `<li><span>${escapeHtml(historyTime(period.started_at))} – ${period.ongoing ? 'ahora' : escapeHtml(historyTime(period.ended_at))}</span><strong>${period.state === 'online' ? 'En línea' : 'Ausente'}</strong><span>${escapeHtml(presenceDuration(period.seconds))}</span></li>`).join('');
    return `<section><h4>${index === 0 ? 'Hoy' : 'Ayer'} · ${escapeHtml(historyDate(day.date))}</h4>${rows ? `<ul class="team-history-periods">${rows}</ul>` : empty}</section>`;
  }).join('');
  const weekly = weeks.map((week, index) => `<tr><th scope="row">${weekLabels[index]}<small>${escapeHtml(historyDate(week.start_date))} – ${escapeHtml(historyDate(week.end_date))}</small></th><td>${escapeHtml(presenceDuration(week.online_seconds))}</td><td>${escapeHtml(presenceDuration(week.away_seconds))}</td></tr>`).join('');
  return `${hasHistory ? '' : empty}${daily}<h4>Resumen semanal</h4><div class="team-history-table"><table><thead><tr><th scope="col">Semana (Miami)</th><th scope="col">En línea</th><th scope="col">Ausente</th></tr></thead><tbody>${weekly}</tbody></table></div><p class="team-history-note">Ausente = tiempo entre la primera conexión y la última desconexión del día. En línea = CRM abierto; no indica trabajo. Historial desde que se activó el registro.</p><p class="team-history-note">Hora de Miami. Desconexión estimada por última señal; cortes de hasta 5 min se fusionan. No se cuenta ausencia antes de la primera conexión ni después de la última desconexión. Resumen calculado al abrir, sin actualización en vivo.</p>`;
}

export function teamPresenceHtml(groups, now, access = null, expandedUserId = null) {
  const html = states.map(([state, title, label]) => {
    const people = groups[state];
    if (!people.length) return '';
    const cards = people.map(person => {
      const name = String(person.nombre || '').trim() || 'Sin nombre';
      const initials = name.split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();
      const role = ({ admin: 'Admin', supervisor: 'Supervisor', agente: 'Agente', trafficker: 'Trafficker' })[person.role] || person.role || 'Sin rol';
      const signal = state === 'away' ? `Última vez ${presenceRelativeTime(person.last_seen_at, now)}` : state === 'unknown' ? 'Aún no hay señal registrada' : '';
      const counter = presenceCounter(person, state, now);
      const content = `<span class="team-avatar team-${state}" aria-hidden="true">${escapeHtml(initials)}</span><span class="team-person-info"><span class="team-person-heading"><strong>${escapeHtml(name)}</strong><span class="team-role">${escapeHtml(role)}</span></span>${counter ? `<small>${escapeHtml(`${label} · ${counter}`)}</small>` : ''}${signal ? `<small>${escapeHtml(signal)}</small>` : ''}</span><span class="team-state team-${state}">${label}</span>`;
      if (canViewPresenceHistory(access)) return `<li><button type="button" class="team-person" id="team-person-${escapeHtml(person.user_id)}" data-user-id="${escapeHtml(person.user_id)}" aria-expanded="${person.user_id === expandedUserId}" aria-controls="teamPresenceHistory" data-ev="click:togglePresenceHistory(this)">${content}</button></li>`;
      return `<li class="team-person">${content}</li>`;
    }).join('');
    return `<section class="team-group" aria-labelledby="team-${state}-title"><h3 id="team-${state}-title" class="team-${state}">${title} <small>${people.length}</small></h3><ul>${cards}</ul></section>`;
  }).join('');
  return html || '<p class="team-empty">No hay personas activas en el equipo.</p>';
}

if (typeof window !== 'undefined') window.teamPresenceApi = { groupPresence, presenceSummary, presenceRelativeTime, teamPresenceHtml, canViewPresenceHistory, presenceHistoryHtml };

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

export function teamPresenceHtml(groups, now) {
  const html = states.map(([state, title, label]) => {
    const people = groups[state];
    if (!people.length) return '';
    const cards = people.map(person => {
      const name = String(person.nombre || '').trim() || 'Sin nombre';
      const initials = name.split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();
      const role = ({ admin: 'Admin', supervisor: 'Supervisor', agente: 'Agente', trafficker: 'Trafficker' })[person.role] || person.role || 'Sin rol';
      const signal = state === 'away' ? `Última vez ${presenceRelativeTime(person.last_seen_at, now)}` : state === 'unknown' ? 'Aún no hay señal registrada' : '';
      return `<li class="team-person"><span class="team-avatar team-${state}" aria-hidden="true">${escapeHtml(initials)}</span><div class="team-person-info"><div class="team-person-heading"><strong>${escapeHtml(name)}</strong><span class="team-role">${escapeHtml(role)}</span></div>${signal ? `<small>${escapeHtml(signal)}</small>` : ''}</div><span class="team-state team-${state}">${label}</span></li>`;
    }).join('');
    return `<section class="team-group" aria-labelledby="team-${state}-title"><h3 id="team-${state}-title" class="team-${state}">${title} <small>${people.length}</small></h3><ul>${cards}</ul></section>`;
  }).join('');
  return html || '<p class="team-empty">No hay personas activas en el equipo.</p>';
}

if (typeof window !== 'undefined') window.teamPresenceApi = { groupPresence, presenceSummary, presenceRelativeTime, teamPresenceHtml };

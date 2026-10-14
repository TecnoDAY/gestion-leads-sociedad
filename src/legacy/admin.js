/**
 * Panel de administracion: usuarios autorizados y actividad de asesoras
 * (fase 33 del strangler). Piezas puras sin DOM ni estado de sesion: los
 * wrappers del monolito (renderAuthorizedUsers, loadAuthorizedUsers,
 * loadAgentSessionsReport) quedan solo con isAdmin/guards, getElementById,
 * container.innerHTML y lucide.createIcons(). IDLE_LIMIT_MS no se lee de
 * window: entra por parametro en isRecentAgentSession y
 * agentSessionsByAdvisor, como pide la regla de la fase.
 */
import { escapeHtml, escapeAttr } from './helpers.js';

// --- Usuarios autorizados: filtro, conteo y plantillas ----------------------

/**
 * Mismo criterio que el monolito: lowercase/includes sobre email, nombre y
 * role. El search llega ya recortado/minusculado desde el wrapper, pero se
 * normaliza aqui tambien para que la pieza sea correcta de forma aislada
 * (trim+toLowerCase son idempotentes sobre el valor del wrapper).
 * @param {Array<object>|null|undefined} list - Usuarios de admin_manage_user_access.
 * @param {string} search - Terminos de busqueda (case/acento-insensible por lowercase).
 * @returns {Array<object>} Items que coinciden; vacio si la lista lo es.
 */
export function filterAuthorizedUsers(list, search) {
  const q = String(search ?? '').trim().toLowerCase();
  return (list || []).filter(item => [item.email, item.nombre, item.role].some(value => String(value ?? '').toLowerCase().includes(q)));
}

/**
 * Texto del contador userSearchCount (textContent en el monolito, nunca HTML).
 * @param {Array<object>} filtered - Resultado de filterAuthorizedUsers.
 * @param {number} total - Tamano de la cache completa.
 * @returns {string} `${n} de ${m} usuarios`.
 */
export function usuariosConteoText(filtered, total) {
  return `${filtered.length} de ${total} usuarios`;
}

/**
 * Fila de un usuario autorizado, byte-exacta con el monolito. El control del
 * cierre automatico solo existe para asesoras (rol agente) y va en una
 * subfila propia: pulsarlo no debe poder confundirse con Desactivar cuenta,
 * que invalida el acceso. Los ids van escapados con escapeAttr (nunca correo
 * dentro de JavaScript) y el boton pasa siempre el booleano invertido.
 * @param {{ user_id: string, email?: string, nombre?: string, role: string, activo?: boolean, idle_timeout_enabled?: boolean }} item
 * @returns {string} HTML de la fila (con los saltos de linea del monolito).
 */
export function authorizedUsersRowHtml(item) {
  const cierre = item.idle_timeout_enabled !== false;
  const idleControl = item.role === 'agente' ? `
          <div class="users-row-actions users-row-idle">
            <span class="users-idle-label">Cierre automático</span>
            <span class="users-status ${cierre ? 'is-active' : 'is-inactive'}">${cierre ? 'Activado' : 'Desactivado'}</span>
            <button type="button" data-ev="click:setIdleTimeout('${escapeAttr(item.user_id)}', ${cierre ? 'false' : 'true'})">${cierre ? 'Desactivar cierre' : 'Activar cierre'}</button>
          </div>` : '';
  return `
        <div class="users-row">
          <div class="min-w-0"><strong class="block">${escapeHtml(item.nombre || item.email)}</strong>${item.nombre ? `<span class="users-row-email block">${escapeHtml(item.email)}</span>` : ''}<span class="text-[11px] text-slate-500">${escapeHtml(item.role)}</span></div>
          <div class="users-row-actions">
            <span class="users-status ${item.activo ? 'is-active' : 'is-inactive'}">${item.activo ? 'Activo' : 'Inactivo'}</span>
            <button type="button" data-ev="click:openChangeEmail('${escapeAttr(item.user_id)}')">Cambiar correo</button>
            <button type="button" data-ev="click:setUserActive('${escapeAttr(item.user_id)}', ${item.activo ? 'false' : 'true'})">${item.activo ? 'Desactivar cuenta' : 'Activar cuenta'}</button>
          </div>
          ${idleControl}
        </div>`;
}

/**
 * Estado vacio de la lista: coincide en 'No hay coincidencias.' cuando hay
 * busqueda activa y en 'No hay usuarios.' cuando la cache esta vacia.
 * @param {string} search - Busqueda vigente del wrapper (tras trim/toLowerCase).
 * @returns {string} Parrafo con la clase text-slate-500 del monolito.
 */
export function authorizedUsersEmptyHtml(search) {
  return `<p class="text-slate-500">${search ? 'No hay coincidencias.' : 'No hay usuarios.'}</p>`;
}

/**
 * Cuerpo completo de #authorizedUsers: filas unidas con join('') y estado
 * vacio del monolito como fallback (los items con HTML vacio no existen, la
 * fila siempre produce texto, asi que join('') solo es '' con lista vacia).
 * @param {Array<object>} users - Items ya filtrados.
 * @param {string} search - Busqueda vigente para el texto del estado vacio.
 * @returns {string} HTML de la lista.
 */
export function authorizedUsersHtml(users, search) {
  return (users || []).map(item => authorizedUsersRowHtml(item)).join('') || authorizedUsersEmptyHtml(search);
}

/** Aviso de carga de #authorizedUsers (misma cadena que el monolito). */
export function authorizedUsersLoadingHtml() {
  return '<p class="text-slate-500">Cargando usuarios...</p>';
}

/**
 * Bloque de error de #authorizedUsers con boton Reintentar (data-ev
 * loadAuthorizedUsers()). Clases rose y gap-3 exactas del monolito; no
 * confundir con el bloque de actividad, que usa gap-2 y otro literal.
 */
export function authorizedUsersErrorHtml() {
  return '<div role="alert" class="flex flex-wrap items-center gap-3 text-rose-300"><p>No se pudieron cargar los usuarios.</p><button type="button" data-ev="click:loadAuthorizedUsers()" class="min-h-11 rounded-lg border border-rose-400 px-3 py-2 font-semibold hover:bg-rose-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300">Reintentar</button></div>';
}

// --- Actividad de asesoras (reporte admin_agent_sessions_report) ------------

/**
 * Marca de tiempo en hora de Miami, 'es-ES' sin segundos; '-' si el valor
 * esta ausente (0 entra aqui por falsy, como en el monolito) o no es fecha.
 * @param {number|string|null|undefined} ts - Epoch ms o string ISO.
 * @returns {string} Fecha/hora local o '-'.
 */
export function idleMiami(ts) { if (!ts) return '-'; const d = new Date(ts); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('es-ES', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

/**
 * Sesion abierta con senal reciente. idleLimitMs entra por parametro: el
 * modulo nunca lee IDLE_LIMIT_MS de window. Regla de fecha del monolito:
 * last_activity_at o, si falta, started_at (distinta de la regla de
 * 'activity' en agentSessionsByAdvisor, que tambien mira ended_at).
 * @param {{ active?: boolean, last_activity_at?: string, started_at?: string }} session
 * @param {number} now - Epoch ms del reporte (Date.now del wrapper).
 * @param {number} idleLimitMs - Umbral de inactividad (IDLE_LIMIT_MS del monolito).
 * @returns {boolean} true solo con active y senal dentro del umbral.
 */
export function isRecentAgentSession(session, now, idleLimitMs) {
  const lastActivity = Date.parse(session.last_activity_at || session.started_at || '');
  return Boolean(session.active) && Number.isFinite(lastActivity) && now - lastActivity < idleLimitMs;
}

/**
 * Agregacion por asesora, byte-exacta con el monolito: key user_id o
 * agent_name; count incrementos; active si alguna sesion es reciente; stale
 * si alguna abierta (Boolean(s.active)) no lo es; activity maxima. La regla
 * de activity (last_activity_at || ended_at || started_at, con || 0) NO se
 * unifica con la de isRecent: son deliberadamente distintas.
 * @param {Array<object>|null|undefined} sessions - Filas del RPC.
 * @param {number} now - Epoch ms del reporte.
 * @param {number} idleLimitMs - Umbral para isRecentAgentSession.
 * @returns {Array<{ name: string, count: number, active: boolean, stale: boolean, activity: number }>}
 *   Entradas ordenadas por activity desc (estable, como sort del monolito).
 */
export function agentSessionsByAdvisor(sessions, now, idleLimitMs) {
  const advisors = new Map();
  (sessions || []).forEach(s => {
    const key = s.user_id || s.agent_name;
    const activity = Date.parse(s.last_activity_at || s.ended_at || s.started_at) || 0;
    const entry = advisors.get(key) || { name: s.agent_name || '-', count: 0, active: false, stale: false, activity: 0 };
    entry.count += 1;
    const recent = isRecentAgentSession(s, now, idleLimitMs);
    entry.active ||= recent;
    entry.stale ||= Boolean(s.active) && !recent;
    if (activity > entry.activity) entry.activity = activity;
    advisors.set(key, entry);
  });
  return [...advisors.values()].sort((a, b) => b.activity - a.activity);
}

/**
 * Contenido de #agentSessionsBody: encabezado con resumen y lista de filas,
 * o el estado vacio literal del monolito. La lista usa el nombre escapado,
 * idleMiami(activity) y el color por estado (emerald/amber/slate). now esta
 * aqui por simetria con agentSessionsByAdvisor (la plantilla en si es
 * estatica respecto al reloj).
 * @param {Array<object>} entries - Resultado de agentSessionsByAdvisor.
 * @param {number} now - Epoch ms del reporte (sin efecto en la plantilla).
 * @returns {string} HTML del reporte.
 */
export function agentSessionsListHtml(entries, now) {
  const list = entries || [];
  const rows = list.map(a =>
    `<div class="users-session-row"><span class="font-semibold">${escapeHtml(a.name)}</span><span class="text-slate-500">Última actividad: ${idleMiami(a.activity)}</span><span class="${a.active ? 'text-emerald-600' : a.stale ? 'text-amber-600' : 'text-slate-500'}">${a.active ? 'Activa' : a.stale ? 'Sin actividad reciente' : 'Sin sesión activa'}</span><span class="text-slate-500">${a.count} ${a.count === 1 ? 'sesión' : 'sesiones'}</span></div>`
  ).join('');
  const activeCount = list.filter(a => a.active).length;
  return rows
    ? `<p class="font-semibold text-slate-600">Últimos 7 días · ${list.length} asesoras · ${activeCount} activas</p><div class="users-session-list">${rows}</div>`
    : '<p class="text-slate-500">Sin sesiones de asesoras en los últimos 7 días.</p>';
}

// --- Mensajes de cambio de correo --------------------------------------------

/** Codigos de error de la funcion change-user-email con su mensaje publico. */
export const changeEmailMessages = {
  invalid_email: 'El correo no tiene un formato válido.',
  same_email: 'El correo nuevo es el mismo que el actual.',
  email_taken: 'Ese correo ya está en uso por otra cuenta.',
  email_rate_limit: 'Se agotó el límite de correos del proyecto. Inténtalo en unos minutos.',
  user_not_found: 'Esa cuenta ya no existe.',
  change_rejected: 'Supabase rechazó el cambio. Inténtalo de nuevo.',
  internal: 'Algo falló en el servidor. Inténtalo de nuevo.',
};

/**
 * Mensaje para status.textContent tras un rechazo del cambio de correo.
 * Contracto del fallback (registrado del monolito): el caller hacia
 * `changeEmailMessages[code] || 'No se pudo solicitar el cambio de correo.'`,
 * asi que codigo desconocido, null o ausente devuelve ese literal. Se
 * conserva la indexacion directa del monolito (incluso su sombra en claves
 * heredadas como 'toString') para no cambiar comportamiento observable.
 * @param {string|null|undefined} code - Error devuelto por la funcion o null.
 * @returns {string} Mensaje localizable del codigo o el fallback generico.
 */
export function mensajeCambioCorreo(code) {
  return changeEmailMessages[code] || 'No se pudo solicitar el cambio de correo.';
}

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') window.adminApi = { filterAuthorizedUsers, usuariosConteoText, authorizedUsersRowHtml, authorizedUsersHtml, authorizedUsersEmptyHtml, authorizedUsersLoadingHtml, authorizedUsersErrorHtml, agentSessionsByAdvisor, agentSessionsListHtml, isRecentAgentSession, idleMiami, changeEmailMessages, mensajeCambioCorreo };

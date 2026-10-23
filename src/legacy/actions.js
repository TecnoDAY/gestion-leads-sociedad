// Dispatcher de acciones del panel (fase 15): los atributos inline on*= no
// pasan una CSP sin 'unsafe-inline', asi que quedan declarados como
// `data-ev="tipo[,tipo2]:cuerpo"` y este modulo adjunta un listener por
// evento y ejecuta la llamada. Reglas deliberadamente estrictas:
//   - el cuerpo es UNA expresion de llamada: fn(arg,...) con literales;
//   - literales admitidos: string con escapes \\' y \\\\, numero, true,
//     false, null, y los tokens this/event;
//   - NO hay eval ni Function: un tokenizer propio y rechazo explicito;
//   - el handler debe estar en la allowlist HANDLERS: no se resuelve cualquier
//     funcion de window (si el HTML se inyectara, no podria llamar a un global
//     arbitrario como fetch).
// lo no soportado se convirtio a wrappers del bloque principal.
// Las funciones se resuelven en window en cada evento (tardio), igual que
// los handlers inline actuales.

export const EVENTOS = new Set(['click', 'change', 'input', 'submit', 'focus', 'blur', 'pointerenter']);

/**
 * Allowlist de handlers que `data-ev` puede invocar. El dispatcher NO resuelve
 * cualquier funcion de `window`: sin esta lista, un HTML inyectado podria
 * llamar a cualquier global (por ejemplo `fetch(...)`). Anyadir un handler
 * nuevo obliga a declararlo aqui (y el test de guarda lo verifica).
 */
export const HANDLERS = new Set([
  'addCatalogValue', 'addLeadNote', 'applyFilters', 'archiveLead', 'cancelLeadNoteEdit',
  'cancelarAjusteMensual', 'changePageSize', 'citasCalendarNav', 'clearDashRange',
  'clearHelpSearch', 'closeAppModal', 'closeCatalogsModal', 'closeChangeEmail', 'closeEditLeadModal',
  'closeHelpModal', 'closeNewLeadModal', 'closeRlsModal', 'closeViewLeadModal',
  'continueAgentSession', 'createLeadAppointment', 'cycleTheme', 'deleteCampaignPeriodStat',
  'deleteCampaignStat', 'deleteLeadAppointment', 'deleteLeadNote', 'deleteReporteNota',
  'editAppointmentCampus', 'editAppointmentDetails', 'editLeadNote', 'exportCampanasCSV',
  'exportCurrentLeadsCSV', 'exportHistoricalSummaryCSV', 'exportPeriodoGestionesCSV',
  'exportPeriodoInscritosHistorialCSV', 'exportReporteDiarioCSV', 'exportReportePeriodoCSV',
  'focusHelpSection', 'focusPeriodoTip', 'formatPhoneField', 'formatPhoneFieldAndCheck',
  'goToPage', 'handleAuthorizeUser', 'handleChangeEmail', 'handleCreateLead', 'handleLogin',
  'handlePasswordReset', 'handleSetPassword', 'handleSignOut', 'handleUpdateLead',
  'disablePushNotifications', 'enablePushNotifications', 'iniciarAjusteMensualFromData', 'installApp', 'loadAgentSessionsReport', 'loadAuthorizedUsers',
  'loadCampanas', 'loadCitas', 'loadDashboardAppointments', 'loadLeadNotes', 'loadOlderLeads',
  'loadReporteDiario', 'loadReportePeriodo', 'openCatalogsModal', 'openChangeEmail',
  'openDashboardAppointmentsDetail', 'openEditLeadFromView', 'openEditLeadModal', 'openHelpModal',
  'closeMoreMenu', 'openAppModal', 'openLeadFromView', 'openMoreMenu', 'openNewLeadModal', 'openRlsModal', 'openViewLeadModal', 'queueNewPhoneCheck',
  'recalcCampaignRow', 'refreshLeadsData', 'renameCatalogValue', 'renderAuthorizedUsers',
  'renderCatalogList', 'renderHelpContent', 'renderHistoricalAnalytics', 'rescheduleLeadAppointment',
  'resetAllFilters', 'resetCampaignStatAutoFromData', 'resetCitasFilters', 'returnToRecentLeads',
  'saveCampaignPeriodStatFromData', 'saveCampaignStatFromData', 'saveLeadNoteInline',
  'saveReporteNota', 'scheduleApplyFilters', 'scrollHelpToTop', 'setCampanasPeriodo',
  'setCitasViewMode', 'setDashboardPriority', 'setDataSource', 'setHistRangePreset',
  'setIdleTimeout', 'setLeadAppointmentStatus', 'setPeriodoPreset', 'setReporteVista',
  'setUserActive', 'stopPropagationEvent', 'switchTab', 'syncNewLeadMes', 'syncNewUltimaGestion',
  'toggleAdminUsers', 'toggleCatalogValue', 'toggleEditAppointmentFields', 'toggleLoginPassword',
  'toggleMatrixPanel', 'toggleNewAppointmentFields', 'updateEditSubmitState',
]);

/**
 * Valida un atributo data-ev: `tipo[,tipo2]:cuerpo`.
 * @param {string} raw Valor completo del atributo.
 * @returns {{tipos: string[], cuerpo: string}}
 */
export function parseDataAtributo(raw) {
  if (typeof raw !== 'string' || raw === '') throw new Error('data-ev vacia');
  const sep = raw.indexOf(':');
  if (sep <= 0) throw new Error(`data-ev sin tipo: ${raw.slice(0, 40)}`);
  const tipos = raw.slice(0, sep).split(',').map(t => t.trim());
  for (const t of tipos) if (!EVENTOS.has(t)) throw new Error(`tipo de evento no soportado: ${t}`);
  const cuerpo = raw.slice(sep + 1).trim();
  if (!cuerpo) throw new Error('data-ev sin cuerpo');
  return { tipos, cuerpo };
}

/** Lee un literal completo empezando en idx; devuelve {valor, fin} o lanza. */
function leerLiteral(cuerpo, idx) {
  const c = cuerpo[idx];
  if (c === "'" || c === '"') {
    let out = '';
    let i = idx + 1;
    for (; i < cuerpo.length; i++) {
      const ch = cuerpo[i];
      if (ch === '\\') {
        const sig = cuerpo[i + 1];
        if (sig === c || sig === '\\') { out += sig; i++; continue; }
        throw new Error(`escape no soportado en literal: ${cuerpo.slice(idx, i + 2)}`);
      }
      if (ch === c) return { valor: out, fin: i + 1 };
      out += ch;
    }
    throw new Error('literal sin cerrar');
  }
  const m = /^(true|false|null|this|event|-?\d+(?:\.\d+)?)\b/.exec(cuerpo.slice(idx));
  if (!m) throw new Error(`argumento no soportado en: ${cuerpo.slice(idx, idx + 20)}`);
  let fin = idx + m[1].length;
  let props;
  if (m[1] === 'this' && cuerpo[fin] === '.') {
    // unico acceso admitido: this.value (los inputs cambian su valor)
    const pm = /^\.value\b/.exec(cuerpo.slice(fin));
    if (!pm) throw new Error(`this ${cuerpo.slice(fin).split(')')[0]} no admitido por data-ev (solo this.value)`);
    props = ['value'];
    fin += pm[0].length;
  }
  return { token: m[1], props, fin };
}

/**
 * Parsea el cuerpo "fn(arg, ...)" de data-ev. Resuelve this/event con el
 * contexto del dispatcher. Rechaza cualquier cosa que no sea una llamada.
 * Devuelve el valor de retorno de la llamada.
 * @param {string} cuerpo Cuerpo de la accion.
 * @param {object} ctx Contexto: elemento, evento, buscarGlobal y permitidos.
 * @returns {unknown}
 */
export function llamarAccion(cuerpo, { elemento, evento, buscarGlobal, permitidos = HANDLERS }) {
  const m = /^([\w$]+)\s*\(/.exec(cuerpo);
  if (!m) throw new Error(`cuerpo de data-ev no es una llamada: ${cuerpo.slice(0, 40)}`);
  if (!permitidos.has(m[1])) throw new Error(`handler no permitido: ${m[1]}`);
  const fn = buscarGlobal(m[1]);
  if (typeof fn !== 'function') throw new Error(`funcion global ausente: ${m[1]}`);
  let i = m[0].length;
  const args = [];
  const resolver = (token, props) => {
    if (token === 'this') {
      for (const prop of props || []) return elemento[prop];
      return elemento;
    }
    if (token === 'event') return evento;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    return Number(token);
  };
  for (;;) {
    while (/\s/.test(cuerpo[i] || '')) i++;
    if (cuerpo[i] === ')') { i++; break; }
    const { valor, token, fin, props } = leerLiteral(cuerpo, i);
    args.push(token !== undefined ? resolver(token, props) : valor);
    i = fin;
    while (/\s/.test(cuerpo[i] || '')) i++;
    if (cuerpo[i] === ',') { i++; continue; }
    if (cuerpo[i] === ')') { i++; break; }
    throw new Error(`sintaxis inesperada en: ${cuerpo.slice(i, i + 20)}`);
  }
  if (i !== cuerpo.length) throw new Error(`sobrante tras la llamada: ${cuerpo.slice(i, i + 20)}`);
  // Fidelidad con los handlers inline: this === elemento con data-ev.
  return fn.apply(elemento, args);
}

/** Adjunta el dispatcher delegado al documento actual. */
export function adjuntarAcciones(documento) {
  const manejar = e => {
    const objetivo = e.target;
    const el = objetivo instanceof Element ? objetivo.closest('[data-ev]') : null;
    if (!el) return;
    try {
      const { tipos, cuerpo } = parseDataAtributo(el.getAttribute('data-ev'));
      if (!tipos.includes(e.type)) return;
      llamarAccion(cuerpo, { elemento: el, evento: e, buscarGlobal: nombre => window[nombre] });
    } catch (error) {
      console.error('[actions] data-ev invalida:', error?.message);
    }
  };
  // focus/blur/pointerenter no burbujean: en fase de captura el closest() sigue encontrando el elemento con data-ev.
  for (const tipo of EVENTOS) documento.addEventListener(tipo, manejar, tipo === 'focus' || tipo === 'blur' || tipo === 'pointerenter');
}

// El bundle evalua este modulo despues de analizar el HTML (script diferido),
// asi que el arbol ya existe y la delegacion cubre todo el panel.
if (typeof document !== 'undefined' && document?.addEventListener) adjuntarAcciones(document);

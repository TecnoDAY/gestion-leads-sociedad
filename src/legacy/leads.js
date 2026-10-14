/**
 * Capa 2 del patron strangler: helpers puros del area Leads extraidos del
 * monolito index.html. Sin DOM ni estado de sesion; importan helpers.js y
 * reportes.js directamente para seguir testeandose en node. El script clasico
 * sigue resolviendolos via window.* (registro al final de este modulo).
 */

import { consolidateLeadsById, escapeHtml, getField, miamiToday, sortAlphaEs } from './helpers.js';
import { MONTH_CHRONO } from './reportes.js';

/**
 * Orden de un catalogo de meses: cronologico canonico; valores no reconocidos
 * al final en orden alfabetico junto a 'OTRO'. Nunca muta la entrada.
 * @param {Array<string>} values
 * @returns {Array<string>}
 */
export function sortMonthCatalog(values) {
  const norma = v => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  const byNorma = new Map();
  (values || []).forEach(v => { const k = norma(v); if (k && !byNorma.has(k)) byNorma.set(k, v); });
  const out = [], usados = new Set();
  MONTH_CHRONO.forEach(m => { const v = byNorma.get(m); if (v !== undefined) { out.push(v); usados.add(m); } });
  const resto = [...byNorma.keys()].filter(k => !usados.has(k) && k !== 'OTRO').map(k => byNorma.get(k));
  sortAlphaEs(resto).forEach(v => out.push(v));
  const otro = byNorma.get('OTRO');
  if (otro !== undefined) out.push(otro);
  return out;
}

/**
 * Solo digitos: los telefonos se comparan siempre normalizados.
 * @param {*} value
 * @returns {string}
 */
export function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Badge "Nuevo": visible todo el mes/año (Miami) de la Fecha de llegada.
 * @param {string} fechaTexto - Fecha textual del lead (d/m/aaaa).
 * @param {string} [today] - Fecha base YYYY-MM-DD; por defecto hoy Miami.
 *   Parametro de inyeccion: los tests fijan el reloj para ser deterministas.
 * @returns {boolean}
 */
export function isNuevoEsteMes(fechaTexto, today = miamiToday()) {
  const m = String(fechaTexto || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (!m) return false;
  const [yy, mm] = today.split('-'); return m[3] === yy && String(Number(m[2])) === String(Number(mm));
}

/**
 * Chip HTML "Nuevo" para el lead; cadena vacia si no es nuevo este mes.
 * @param {object} lead
 * @returns {string}
 */
export function nuevoBadge(lead) {
  return isNuevoEsteMes(getField(lead, 'Fecha'))
    ? '<span class="text-[11px] uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shrink-0">Nuevo</span>'
    : '';
}

/**
 * Formatea solo telefonos de EE. UU. (10 digitos o 11 con prefijo 1);
 * internacionales o atipicos se conservan tal cual.
 * @param {*} value
 * @returns {string}
 */
export function formatPhone(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (!str.trim()) return '';
  const trimmed = str.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1);
    return `1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`;
  }
  // Internacional (p. ej. con '+') o longitud distinta: conservar tal cual
  return trimmed;
}

// compareLeadIdsDescending vive ahora en helpers.js (base generica de ids).

/**
 * Etiqueta el origen del registro ('actual'|'historico') como propiedad no
 * enumerable: los ids numericos colisionan entre tablas y todo acceso por id
 * debe resolver con origen; no enumeral evita alterar getField/export/JSON.
 * @param {object} lead
 * @param {string} origin
 * @returns {object} El mismo lead etiquetado.
 */
export function withOrigin(lead, origin) {
  if (!lead || typeof lead !== 'object') return lead;
  try {
    Object.defineProperty(lead, '__origin', { value: origin, enumerable: false, writable: true, configurable: true });
  } catch (_) {
    lead.__origin = origin;
  }
  return lead;
}

/**
 * Origen efectivo del registro; 'actual' por defecto.
 * @param {object} lead
 * @returns {string}
 */
export function getLeadOrigin(lead) {
  return (lead && lead.__origin === 'historico') ? 'historico' : 'actual';
}

/**
 * Compara que dos colecciones contengan los mismos ids en el mismo orden.
 * @param {Array<object>} leads
 * @param {Array<object>} idRows
 * @returns {boolean}
 */
export function haveSameLeadIds(leads, idRows) {
  return leads.length === idRows.length
    && leads.every((lead, index) => String(lead.id) === String(idRows[index].id));
}

/**
 * El estado de gestion pone el lead en camino de cita: prefijo AGENDAD.
 * @param {string} value
 * @returns {boolean}
 */
export function isAgendadoGestion(value) { return String(value || '').trim().toUpperCase().startsWith('AGENDAD'); }

/**
 * Alta/actualizacion de un lead en el estado con la semantica original del
 * monolito (fase 20). Pura: devuelve el estado nuevo completo.
 * @param {object} estado { allLeads, completeCurrentLeads,
 *   completeCurrentLoaded, totalDatabaseCount, leadDataRevision }
 * @param {object} lead Lead entrante (debe traer id).
 * @param {number} [loadedLeadTarget] Limite de ventana de allLeads.
 * @returns {{estado: object, esNuevo: boolean}}
 */
export function aplicarUpsertLead(estado, lead, loadedLeadTarget) {
  if (!lead || lead.id === undefined || lead.id === null) return { estado, esNuevo: false };
  const leadId = String(lead.id);
  const existingLead = estado.allLeads.find(item => String(item.id) === leadId);
  const cachedLead = estado.completeCurrentLoaded
    ? estado.completeCurrentLeads.find(item => String(item.id) === leadId)
    : undefined;
  if (!existingLead && cachedLead) {
    return {
      estado: {
        ...estado,
        completeCurrentLeads: consolidateLeadsById([
          ...estado.completeCurrentLeads.filter(item => String(item.id) !== leadId),
          { ...cachedLead, ...lead },
        ]),
        leadDataRevision: estado.leadDataRevision + 1,
      },
      esNuevo: false,
    };
  }
  const allLeads = consolidateLeadsById([
    ...estado.allLeads.filter(item => String(item.id) !== leadId),
    { ...(existingLead || {}), ...lead },
  ]);
  if (allLeads.length > loadedLeadTarget) allLeads.length = loadedLeadTarget;
  return {
    estado: {
      ...estado,
      allLeads,
      completeCurrentLeads: estado.completeCurrentLoaded
        ? consolidateLeadsById([
            ...estado.completeCurrentLeads.filter(item => String(item.id) !== leadId),
            { ...(cachedLead || {}), ...lead },
          ])
        : estado.completeCurrentLeads,
      totalDatabaseCount: estado.totalDatabaseCount + (existingLead ? 0 : 1),
      leadDataRevision: estado.leadDataRevision + 1,
    },
    esNuevo: !existingLead,
  };
}

/**
 * Elimina un lead del estado con la semantica original (fase 20). Pura.
 * @returns {{estado: object, removedVisible: boolean}}
 */
export function aplicarRemoveLead(estado, leadId) {
  if (leadId === undefined || leadId === null) return { estado, removedVisible: false };
  const previousLength = estado.allLeads.length;
  const allLeads = estado.allLeads.filter(lead => String(lead.id) !== String(leadId));
  const removedVisible = allLeads.length !== previousLength;
  let removedCached = false;
  let completeCurrentLeads = estado.completeCurrentLeads;
  if (estado.completeCurrentLoaded) {
    const previousCacheLength = completeCurrentLeads.length;
    completeCurrentLeads = completeCurrentLeads.filter(lead => String(lead.id) !== String(leadId));
    removedCached = completeCurrentLeads.length !== previousCacheLength;
  }
  if (!removedVisible && !removedCached) return { estado: { ...estado, allLeads }, removedVisible: false };
  return {
    estado: {
      ...estado,
      allLeads,
      completeCurrentLeads,
      totalDatabaseCount: Math.max(0, estado.totalDatabaseCount - 1),
      leadDataRevision: estado.leadDataRevision + 1,
    },
    removedVisible,
  };
}

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') {
  window.sortMonthCatalog = sortMonthCatalog;
  window.normalizePhone = normalizePhone;
  window.isNuevoEsteMes = isNuevoEsteMes;
  window.nuevoBadge = nuevoBadge;
  window.formatPhone = formatPhone;
  window.withOrigin = withOrigin;
  window.getLeadOrigin = getLeadOrigin;
  window.haveSameLeadIds = haveSameLeadIds;
  window.isAgendadoGestion = isAgendadoGestion;
  window.aplicarUpsertLead = aplicarUpsertLead;
  window.aplicarRemoveLead = aplicarRemoveLead;
}

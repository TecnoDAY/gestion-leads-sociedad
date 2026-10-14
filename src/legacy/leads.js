/**
 * Capa 2 del patron strangler: helpers puros del area Leads extraidos del
 * monolito index.html. Sin DOM ni estado de sesion; importan helpers.js y
 * reportes.js directamente para seguir testeandose en node. El script clasico
 * sigue resolviendolos via window.* (registro al final de este modulo).
 */

import { compareAlphaEs, consolidateLeadsById, escapeAttr, escapeHtml, getField, miamiToday, sortAlphaEs } from './helpers.js';
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

/**
 * Metricas del dashboard con las reglas originales: total, agendados e
 * inscritos por GESTION (contiene 'agendad'/'inscrit') y porcentajes con un
 * decimal ('0.0' sin leads).
 * @param {object[]} leads
 * @returns {{total: number, agendados: number, inscritos: number, conversion: string, agendadosPct: string}}
 */
export function metricasLeads(leads) {
  const total = (leads || []).length;
  const agendados = (leads || []).filter(l => getField(l, 'GESTION').toLowerCase().includes('agendad')).length;
  const inscritos = (leads || []).filter(l => getField(l, 'GESTION').toLowerCase().includes('inscrit')).length;
  return {
    total,
    agendados,
    inscritos,
    conversion: total > 0 ? ((inscritos / total) * 100).toFixed(1) : '0.0',
    agendadosPct: total > 0 ? ((agendados / total) * 100).toFixed(1) : '0.0',
  };
}

/**
 * Subtitulo del KPI de total con las mismas ramas del original: el rango
 * del dash gana; luego el mes (salvo historico); luego filtros activos con
 * los leads cargados; y por defecto la pista de bloques segun el limite.
 * @param {{hasFilters: boolean, dashDesde: string, dashHasta: string, mesSel: string,
 *   dataSource: string, visiblesCargados: number, loadedLeadTarget: number, batchSize: number}} ctx
 * @returns {string}
 */
export function subtituloKpiTotal(ctx) {
  const { hasFilters, dashDesde, dashHasta, mesSel, dataSource, visiblesCargados, loadedLeadTarget, batchSize } = ctx;
  if (dashDesde !== '' || dashHasta !== '') return 'Resultados globales por gestión';
  if (mesSel !== '' && dataSource !== 'historico') return 'Resultados globales del mes';
  if (hasFilters) return `Resultados dentro de ${visiblesCargados.toLocaleString()} cargados`;
  return loadedLeadTarget <= batchSize ? 'Últimos registros ingresados' : 'Incluye bloques anteriores';
}

/**
 * Matriz cruzada gestion x campana (thead/tbody/tfoot) con el marcado
 * original: orden alfabetico es, 'Sin Definir'/'General' para vacios,
 * clases por estado, '-' en ceros y totales por fila/columna.
 * @param {object[]} leads
 * @returns {{thead: string, tbody: string, tfoot: string}}
 */
export function matrizLeadsHtml(leads) {
  const lista = leads || [];
  const gestionesMap = new Map();
  const campanasMap = new Map();
  lista.forEach(l => {
    const g = getField(l, 'GESTION').trim() || 'Sin Definir';
    const c = getField(l, 'Campaña').trim() || 'General';
    gestionesMap.set(g, (gestionesMap.get(g) || 0) + 1);
    campanasMap.set(c, (campanasMap.get(c) || 0) + 1);
  });
  const sortedGestiones = Array.from(gestionesMap.keys()).sort(compareAlphaEs);
  const sortedCampanas = Array.from(campanasMap.keys()).filter(c => c !== '').sort(compareAlphaEs);

  let headerHtml = `<tr>
        <th class="px-4 py-3 bg-slate-950 font-bold text-slate-200 border-r border-slate-800">Estatus (GESTIÓN)</th>`;
  sortedCampanas.forEach(camp => {
    headerHtml += `<th class="px-3 py-3 text-center whitespace-nowrap text-slate-300 font-semibold">${escapeHtml(camp)}</th>`;
  });
  headerHtml += `<th class="px-4 py-3 text-right bg-slate-950 font-bold text-slate-100 border-l border-slate-800">Total Fila</th></tr>`;

  const matrixCounts = {};
  const colTotals = {};
  sortedCampanas.forEach(c => colTotals[c] = 0);
  lista.forEach(l => {
    const g = getField(l, 'GESTION').trim() || 'Sin Definir';
    const c = getField(l, 'Campaña').trim() || 'General';
    const cellKey = `${g}:::${c}`;
    matrixCounts[cellKey] = (matrixCounts[cellKey] || 0) + 1;
    if (colTotals[c] !== undefined) colTotals[c]++;
  });

  let bodyHtml = '';
  sortedGestiones.forEach(gestionName => {
    let rowTotal = 0;
    const isClosedInscrito = gestionName.toLowerCase().includes('inscrit');
    const isAgendado = gestionName.toLowerCase().includes('agendad');
    bodyHtml += `<tr class="hover:bg-slate-800/60 transition-colors">
          <td class="px-4 py-2.5 font-medium border-r border-slate-800 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${isClosedInscrito ? 'bg-emerald-400' : isAgendado ? 'bg-amber-400' : 'bg-slate-500'}"></span>
            <span class="truncate max-w-[180px]">${escapeHtml(gestionName)}</span>
          </td>`;
    sortedCampanas.forEach(campName => {
      const count = matrixCounts[`${gestionName}:::${campName}`] || 0;
      rowTotal += count;
      let cellClass = 'px-3 py-2 text-center tabular-nums cursor-pointer transition-colors ';
      if (count === 0) {
        cellClass += 'text-slate-600 hover:bg-slate-800/40';
      } else if (isClosedInscrito) {
        cellClass += 'text-emerald-400 font-semibold bg-emerald-500/10 hover:bg-emerald-500/20';
      } else if (isAgendado) {
        cellClass += 'text-amber-300 font-semibold bg-amber-500/10 hover:bg-amber-500/20';
      } else {
        cellClass += 'text-slate-200 font-medium hover:bg-indigo-500/10';
      }
      bodyHtml += `<td class="${cellClass}" data-matrix-gestion="${escapeAttr(gestionName)}" data-matrix-campana="${escapeAttr(campName)}">
            ${count > 0 ? count.toLocaleString() : '-'}
          </td>`;
    });
    bodyHtml += `<td class="px-4 py-2.5 text-right font-mono font-bold border-l border-slate-800 text-slate-100 tabular-nums">
          ${rowTotal.toLocaleString()}
        </td></tr>`;
  });

  let grandTotal = 0;
  let footHtml = `<tr>
        <td class="px-4 py-3 font-bold text-slate-100 border-r border-slate-800 uppercase tracking-wider">Total Campaña</td>`;
  sortedCampanas.forEach(campName => {
    const colSum = colTotals[campName] || 0;
    grandTotal += colSum;
    footHtml += `<td class="px-3 py-3 text-center font-mono font-bold text-slate-100 tabular-nums">${colSum.toLocaleString()}</td>`;
  });
  footHtml += `<td class="px-4 py-3 text-right font-mono font-extrabold text-indigo-400 bg-indigo-500/10 border-l border-slate-800 tabular-nums text-sm">
        ${grandTotal.toLocaleString()}
      </td></tr>`;
  return { thead: headerHtml, tbody: bodyHtml, tfoot: footHtml };
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
  window.metricasLeads = metricasLeads;
  window.subtituloKpiTotal = subtituloKpiTotal;
  window.matrizLeadsHtml = matrizLeadsHtml;
}

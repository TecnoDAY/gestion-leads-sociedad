/**
 * Capa 2 del patron strangler: helpers puros del area Leads extraidos del
 * monolito index.html. Sin DOM ni estado de sesion; importan helpers.js y
 * reportes.js directamente para seguir testeandose en node. El script clasico
 * sigue resolviendolos via window.* (registro al final de este modulo).
 */

import { compareAlphaEs, compareLeadIdsDescending, consolidateLeadsById, escapeAttr, escapeHtml, getField, miamiToday, sortAlphaEs } from './helpers.js';
import { programaPorId } from './inscripciones.js';
import { MONTH_CHRONO, parseFechaLead } from './reportes.js';

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
 * Etiqueta con el programa del catalogo en el que el lead esta interesado.
 * Dato informativo: no dice de donde viene el lead ni donde se inscribe.
 * Cadena vacia si el lead no tiene interes guardado.
 * @param {object} lead
 * @returns {string}
 */
export function interesadoBadge(lead) {
  const programa = getField(lead, 'INTERESADO EN').trim();
  if (!programa) return '';
  // inline-block + truncate: la etiqueta se ajusta al texto y, si el programa
  // es largo, se recorta con puntos suspensivos (el texto completo esta en
  // el title).
  return `<span class="inline-block max-w-[170px] truncate rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-300 shrink-0" title="Interesado en: ${escapeAttr(programa)}">Interés: ${escapeHtml(programa)}</span>`;
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
  const nuevos = (leads || []).filter(l => {
    const estado = getField(l, 'GESTION').trim().toLowerCase();
    return estado === '' || estado === 'nuevo' || estado === 'sin gestion' || estado === 'sin gestión';
  }).length;
  const gestion = total - nuevos;
  return {
    total,
    agendados,
    inscritos,
    nuevos,
    gestion,
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

// --- Piezas puras de la tabla de leads y paginacion (fase 25) ----------------

/** Badge de gestion con las mismas familias de color del original. */
export function badgeGestionHtml(gestion) {
  const g = (gestion || '').trim();
  const lower = g.toLowerCase();
  let colorClasses = 'bg-slate-700/50 text-slate-300 border-slate-600/60';
  let dotColor = 'bg-slate-400';
  if (lower.includes('inscrit')) {
    colorClasses = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    dotColor = 'bg-emerald-400';
  } else if (lower.includes('agendad')) {
    colorClasses = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    dotColor = 'bg-amber-400';
  } else if (lower.includes('informaci')) {
    colorClasses = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    dotColor = 'bg-blue-400';
  } else if (lower.includes('no contesta') || lower.includes('colgo') || lower.includes('no procede') || lower.includes('ya no')) {
    colorClasses = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    dotColor = 'bg-rose-400';
  } else if (lower.includes('vive lejos') || lower.includes('costear') || lower.includes('menor')) {
    colorClasses = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    dotColor = 'bg-purple-400';
  }
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border ${colorClasses}">
        <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
        <span class="truncate max-w-[120px]">${escapeHtml(g)}</span>
      </span>`;
}

/**
 * Fila de la tabla de leads con el marcado original: badge de gestion,
 * 2025 para origen historico, WhatsApp deshabilitado solo con telefono
 * limpio, y acciones por permisos (archivar solo admin y no historico).
 * @param {object} lead
 * @param {{leadId: string|number, origin: string, isAdmin: boolean}} ctx
 * @returns {string}
 */
export function filaLeadHtml(lead, { leadId, origin, isAdmin }) {
  const originBadge = origin === 'historico'
    ? '<span class="text-[11px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shrink-0">2025</span>'
    : '';
  const mes = getField(lead, 'Mes');
  const fecha = getField(lead, 'Fecha');
  const nombre = getField(lead, 'Nombre') || 'Sin Nombre';
  const telefono = getField(lead, 'Telefono');
  const campana = getField(lead, 'Campaña');
  const medio = getField(lead, 'Medio');
  const gestion = getField(lead, 'GESTION') || 'Información';
  const agente = getField(lead, 'Agente ') || getField(lead, 'Agente') || '-';
  const badgeHtml = badgeGestionHtml(gestion);
  const cleanPhone = telefono.replace(/\D/g, '');
  return `<tr class="hover:bg-slate-800/80 transition-colors group">
          <td class="px-3.5 py-3 font-mono text-[11px] text-slate-400 tabular-nums">#${leadId}</td>
          <td class="px-3.5 py-3 text-slate-300">
            <div class="font-medium text-white">${escapeHtml(fecha || '-')}</div>
            <div class="text-[11px] text-slate-500">${escapeHtml(mes || '')}</div>
          </td>
          <td class="px-3.5 py-3">
            <div class="flex flex-col gap-1">
              <button data-ev="click:openViewLeadModal('${escapeAttr(leadId)}', '${origin}')" class="font-semibold text-white hover:text-indigo-400 transition-colors cursor-pointer truncate max-w-[190px] block text-left">
                ${escapeHtml(nombre)}
              </button>
              ${nuevoBadge(lead)}
            </div>
          </td>
          <td class="px-3.5 py-3 text-slate-300">
            <div class="flex items-center gap-1.5">
              ${cleanPhone ? `
                <button type="button" disabled title="Disponible cuando se conecte la API de WhatsApp" aria-label="WhatsApp deshabilitado hasta conectar la API" class="p-1 rounded bg-slate-700/50 text-slate-400 opacity-60 cursor-not-allowed">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
              <span class="font-mono text-[11px]">${escapeHtml(telefono || 'S/N')}</span>
            </div>
          </td>
          <td class="px-3.5 py-3 text-slate-300 truncate max-w-[150px]">${escapeHtml(campana || '-')}</td>
          <td class="px-3.5 py-3 text-slate-400 text-[11px] truncate max-w-[110px]">${escapeHtml(medio || '-')}</td>
          <td class="px-3.5 py-3">
            <div class="flex flex-col items-start gap-1">
              <div class="flex flex-wrap items-center gap-1.5">
                ${badgeHtml}
                ${originBadge}
              </div>
              ${interesadoBadge(lead)}
            </div>
          </td>
          <td class="px-3.5 py-3 text-slate-300 text-[11px]">${escapeHtml(agente)}</td>
          <td class="px-3.5 py-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              <button data-ev="click:openEditLeadModal('${escapeAttr(leadId)}', '${origin}')" title="Editar seguimiento" class="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 transition-colors cursor-pointer">
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              </button>
              ${isAdmin && origin !== 'historico' ? `<button data-ev="click:archiveLead('${escapeAttr(leadId)}', '${origin}')" title="Archivar" class="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-amber-300 transition-colors cursor-pointer"><i data-lucide="archive" class="w-3.5 h-3.5"></i></button>` : ''}
              <button data-ev="click:openViewLeadModal('${escapeAttr(leadId)}', '${origin}')" title="Ver detalles completos" class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 transition-colors cursor-pointer">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>`;
}

/** Estado vacio de la tabla de leads. */
export function tablaVaciaLeadsHtml() {
  return `<tr>
          <td colspan="9" class="leads-table-empty">
            <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 text-slate-600"></i>
            <p class="text-sm font-semibold">No se encontraron leads con los filtros actuales.</p>
            <p class="mt-1 text-xs">Prueba con otros criterios o limpia los filtros para ver los registros.</p>
            <button type="button" data-ev="click:resetAllFilters()">Limpiar filtros</button>
          </td>
        </tr>`;
}

/** Texto de la info de paginacion (o 'Sin registros'). */
export function infoPaginacion(start, end, total) {
  return total > 0 ? `Mostrando ${start.toLocaleString()} a ${end.toLocaleString()} de ${total.toLocaleString()} registros` : 'Sin registros';
}

/** Rango de paginas con '...' segun la posicion (1..total). */
export function rangoPaginacion(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

/** Controles de paginacion (flechas con disabled en bordes, activa, movil). */
export function controlesPaginacionHtml(currentPage, totalPages) {
  let html = '';
  html += `<button aria-label="Página anterior" data-ev="click:goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled class="pagination-arrow px-2 py-1 rounded bg-slate-800 text-slate-600 cursor-not-allowed"' : 'class="pagination-arrow px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"'}>
        <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
      </button>`;
  rangoPaginacion(currentPage, totalPages).forEach(p => {
    if (p === '...') {
      html += `<span class="pagination-ellipsis px-2 py-1 text-slate-500">...</span>`;
    } else {
      const isActive = p === currentPage;
      html += `<button data-ev="click:goToPage(${p})" aria-label="Ir a la página ${p}" ${isActive ? 'aria-current="page"' : ''} class="pagination-page-number px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}">
            ${p}
          </button>`;
    }
  });
  html += `<span class="pagination-mobile-label hidden" aria-live="polite">Página ${currentPage} de ${totalPages}</span>`;
  html += `<button aria-label="Página siguiente" data-ev="click:goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled class="pagination-arrow px-2 py-1 rounded bg-slate-800 text-slate-600 cursor-not-allowed"' : 'class="pagination-arrow px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"'}>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
      </button>`;
  return html;
}

// --- Piezas puras de la ficha del lead (fase 26) -----------------------------

/** Notas del lead: vacio, fecha es-ES, 'editada', edicion inline y acciones admin. */
export function notasLeadHtml(notas, { isAdmin, editingNoteId } = {}) {
  const lista = notas || [];
  if (!lista.length) return '<p class="text-[11px] text-slate-500">Sin notas registradas.</p>';
  return lista.map(n => {
    const fecha = n.created_at ? new Date(n.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const edited = n.updated_at && n.updated_at !== n.created_at ? ' · editada' : '';
    const editing = isAdmin && editingNoteId === Number(n.id);
    const actions = editing ? `
          <div class="flex items-center gap-1.5 shrink-0">
            <button data-ev="click:saveLeadNoteInline(${Number(n.id)})" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold cursor-pointer transition-colors">Guardar</button>
            <button data-ev="click:cancelLeadNoteEdit()" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium cursor-pointer transition-colors border border-slate-700">Cancelar</button>
          </div>` : isAdmin ? `
          <div class="flex items-center gap-1 shrink-0">
            <button data-ev="click:editLeadNote(${Number(n.id)})" title="Editar nota" class="p-1 rounded bg-slate-800 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"><i data-lucide="pencil" class="w-3 h-3"></i></button>
            <button data-ev="click:deleteLeadNote(${Number(n.id)})" title="Borrar nota" class="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
          </div>` : '';
    const body = editing
      ? `<textarea id="leadNoteEditInput" rows="3" maxlength="2000" class="w-full bg-slate-950 border border-indigo-500 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none resize-y">${escapeHtml(n.note)}</textarea>`
      : `<p class="text-xs text-slate-300 whitespace-pre-line leading-relaxed break-words">${escapeHtml(n.note)}</p>`;
    return `<div data-note-id="${Number(n.id)}" class="flex items-start justify-between gap-2 border-b border-slate-800 last:border-0 pb-2 last:pb-0">
          <div class="min-w-0 flex-1 space-y-0.5">
            <div class="flex items-center gap-2 text-[11px]">
              <span class="text-indigo-300 font-semibold">${escapeHtml(n.author_name || 'Agente')}</span>
              <span class="text-slate-500">${escapeHtml(fecha)}${escapeHtml(edited)}</span>
            </div>
            ${body}
          </div>
          ${actions}
        </div>`;
  }).join('');
}

/** Cambios de gestion del lead: fecha dd/mm/yyyy, flecha con anterior y canal normalizado. */
export function gestionesLeadHtml(gestiones) {
  const lista = gestiones || [];
  if (!lista.length) return '<p class="text-[11px] text-slate-500">Sin cambios registrados todavía.</p>';
  return lista.map(g => {
    const fecha = String(g.fecha_gestion || '').split('-').reverse().join('/') || '-';
    const anterior = String(g.gestion_anterior || '').trim();
    const estados = anterior
      ? `${badgeGestionHtml(anterior)} <span class="text-slate-500 mx-1">→</span> ${badgeGestionHtml(g.gestion_nueva || '-')}`
      : badgeGestionHtml(g.gestion_nueva || '-');
    return `<div class="border-b border-slate-800 last:border-0 pb-2 last:pb-0 space-y-1">
          <div class="flex items-center gap-2 text-[11px]"><span class="text-slate-300 font-medium">${escapeHtml(fecha)}</span>${estados}</div>
          <div class="text-[11px] text-slate-400">${escapeHtml((g.is_data_dura === true && String(g.canal || '').trim().toLowerCase() === 'llamada') ? 'Llamada Data Dura' : (String(g.canal || '') === 'Llamada y WhatsApp' ? 'Llamada WhatsApp' : (g.canal || '-')))} · ${escapeHtml(g.autor_name || 'Agente')}</div>
        </div>`;
  }).join('');
}

/**
 * Seleccion de la lista rapida: hasta ocho leads ordenados por id descendente.
 * La consulta de inscripciones usa la misma seleccion, de modo que solo se
 * consulta a las personas que realmente se muestran.
 * @param {Array<object>} leads
 * @returns {Array<object>}
 */
export function quickLeadsSelection(leads) {
  return [...(leads || [])].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8);
}

/**
 * Etiquetas de programa y nivel de una persona (inscripcion vigente).
 * Una etiqueta por programa; el nivel va al lado de la marca.
 * @param {Array<{programa?: string, nivel?: string}>} filas
 * @returns {string} HTML (vacio si no hay inscripciones).
 */
export function quickInscripcionesHtml(filas, sinEnvolver = false) {
  const lista = (filas || []).filter(f => f && f.programa);
  if (!lista.length) return '';
  const etiquetas = lista.map(f => {
    const programa = programaPorId(f.programa);
    const clase = programa?.tag || 'border-slate-600/60 bg-slate-900/40 text-slate-300';
    const marca = programa?.marca || '?';
    return `<span class="inline-flex items-center gap-1 rounded-full border ${clase} px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"><span class="font-bold">${escapeHtml(marca)}</span>${escapeHtml(f.nivel || '')}</span>`;
  }).join('');
  return sinEnvolver ? etiquetas : `<span class="quick-lead-programas">${etiquetas}</span>`;
}

/**
 * Cuatro leads recientes del conjunto filtrado; mismo marcado y orden numerico.
 * Con `ctx.prioridad === 'inscrito'` la segunda columna pasa a mostrar el
 * programa y nivel (una etiqueta por programa) en lugar de la campana.
 * @param {Array<object>} leads
 * @param {{prioridad?: string, inscripciones?: Map<string, Array<object>>, estado?: string}} [ctx]
 * @returns {string}
 */
export function quickLeadsHtml(leads, ctx = {}) {
  const rows = quickLeadsSelection(leads);
  if (!rows.length) {
    return '<div class="quick-leads-empty"><p class="text-sm font-semibold">No hay leads con los filtros seleccionados.</p><p class="mt-1 text-xs">Prueba con otros criterios o limpia los filtros para ver los registros.</p><button type="button" data-ev="click:resetAllFilters()">Limpiar filtros</button></div>';
  }
  const prioridad = ctx.prioridad || '';
  const inscripciones = ctx.inscripciones || null;
  const estado = ctx.estado || 'listo';
  return rows.map(lead => {
    const id = String(lead.id);
    const origin = getLeadOrigin(lead);
    const nombre = getField(lead, 'Nombre') || 'Sin nombre';
    const campana = getField(lead, 'Campaña') || 'Sin campaña';
    const fecha = getField(lead, 'Fecha') || 'Sin fecha';
    const gestion = getField(lead, 'GESTION') || 'Sin estado';
    // Las inscripciones solo existen para los leads actuales: el historico
    // comparte ids numericos con el actual y no debe mostrar sus programas.
    const filas = prioridad === 'inscrito' && origin === 'actual'
      ? (inscripciones?.get?.(id) || [])
      : [];
    let columna;
    if (prioridad !== 'inscrito') {
      columna = `<span class="quick-lead-campaign quick-lead-meta text-slate-300">${escapeHtml(campana)}</span>`;
    } else {
      // La columna de inscripcion es siempre la misma: etiquetas, aviso de
      // pendiente, cargando o error, para que la vista no cambie de forma.
      let contenido;
      if (filas.length) contenido = quickInscripcionesHtml(filas, true);
      else if (estado === 'error') contenido = '<span class="text-[11px] text-rose-300">No se pudieron cargar las inscripciones</span> <button type="button" data-quick-action="retry-inscripciones" class="rounded-lg border border-slate-600 px-2 py-1 font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer">Reintentar</button>';
      else if (estado === 'cargando') contenido = '<span class="text-[11px] text-slate-400">Cargando…</span>';
      else contenido = '<span class="text-[11px] text-amber-300">Inscripción pendiente de completar</span>';
      columna = `<span class="quick-lead-programas">${contenido}</span>`;
    }
    return `<div class="quick-lead-row text-xs">
          <div class="quick-lead-meta"><button type="button" data-quick-action="view" data-lead-id="${escapeAttr(id)}" data-origin="${origin}" class="font-semibold text-left text-white hover:text-indigo-400 cursor-pointer">${escapeHtml(nombre)}</button><p class="mt-1 text-slate-400">${escapeHtml(fecha)}${origin === 'historico' ? ' · Histórico 2025' : ''}${prioridad === 'inscrito' ? ` · ${escapeHtml(campana)}` : ''}</p></div>
          ${columna}
          <span class="quick-lead-status">${badgeGestionHtml(gestion)}</span>
          <div class="quick-lead-actions">
            <button type="button" disabled title="Disponible cuando se conecte la API de WhatsApp" aria-label="WhatsApp deshabilitado hasta conectar la API" class="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-400 opacity-60 cursor-not-allowed">WhatsApp · Próximamente</button>
            <button type="button" data-quick-action="edit" data-lead-id="${escapeAttr(id)}" data-origin="${origin}" class="rounded-lg border border-indigo-500/40 px-3 py-1.5 font-semibold text-indigo-300 hover:bg-indigo-500/10 cursor-pointer">Gestionar</button>
            <button type="button" data-quick-action="view" data-lead-id="${escapeAttr(id)}" data-origin="${origin}" class="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer">Ver ficha</button>
          </div>
        </div>`;
  }).join('');
}

// --- Repetidos y primera entrada de la ficha (fase 29) ----------------------

/**
 * Posibles repetidos del lead: misma clave de telefono (>= 7 digitos) en todas
 * las fuentes, un solo recorrido por array; se excluye el propio registro por
 * par origen+id (los ids numericos colisionan entre 'actual' e 'historico').
 * @param {object} lead
 * @param {Array<Array<object>>} fuentes - Arrays de leads a recorrer (actual e historico).
 * @param {string} finalOrigin - Origen del lead en pantalla.
 * @returns {Array<object>}
 */
export function relacionadosPorTelefono(lead, fuentes, finalOrigin) {
  const phoneKey = normalizePhone(getField(lead, 'Telefono'));
  if (phoneKey.length < 7) return [];
  const relacionados = [];
  for (const arr of fuentes || []) {
    for (const l of arr) {
      if (getLeadOrigin(l) === finalOrigin && String(l.id) === String(lead.id)) continue;
      if (normalizePhone(getField(l, 'Telefono')) === phoneKey) relacionados.push(l);
    }
  }
  return relacionados;
}

/**
 * Primera entrada como lead: fecha minima entre este registro y sus
 * relacionados; null si no hay relacionados o ninguna fecha parseable.
 * @param {object} lead
 * @param {Array<object>} relacionados
 * @returns {{ firstTs: number, firstFecha: string, firstIsHistorico: boolean }|null}
 */
export function primeraEntradaLead(lead, relacionados) {
  if (!relacionados || !relacionados.length) return null;
  let firstTs = parseFechaLead(lead);
  let firstFecha = getField(lead, 'Fecha').trim();
  let firstIsHistorico = getLeadOrigin(lead) === 'historico';
  [...relacionados, lead].forEach(l => {
    const ts = parseFechaLead(l);
    if (ts !== null && (firstTs === null || ts < firstTs)) {
      firstTs = ts;
      firstFecha = getField(l, 'Fecha').trim();
      firstIsHistorico = getLeadOrigin(l) === 'historico';
    }
  });
  if (firstTs === null) return null;
  return { firstTs, firstFecha, firstIsHistorico };
}

/**
 * Orden de repetidos: fecha dd/mm/yyyy -> created_at parseable -> id numero,
 * descendente; empate final por compareLeadIdsDescending. Nunca muta la entrada.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function ordenRepetidos(items) {
  const sortKey = (l) => {
    const m = String(getField(l, 'Fecha') || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const t = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      if (!Number.isNaN(t)) return t;
    }
    const c = Date.parse(l.created_at || '');
    if (!Number.isNaN(c)) return c;
    const n = Number(l.id);
    return Number.isFinite(n) ? n : 0;
  };
  return [...items].sort((a, b) => sortKey(b) - sortKey(a) || compareLeadIdsDescending(a, b));
}

/**
 * Filas <li> del bloque de repetidos: badges 2025/2026, marca 'Este lead' en el
 * registro en pantalla, observaciones truncadas a 160 con ellipsis y espacios
 * compactados, y botón Abrir en los relacionados (nunca en el propio).
 * @param {Array<object>} items - Ya ordenados con ordenRepetidos.
 * @param {string} finalOrigin - Origen del lead en pantalla.
 * @param {object|string|number} leadId - Id del lead en pantalla.
 * @returns {string}
 */
export function bloqueRepetidosHtml(items, finalOrigin, leadId) {
  return (items || []).map(l => {
    const itemOrigin = getLeadOrigin(l);
    const esActual = itemOrigin === finalOrigin && String(l.id) === String(leadId);
    const yearBadge = itemOrigin === 'historico'
      ? '<span class="text-[11px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">2025</span>'
      : '<span class="text-[11px] uppercase px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 border border-slate-600/60 font-semibold">2026</span>';
    const obsRaw = (getField(l, 'OBSERVACIONES ') || '').replace(/\s+/g, ' ').trim();
    const obs = obsRaw.length > 160 ? obsRaw.slice(0, 160) + '…' : obsRaw;
    return `<li class="flex items-start justify-between gap-3 border-b border-slate-800 last:border-0 py-2">
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-slate-200 font-medium">${escapeHtml(getField(l, 'Fecha') || '-')}</span>
                  <span class="text-slate-500 font-mono">#${escapeHtml(String(l.id))}</span>
                  ${yearBadge}
                  ${esActual ? '<span class="text-[11px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold">Este lead</span>' : ''}
                </div>
                <div class="text-[11px] text-slate-400 truncate">${escapeHtml(getField(l, 'Campaña') || '-')} · ${escapeHtml(getField(l, 'Medio') || '-')}</div>
                <div class="text-[11px] text-slate-400">Agente: ${escapeHtml(getField(l, 'Agente ') || '-')}</div>
                <div>${badgeGestionHtml(getField(l, 'GESTION'))}</div>
                ${obs ? `<p class="text-[11px] text-slate-500 leading-snug">${escapeHtml(obs)}</p>` : ''}
              </div>
              ${esActual ? '' : `<button data-ev="click:openLeadFromView('${itemOrigin}', '${escapeAttr(l.id)}')" class="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 border border-slate-700 text-[11px] font-medium cursor-pointer transition-colors">Abrir</button>`}
            </li>`;
  }).join('');
}

/**
 * Banner de primera entrada como lead (solo cuando la minima es historica).
 * @param {string} firstFecha - Fecha textual de la primera entrada.
 * @param {number} firstYear - Anio UTC de la primera entrada.
 * @returns {string}
 */
export function bannerPrimeraEntradaHtml(firstFecha, firstYear) {
  return `
        <div class="bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-3.5 py-2 flex items-center gap-2">
          <i data-lucide="calendar-clock" class="w-4 h-4 text-indigo-300 shrink-0"></i>
          <span class="text-xs text-indigo-200">Primera entrada como lead: <span class="font-semibold">${escapeHtml(firstFecha)}</span> <span class="text-indigo-300">(${firstYear})</span></span>
        </div>`;
}

/**
 * Bloque "Posible lead repetido" + banner de primera entrada (fase 30). La
 * deteccion por telefono y las filas ya son puras (fase 29); esta pieza solo
 * compone el bloque con el telefono de referencia del lead en pantalla.
 * @param {object} lead - Lead en pantalla.
 * @param {Array<Array<object>>} fuentes - Fuentes hibridas actual+historico.
 * @param {string} finalOrigin - Origen del lead en pantalla.
 * @returns {{repetidosHtml: string, firstEntryHtml: string}}
 */
export function repetidosYBannerHtml(lead, fuentes, finalOrigin) {
  const relacionados = relacionadosPorTelefono(lead, fuentes, finalOrigin);
  if (!relacionados.length) return { repetidosHtml: '', firstEntryHtml: '' };
  const first = primeraEntradaLead(lead, relacionados);
  const firstEntryHtml = first && first.firstIsHistorico
    ? bannerPrimeraEntradaHtml(first.firstFecha, new Date(first.firstTs).getUTCFullYear())
    : '';
  const items = ordenRepetidos([...relacionados, lead]);
  const filas = bloqueRepetidosHtml(items, finalOrigin, lead.id);
  const telefono = getField(lead, 'Telefono');
  const total = items.length;
  return {
    repetidosHtml: `
          <div class="bg-slate-900/50 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <span class="text-[11px] uppercase text-amber-400 font-semibold flex items-center gap-1.5">
              <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
              <span>Posible lead repetido</span>
            </span>
            <span class="px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-amber-500/15 text-amber-300 border-amber-500/30">${total} registros</span>
          </div>
          <p class="text-[11px] text-slate-400">Teléfono ${escapeHtml(formatPhone(telefono) || 'S/N')} — la coincidencia es por número de teléfono.</p>
          <ol class="space-y-0">${filas}</ol>
        </div>`,
    firstEntryHtml,
  };
}

/**
 * Plantilla completa de la ficha (ver lead) del monolito (fase 30). Pura: los
 * fragmentos ya calculados (banner de primera entrada, aviso de alcance y
 * bloque de repetidos) entran por ctx; el estado global nunca se importa.
 * @param {object} lead - Lead en pantalla.
 * @param {{finalOrigin: string, alcanceCompleto: boolean, firstEntryHtml: string, repetidosHtml: string}} ctx
 * @returns {string}
 */
export function fichaLeadHtml(lead, ctx) {
  ctx = ctx || {};
  const finalOrigin = ctx.finalOrigin;
  const firstEntryHtml = ctx.firstEntryHtml;
  const repetidosHtml = ctx.repetidosHtml;
  const telRaw = getField(lead, 'Telefono');
  const telefonoFmt = formatPhone(telRaw);
  const cleanPhone = telRaw.replace(/\D/g, '');
  const duplicateScopeHtml = ctx.alcanceCompleto ? '' : `
        <p class="text-[11px] text-slate-500">Las coincidencias telefónicas se revisan sobre los datos cargados. Selecciona el origen “Todos” para comprobar la base completa.</p>`;
  return `
        <div class="lead-detail-hero flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="lead-detail-avatar" aria-hidden="true">${escapeHtml(String(getField(lead, 'Nombre') || '?').trim().charAt(0))}</span>
            <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="lead-detail-name font-bold">${escapeHtml(getField(lead, 'Nombre'))}</div>
              ${finalOrigin === 'historico' ? '<span class="text-[11px] uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">Histórico 2025</span>' : ''}
            </div>
            <div class="lead-detail-meta text-xs mt-1 flex flex-wrap items-center gap-2">
              <span>ID: #${escapeHtml(String(lead.id))}</span>
              <span>•</span>
              <span>Ingreso: ${escapeHtml(getField(lead, 'Fecha'))} (${escapeHtml(getField(lead, 'Mes'))})</span>
            </div>
            </div>
          </div>
          <div>${badgeGestionHtml(getField(lead, 'GESTION'))}</div>
        </div>${firstEntryHtml}

        <div class="lead-detail-grid grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 gap-2">
          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="phone" class="w-3 h-3 shrink-0"></i>Teléfono / WhatsApp</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              ${cleanPhone ? `<button type="button" disabled title="Disponible cuando se conecte la API de WhatsApp" aria-label="WhatsApp deshabilitado hasta conectar la API" class="text-slate-400 opacity-60 cursor-not-allowed"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i></button>` : ''}
              <span class="lead-detail-value font-mono">${escapeHtml(telefonoFmt || 'S/N')}</span>
            </div>
          </div>

          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="megaphone" class="w-3 h-3 shrink-0"></i>Campaña</span>
            <span class="lead-detail-value font-medium mt-0.5 block truncate">${escapeHtml(getField(lead, 'Campaña') || '-')}</span>
          </div>

          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="radio" class="w-3 h-3 shrink-0"></i>Medio</span>
            <span class="lead-detail-value font-medium mt-0.5 block">${escapeHtml(getField(lead, 'Medio') || '-')}</span>
          </div>

          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="user-round" class="w-3 h-3 shrink-0"></i>Asesor Principal</span>
            <span class="lead-detail-value font-medium mt-0.5 block">${escapeHtml(getField(lead, 'Agente ') || '-')}</span>
          </div>

          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="user-check" class="w-3 h-3 shrink-0"></i>Último Asesor</span>
            <span class="lead-detail-value font-medium mt-0.5 block">${escapeHtml(getField(lead, 'ULTIMO AGENTE ') || '-')}</span>
          </div>

          <div class="lead-detail-card">
            <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-500 font-semibold block"><i data-lucide="calendar" class="w-3 h-3 shrink-0"></i>Última Gestión</span>
            <span class="lead-detail-value font-medium mt-0.5 block">${escapeHtml(getField(lead, 'Fecha Última Gestión ') || '-')}</span>
          </div>
        </div>${duplicateScopeHtml}${repetidosHtml}

        <div class="lead-detail-section space-y-1">
          <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-400 font-semibold block"><i data-lucide="notebook-text" class="w-3 h-3 shrink-0"></i>Historial de Observaciones</span>
          <p class="text-slate-300 font-mono text-xs whitespace-pre-line leading-relaxed">${escapeHtml(getField(lead, 'OBSERVACIONES ') || 'Sin observaciones registradas.')}</p>
         </div>${finalOrigin === 'historico' ? '' : `
         <div id="leadGestionesSection" class="hidden lead-detail-section space-y-2">
           <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-400 font-semibold block"><i data-lucide="messages-square" class="w-3 h-3 shrink-0"></i>Historial de gestiones</span>
           <div id="leadGestionesList"><p class="text-[11px] text-slate-500">Cargando historial…</p></div>
         </div>
         <div class="lead-detail-section space-y-2">
          <span class="flex items-center gap-1.5 text-[11px] uppercase text-slate-400 font-semibold block"><i data-lucide="pen-line" class="w-3 h-3 shrink-0"></i>Notas del Equipo</span>
          <div id="leadNotesList" class="space-y-2"><p class="text-[11px] text-slate-500">Cargando notas…</p></div>
          <div class="lead-note-compose flex items-start gap-2 pt-1">
            <textarea id="leadNoteInput" rows="2" maxlength="2000" placeholder="Añadir una nota para el equipo" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-y"></textarea>
            <button id="leadNoteSubmit" data-ev="click:addLeadNote()" class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0 flex items-center gap-1.5">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i><span>Añadir</span>
            </button>
           </div>
         </div>`}
          ${finalOrigin === 'historico' ? '' : `<div id="leadAppointmentsSection" class="lead-detail-section space-y-3">
            <div class="flex items-center justify-between gap-2"><span class="text-[11px] uppercase text-slate-400 font-semibold">Citas</span><button type="button" data-ev="click:openHelpModal('ayuda-citas')" title="Ayuda: citas del lead" aria-label="Ayuda sobre la gestión de citas del lead" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-700 hover:bg-indigo-600 text-[10px] font-bold text-slate-100 cursor-pointer shrink-0">?</button></div>
            <div id="leadAppointmentCreate" class="${isAgendadoGestion(getField(lead, 'GESTION')) ? '' : 'hidden'}">
            <form id="leadAppointmentForm" data-ev="submit:createLeadAppointment(event)" class="grid sm:grid-cols-[auto_1fr_auto] gap-2 items-end">
             <label class="text-[11px] text-slate-400">Fecha y hora<input id="leadAppointmentDate" type="datetime-local" required class="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></label>
             <div class="lead-appointment-campus sm:col-span-3 flex items-center gap-3"><span class="text-[11px] text-slate-400">Sede de la cita *</span><label class="inline-flex items-center gap-1 text-[11px] text-slate-200"><input type="radio" name="leadAppointmentCampus" value="DORAL" required class="accent-indigo-500"> Doral</label><label class="inline-flex items-center gap-1 text-[11px] text-slate-200"><input type="radio" name="leadAppointmentCampus" value="WESTON" required class="accent-indigo-500"> Weston</label></div>
             <label class="text-[11px] text-slate-400">Nota opcional<textarea id="leadAppointmentNote" maxlength="2000" rows="1" class="block w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></textarea></label>
             <div id="leadAppointmentAdvisorWrap" class="hidden"><label class="text-[11px] text-slate-400">Asesor<select id="leadAppointmentAdvisor" class="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"><option value="">Cargando…</option></select></label></div>
             <label class="text-[11px] text-slate-400">Nombre del estudiante (opcional)<input id="leadAppointmentStudentName" type="text" maxlength="200" class="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></label>
             <label class="text-[11px] text-slate-400">Correo de contacto (opcional)<input id="leadAppointmentContactEmail" type="email" maxlength="254" class="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100" placeholder="nombre@correo.com"></label>
             <label class="text-[11px] text-slate-400">Edad (opcional)<input id="leadAppointmentStudentAge" type="number" min="0" max="120" step="1" class="block mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"></label>
             <button id="leadAppointmentSubmit" data-appointment-create class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Crear cita</button>
            </form>
            </div>
            <p id="leadAppointmentNotice" class="${isAgendadoGestion(getField(lead, 'GESTION')) ? 'hidden' : 'text-[11px] text-slate-500'}">El lead no está agendado; no se pueden crear nuevas citas.</p>
           <div id="leadAppointmentsList"><p class="text-[11px] text-slate-500">Cargando citas…</p></div>
         </div>`}

        <div class="flex justify-end pt-2">
          ${finalOrigin === 'historico'
            ? '<span class="text-[11px] text-slate-500 italic">Registro histórico de solo lectura (2025)</span>'
            : `<button data-ev="click:openEditLeadFromView('${escapeAttr(lead.id)}', '${finalOrigin}')" class="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1.5 text-xs cursor-pointer">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            <span>Editar este Lead</span>
          </button>`}
        </div>
      `;
}

// --- Formularios de alta/edicion (fase 34 del strangler) ----------------------
/**
 * Fecha textual de llegada tal como la mostraba handleCreateLead: del input
 * 'YYYY-MM-DD' a 'dd/mm/aaaa' (los componentes se copian sin rellenos nuevos).
 * Pura: recibe la fecha seleccionada (el wrapper ya rechazo fechas futuras y
 * el formato invalido) y el hoy de Miami como respaldo cuando no hay fecha.
 * @param {string} fechaSel - Valor del input de fecha ('' si vacio).
 * @param {string} hoyMiami - 'YYYY-MM-DD' de miamiToday().
 * @returns {string}
 */
export function fechaLlegadaDisplay(fechaSel, hoyMiami) {
  const [year, month, day] = (fechaSel || hoyMiami).split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Payload exacto de alta (p_lead del RPC create_lead*). Las claves, su orden
 * y los literales con espacios finales ('Información ') son contrato con la
 * base de datos; replica byte a byte el objeto que handleCreateLead armaba
 * inline (golden en scripts/tests/fixtures/fase34-golden.json, fase 34).
 * ctx.nombreAcceso es currentAccess?.nombre: para la asesora AGENTE toma ese
 * valor tal cual (puede ser undefined/null, como en HEAD).
 * v.interesadoEn es opcional: si viene con texto, se anade la clave
 * "INTERESADO EN" (dato informativo que se guarda en la MISMA operacion).
 * @param {object} v - Valores crudos leidos por el wrapper (siempre string).
 * @param {{isAdmin: boolean, nombreAcceso: *}} ctx
 * @returns {object}
 */
export function leadCreatePayload(v, ctx) {
  const payload = {
    "Nombre": v.nombre.trim() || 'Sin Nombre',
    "Telefono": formatPhone(v.telefono.trim() || ''),
    "Mes": v.mes || '',
    "Fecha": v.fechaHoy,
    "Campaña": v.campana || 'Sin definir',
    "Medio": v.medio || 'Whatsapp',
    "GESTION": v.gestion || 'Información ',
    "ULTIMA GESTION": v.ultimaGestion || 'WhatsApp',
    "AGENTE": ctx.isAdmin ? (v.agente.trim() || ctx.nombreAcceso || 'Agente') : ctx.nombreAcceso,
    "Ciudad": v.ciudad.trim() || '',
    "OBSERVACIONES": v.observaciones.trim() || 'Nuevo lead registrado desde el panel.'
  };
  // "INTERESADO EN" (dato informativo, opcional): solo viaja si hay algo
  // elegido; si no, la columna queda vacia.
  const interesado = String(v.interesadoEn ?? '').trim();
  if (interesado) payload["INTERESADO EN"] = interesado;
  return payload;
}

/**
 * Campos de edicion (p_fields / p_lead de update_lead*) que handleUpdateLead
 * armaba inline (fase 34; golden en fixtures/fase34-golden.json). Regla del
 * telefono: una asesora solo lo envia si cambio (formatPhone de valor vs
 * dataset.original) para no bloquear historicos vacios; el admin lo incluye
 * SIEMPRE via Object.assign — sobrescribiendo la clave existente sin moverla
 * de su posicion, detalle de orden que la fixture fija con payloadKeys.
 * @param {object} v - Valores crudos: nombre, gestion, fechaUltima,
 *   ultimaGestion, observaciones, telefono, telOriginal, mes, fecha, campana,
 *   medio, ciudad, agenteAdmin, odoo, fechaAtencion, landing (todos string).
 *   interesadoEn es opcional: si viene (undefined = no tocar), se anade la
 *   clave "INTERESADO EN" para que viaje en la misma operacion.
 * @param {{isAdmin: boolean, nombreAcceso: *}} ctx
 * @returns {object}
 */
export function leadUpdateFields(v, ctx) {
  const updatedFields = {
    "Nombre": v.nombre.trim() || 'Sin Nombre',
    "GESTION": v.gestion || 'Información ',
    "Fecha Última Gestión": v.fechaUltima.trim() || '',
    "ULTIMA GESTION": v.ultimaGestion || 'Llamada',
    "OBSERVACIONES": v.observaciones.trim() || ''
  };
  const telNuevo = formatPhone(v.telefono.trim() || '');
  const telOriginal = formatPhone(v.telOriginal || '');
  if (telNuevo !== telOriginal) updatedFields["Telefono"] = telNuevo;
  if (ctx.isAdmin) {
    Object.assign(updatedFields, {
      "Telefono": formatPhone(v.telefono.trim() || ''),
      "Mes": v.mes.trim() || '',
      "Fecha": v.fecha.trim() || '',
      "Campaña": v.campana.trim() || '',
      "Medio": v.medio.trim() || '',
      "Ciudad": v.ciudad.trim() || '',
      "AGENTE": v.agenteAdmin.trim() || ctx.nombreAcceso || '',
      "Odoo": v.odoo.trim() || '',
      "Fecha de Atencion": v.fechaAtencion.trim() || '',
      "LANDING": v.landing.trim() || ''
    });
  }
  // "INTERESADO EN" (dato informativo, opcional): solo viaja si CAMBIO, para
  // no pisar lo que ya tenia el lead. Una cadena vacia lo quita.
  if (v.interesadoEn !== undefined) updatedFields["INTERESADO EN"] = String(v.interesadoEn).trim();
  return updatedFields;
}

/**
 * Traduce errores del guardado de leads a mensajes de toast (movida tal cual
 * de handleCreateLead/handleUpdateLead, fase 34). `agendado` llega del
 * monolito pero HEAD no lo usaba: la firma se conserva intacta.
 * @param {*} error - Objeto { message, code } del RPC de Supabase.
 * @param {boolean} agendado - Sin uso (firma historica).
 * @returns {string}
 */
export function formatSaveErrorLead(error, agendado) {
  // agendado: deliberadamente sin uso; ver JSDoc (no romper la firma del wrapper).
  const m = String(error?.message || '');
  if (String(error?.code || '').includes('PGRST202') || m.includes('Could not find the function')) return 'La aplicación necesita actualizarse. Recarga la página con Ctrl + F5 e inténtalo de nuevo';
  if (m.includes('appointment_required_for_agendado_transition') || m.includes('agendado_transition_required')) return 'Un lead agendado necesita fecha y hora de cita';
  if (m.includes('appointment_email_invalid')) return 'Correo de contacto no válido';
  if (m.includes('appointment_age_invalid')) return 'Edad no válida';
  if (m.includes('campus_invalid')) return 'Sede no válida';
  if (m.includes('advisor_not_active')) return 'Asesor no activo';
  if (m.includes('campaign_not_in_catalog')) return 'Campaña no disponible';
  if (m.includes('fecha_llegada_invalida')) return 'Fecha de llegada no válida';
  if (m.includes('scheduled_at_required')) return 'Fecha y hora de cita requeridas';
  if (m.includes('notes_too_long')) return 'Nota demasiado larga';
  if (!m) return 'No se pudo conectar para guardar. Revisa tu conexión e inténtalo nuevamente';
  return 'No se pudo guardar. Revisa los datos e inténtalo nuevamente';
}

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') {
  window.sortMonthCatalog = sortMonthCatalog;
  window.normalizePhone = normalizePhone;
  window.isNuevoEsteMes = isNuevoEsteMes;
  window.nuevoBadge = nuevoBadge;
  window.interesadoBadge = interesadoBadge;
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
  window.badgeGestionHtml = badgeGestionHtml;
  window.filaLeadHtml = filaLeadHtml;
  window.tablaVaciaLeadsHtml = tablaVaciaLeadsHtml;
  window.infoPaginacion = infoPaginacion;
  window.rangoPaginacion = rangoPaginacion;
  window.controlesPaginacionHtml = controlesPaginacionHtml;
  window.notasLeadHtml = notasLeadHtml;
  window.gestionesLeadHtml = gestionesLeadHtml;
  window.quickLeadsHtml = quickLeadsHtml;
  window.quickLeadsSelection = quickLeadsSelection;
  window.quickInscripcionesHtml = quickInscripcionesHtml;
  window.relacionadosPorTelefono = relacionadosPorTelefono;
  window.primeraEntradaLead = primeraEntradaLead;
  window.ordenRepetidos = ordenRepetidos;
  window.bloqueRepetidosHtml = bloqueRepetidosHtml;
  window.bannerPrimeraEntradaHtml = bannerPrimeraEntradaHtml;
  window.fichaLeadHtml = fichaLeadHtml;
  window.repetidosYBannerHtml = repetidosYBannerHtml;
  window.fechaLlegadaDisplay = fechaLlegadaDisplay;
  window.leadCreatePayload = leadCreatePayload;
  window.leadUpdateFields = leadUpdateFields;
  window.formatSaveErrorLead = formatSaveErrorLead;
}

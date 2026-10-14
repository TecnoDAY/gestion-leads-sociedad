/**
 * Capa 2 del patron strangler: helpers puros del area Leads extraidos del
 * monolito index.html. Sin DOM ni estado de sesion; importan helpers.js y
 * reportes.js directamente para seguir testeandose en node. El script clasico
 * sigue resolviendolos via window.* (registro al final de este modulo).
 */

import { compareAlphaEs, compareLeadIdsDescending, consolidateLeadsById, escapeAttr, escapeHtml, getField, miamiToday, sortAlphaEs } from './helpers.js';
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
            <div class="flex flex-col gap-1.5">
              <button data-ev="click:openViewLeadModal('${escapeAttr(leadId)}', '${origin}')" class="font-semibold text-white hover:text-indigo-400 transition-colors cursor-pointer truncate max-w-[190px] block">
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
            ${badgeHtml}
            ${originBadge}
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

/** Cuatro leads recientes del conjunto filtrado; mismo marcado y orden numerico. */
export function quickLeadsHtml(leads) {
  const rows = [...leads].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 4);
  if (!rows.length) {
    return '<div class="quick-leads-empty"><p class="text-sm font-semibold">No hay leads con los filtros seleccionados.</p><p class="mt-1 text-xs">Prueba con otros criterios o limpia los filtros para ver los registros.</p><button type="button" data-ev="click:resetAllFilters()">Limpiar filtros</button></div>';
  }
  return rows.map(lead => {
    const id = String(lead.id);
    const origin = getLeadOrigin(lead);
    const nombre = getField(lead, 'Nombre') || 'Sin nombre';
    const campana = getField(lead, 'Campaña') || 'Sin campaña';
    const fecha = getField(lead, 'Fecha') || 'Sin fecha';
    const gestion = getField(lead, 'GESTION') || 'Sin estado';
    return `<div class="quick-lead-row text-xs">
          <div class="quick-lead-meta"><button type="button" data-quick-action="view" data-lead-id="${escapeAttr(id)}" data-origin="${origin}" class="font-semibold text-left text-white hover:text-indigo-400 cursor-pointer">${escapeHtml(nombre)}</button><p class="mt-1 text-slate-400">${escapeHtml(fecha)}${origin === 'historico' ? ' · Histórico 2025' : ''}</p></div>
          <span class="quick-lead-campaign quick-lead-meta text-slate-300">${escapeHtml(campana)}</span>
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
  window.badgeGestionHtml = badgeGestionHtml;
  window.filaLeadHtml = filaLeadHtml;
  window.tablaVaciaLeadsHtml = tablaVaciaLeadsHtml;
  window.infoPaginacion = infoPaginacion;
  window.rangoPaginacion = rangoPaginacion;
  window.controlesPaginacionHtml = controlesPaginacionHtml;
  window.notasLeadHtml = notasLeadHtml;
  window.gestionesLeadHtml = gestionesLeadHtml;
  window.quickLeadsHtml = quickLeadsHtml;
  window.relacionadosPorTelefono = relacionadosPorTelefono;
  window.primeraEntradaLead = primeraEntradaLead;
  window.ordenRepetidos = ordenRepetidos;
  window.bloqueRepetidosHtml = bloqueRepetidosHtml;
  window.bannerPrimeraEntradaHtml = bannerPrimeraEntradaHtml;
}

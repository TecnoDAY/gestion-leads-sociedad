/**
 * Capa 2 del patron strangler: helpers puros de las areas Reportes/Historico/
 * Campanas extraidos del monolito index.html. Sin DOM ni estado de sesion.
 * Importan helpers.js directamente (getField, miamiToday) para seguir
 * testeandose en node. El script clasico sigue resolviendolos via window.*
 * (registro al final de este modulo); las llamadas quedaron intactas.
 */

import { compareAlphaEs, consolidateLeadsById, escapeAttr, escapeHtml, getField, miamiToday } from './helpers.js';

// Meses en orden cronologico canonico; nunca alfabetico. Fuente unica.
export const MONTH_CHRONO = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/**
 * Fecha de entrada del lead como timestamp UTC (o null si no hay fecha valida).
 * Unico punto de parseo de fechas: d/m/aaaa, d-m-aaaa, d/m/aa y aaaa-mm-dd.
 * @param {object} lead
 * @returns {number|null} Timestamp UTC de medianoche.
 */
export function parseFechaLead(lead) {
  const raw = getField(lead, 'Fecha').trim();
  if (!raw) return null;
  const parts = raw.split(/[/-]/);
  if (parts.length !== 3 || !parts.every(p => /^\d+$/.test(p))) return null;
  let day, month, year;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    year = Number(parts[0]); month = Number(parts[1]); day = Number(parts[2]);
  } else {
    day = Number(parts[0]); month = Number(parts[1]); year = Number(parts[2]);
    if (year < 100) year += 2000;
  }
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (month < 1 || month > 12 || day < 1 || year < 2000 || year > 2100) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  const ts = Date.UTC(year, month - 1, day);
  return Number.isNaN(ts) ? null : ts;
}

/**
 * Normaliza el mes de un lead: 'Mes' como fuente principal, 'Fecha'
 * (d/m/aaaa, d-m-aaaa o d/m/aa) de respaldo. 'OTRO' si nada cuadra.
 * @param {object} lead
 * @returns {string} Mes canonico en mayusculas u 'OTRO'.
 */
export function normalizeLeadMonth(lead) {
  const raw = getField(lead, 'Mes').trim().toUpperCase();
  const fromMes = MONTH_CHRONO.find(m => raw.includes(m));
  if (fromMes) return fromMes;

  const ts = parseFechaLead(lead);
  if (ts !== null) return MONTH_CHRONO[new Date(ts).getUTCMonth()];
  return 'OTRO';
}

/**
 * Un lead inscrito es "data dura" cuando su mes de origen difiere del mes del
 * reporte o cuando la inscripcion es de un ano anterior a la fecha de reporte.
 * @param {object} lead
 * @param {string} fecha - Fecha del reporte (YYYY-MM-DD).
 * @returns {boolean}
 */
export function isInscritoDataDura(lead, fecha) {
  const month = normalizeLeadMonth(lead);
  const origin = leadReportDate(lead);
  const report = leadReportDate({ Fecha: fecha });
  if (!report) return false;
  return MONTH_CHRONO.includes(month) && (month !== MONTH_CHRONO[report.mesIdx] || (origin !== null && origin.anio !== report.anio));
}

/**
 * Fecha del lead como {anio, mesIdx} UTC o null si no hay fecha valida.
 * @param {object} lead
 * @returns {{anio:number, mesIdx:number}|null}
 */
export function leadReportDate(lead) {
  const ts = parseFechaLead(lead);
  if (ts === null) return null;
  const d = new Date(ts);
  return { anio: d.getUTCFullYear(), mesIdx: d.getUTCMonth() };
}

/**
 * Clave ano-mes ('2026-03'): Mes canonico + ano de Fecha.
 * El mes de Fecha solo sirve de respaldo cuando Mes es desconocido.
 * Sin fecha: 'SIN-FECHA·ENERO' u 'OTRO'. ENERO 2025 no es ENERO 2026.
 * @param {object} lead
 * @returns {string}
 */
export function histMonthKey(lead) {
  const r = leadReportDate(lead);
  const month = normalizeLeadMonth(lead);
  if (r) return `${r.anio}-${String(MONTH_CHRONO.indexOf(month) + 1).padStart(2, '0')}`;
  return month !== 'OTRO' ? `SIN-FECHA·${month}` : 'OTRO';
}

/**
 * Etiqueta legible de una clave de mes del historico.
 * @param {string} key
 * @returns {string}
 */
export function histMonthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  if (m) return `${MONTH_CHRONO[Number(m[2]) - 1]} ${m[1]}`;
  if (typeof key === 'string' && key.startsWith('SIN-FECHA·')) return `${key.slice(10)} (sin fecha)`;
  return 'OTRO';
}

/**
 * Orden cronologico de claves de mes; SIN-FECHA y OTRO al final.
 * @param {Array<string>} keys
 * @returns {Array<string>} Nueva lista ordenada (no muta la entrada).
 */
export function sortHistMonthKeys(keys) {
  const rank = k => /^(\d{4})-(\d{2})$/.test(k) ? `0${k}` : (k === 'OTRO' ? '2OTRO' : `1${k}`);
  return [...keys].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
}

/**
 * Normaliza el estado de gestion: trim, colapso de espacios internos y mayusculas.
 * @param {object} lead
 * @returns {string}
 */
export function normalizeGestion(lead) {
  return getField(lead, 'GESTION').trim().replace(/\s+/g, ' ').toUpperCase();
}

// Prefijos de estado reconocidos (variantes tipo 'AGENDADO 12/09' se agrupan); si no coincide, se usa el estado completo.
export const GESTION_STATE_GROUPS = [
  ['INSCRIT', 'INSCRITO'],
  ['AGENDADO DATA DURA', 'AGENDADO DATA DURA'],
  ['AGENDADO DATADURA', 'AGENDADO DATA DURA'],
  ['AGENDAD', 'AGENDADO'],
  ['NO CONTEST', 'NO CONTESTA'],
  ['INFORMACIÓN', 'INFORMACIÓN'],
  ['INFORMACION', 'INFORMACIÓN'],
  ['INTERESADO', 'INTERESADO']
];

/**
 * Agrupa un estado de gestion canonico segun GESTION_STATE_GROUPS.
 * @param {string} gestion
 * @returns {string}
 */
export function groupGestionEstado(gestion) {
  if (!gestion) return 'SIN ESTADO';
  const hit = GESTION_STATE_GROUPS.find(([prefix]) => gestion.startsWith(prefix));
  return hit ? hit[1] : gestion;
}

/**
 * Rango de fechas de un preset del reporte por periodo, anclado a hoy Miami.
 * @param {string} preset - 'mes' | '7d' | '30d' | 'semana'.
 * @param {string} [today] - Fecha base YYYY-MM-DD; por defecto hoy Miami.
 *   Parametro de inyeccion: los tests fijan el reloj para ser deterministas.
 * @returns {[string, string]|null} [desde, hasta] en YYYY-MM-DD.
 */
export function periodoPresetRange(preset, today = miamiToday()) {
  const date = new Date(`${today}T12:00:00Z`);
  const shift = days => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  if (preset === 'mes') return [today.slice(0, 7) + '-01', today];
  if (preset === '7d' || preset === '30d') return [shift(preset === '7d' ? -6 : -29), today];
  if (preset === 'semana') { const monday = -((date.getUTCDay() + 6) % 7); return [shift(monday), shift(monday + 6)]; }
  return null;
}

/**
 * Valida una fecha YYYY-MM-DD real (rechaza 2026-02-30 y formatos raros).
 * @param {string} value
 * @returns {boolean}
 */
export function periodoValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Porcentaje con 2 decimales y sufijo %; 0% si el total es 0.
 * @param {number} count
 * @param {number} total
 * @returns {string}
 */
export function periodoPct(count, total) { return (total ? count / total * 100 : 0).toFixed(2) + '%'; }

/**
 * Campo CSV seguro: comillas dobles doblando comillas internas y
 * neutralizacion de prefijos peligrosos (=, +, -, @) anteponiendo apostrofe.
 * @param {*} value
 * @returns {string}
 */
export function csvReporteField(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Total de canales coherente con la pantalla: solo las categorias que se muestran.
 * @param {object} canales
 * @returns {number}
 */
export function totalCanalesVisibles(canales) {
  const c = canales || {};
  // Suma TODOS los buckets de canal que emite daily_management_report
  // (coherencia del reporte: nada se suma que no se vea; los retirados
  // 'visita conservatorio' y 'sin canal' viajan juntos en 'Otros o sin canal').
  return ['llamada', 'data_dura', 'llamada_whatsapp', 'whatsapp', 'instagram', 'visita', 'sin_clasificar'].reduce((a, k) => a + (Number(c[k]) || 0), 0);
}

/**
 * Coste por resultado con 2 decimales; guion largo si no hay resultados.
 * @param {number} gasto
 * @param {number} resultados
 * @returns {string}
 */
export function campaignCosteResultado(gasto, resultados) {
  return resultados > 0 ? (gasto / resultados).toFixed(2) : '—';
}

/**
 * Suma los totales de campana para todas las metricas conocidas.
 * @param {Array<object>} rows
 * @returns {object}
 */
export function campaignTotals(rows) {
  const totals = { alcance: 0, gasto: 0, resultados: 0, leads_nuevos: 0, agendados: 0, asistieron: 0, inscritos: 0, agendados_previos: 0, pendientes: 0 };
  rows.forEach(r => Object.keys(totals).forEach(k => { totals[k] += Number(r[k]) || 0; }));
  return totals;
}

// Agregación mensual compartida por render y export CSV (cierra la deuda de historicos-mensuales T3).
// Devuelve también contadores de estados/campañas y el embudo usados por los gráficos.
// T5: la clave es año-mes ('2026-03'; ENERO 2025 ≠ ENERO 2026). Sin fecha
// válida se agrupa por Mes declarado ('SIN-FECHA·…') u 'OTRO', que siempre
// aparece si tiene datos.
// No cambia la semántica de "Agendados" (incluye AGENDAD* sin distinguir
// canceladas/reprogramadas; pendiente de definición humana).
export function computeHistoricalAggregates(data) {
  const monthlyStats = {};
  const statBucket = key => {
    if (!monthlyStats[key]) monthlyStats[key] = { total: 0, inscritos: 0, agendados: 0, noContesta: 0, campanas: {}, agentes: {} };
    return monthlyStats[key];
  };

  const stateTotals = {};
  const stateByMonth = {};
  const campTotals = {};
  const campByMonth = {};
  let funnelGestionados = 0;

  data.forEach(l => {
    const key = histMonthKey(l);
    const stats = statBucket(key);
    stats.total++;

    const gestion = normalizeGestion(l);
    const inscrito = gestion.includes('INSCRIT');
    if (inscrito) stats.inscritos++;
    if (gestion.includes('AGENDAD')) stats.agendados++;
    if (gestion.includes('NO CONTEST')) stats.noContesta++;
    if (gestion && gestion !== 'INFORMACIÓN' && gestion !== 'INTERESADO') funnelGestionados++;

    const estado = groupGestionEstado(gestion);
    stateTotals[estado] = (stateTotals[estado] || 0) + 1;
    if (!stateByMonth[key]) stateByMonth[key] = {};
    stateByMonth[key][estado] = (stateByMonth[key][estado] || 0) + 1;

    const camp = getField(l, 'Campaña').trim() || 'General';
    stats.campanas[camp] = (stats.campanas[camp] || 0) + 1;
    campTotals[camp] = (campTotals[camp] || 0) + 1;
    if (!campByMonth[key]) campByMonth[key] = {};
    campByMonth[key][camp] = (campByMonth[key][camp] || 0) + 1;

    const agent = getField(l, 'Agente ').trim() || 'Sin asignar';
    if (inscrito) {
      stats.agentes[agent] = (stats.agentes[agent] || 0) + 1;
    }
  });

  const activeMonths = sortHistMonthKeys(Object.keys(monthlyStats).filter(k => monthlyStats[k].total > 0));

  return { monthlyStats, activeMonths, stateTotals, stateByMonth, campTotals, campByMonth, funnelGestionados };
}

/**
 * Filas mensuales del resumen historico (fuente unica de la tabla y del
 * CSV): etiqueta de mes, totales del agregado, % conversion, % del total
 * y top campana/agente con empate conservando el primer valor ('>' estricto).
 * conv y monthPct son strings toFixed(1) SIN '%'; cada consumidor agrega
 * su presentacion (to, escape, chip).
 * @param {Array<object>} data Leads ya filtrados por el panel.
 * @returns {Array<{mes: string, total: number, agendados: number, noContesta: number, inscritos: number, conv: string, monthPct: string, topCamp: string, topAg: string}>}
 */
export function historicalSummaryRows(data) {
  const leids = Array.isArray(data) ? data : [];
  const { monthlyStats, activeMonths } = computeHistoricalAggregates(leids);
  const totalLeads = leids.length;

  return activeMonths.map(m => {
    const st = monthlyStats[m];
    const conv = st.total > 0 ? ((st.inscritos / st.total) * 100).toFixed(1) : '0.0';
    const monthPct = totalLeads > 0 ? ((st.total / totalLeads) * 100).toFixed(1) : '0.0';

    let topCamp = '-';
    let topCampCount = 0;
    Object.entries(st.campanas).forEach(([c, cnt]) => {
      if (cnt > topCampCount) { topCampCount = cnt; topCamp = c; }
    });

    let topAg = '-';
    let topAgCount = 0;
    Object.entries(st.agentes).forEach(([a, cnt]) => {
      if (cnt > topAgCount) { topAgCount = cnt; topAg = a; }
    });

    return {
      mes: histMonthLabel(m),
      total: st.total,
      agendados: st.agendados,
      noContesta: st.noContesta,
      inscritos: st.inscritos,
      conv,
      monthPct,
      topCamp,
      topAg,
    };
  });
}

/**
 * Resumen historico como CSV completo (cabecera + una fila por mes activo),
 * capa de escape sobre historicalSummaryRows: mismos headers y campos
 * que el export original, cada campo por csvReporteField del modulo.
 * @param {Array<object>} data Leads ya filtrados por el panel.
 * @returns {{csv: string, months: number}} csv listo para downloadCSV.
 */
export function historicalSummaryCsv(data) {
  const rows = historicalSummaryRows(data);
  const headers = ['Mes', 'Total Leads', 'Agendados', 'No Contesta', 'Inscritos', '% Conversión', '% del Total', 'Campaña Más Fuerte', 'Asesor con Más Cierres'];
  const lines = rows.map(r => [
    r.mes, r.total, r.agendados, r.noContesta, r.inscritos,
    r.conv + '%', r.monthPct + '%', r.topCamp, r.topAg,
  ].map(csvReporteField).join(','));
  return { csv: [headers.join(','), ...lines].join('\n'), months: rows.length };
}

/**
 * KPIs superiores del panel historico: totales por estado y % conversion.
 * Misma semantica del render original: includes sobre normalizeGestion
 * (INSCRIT/AGENDAD/NO CONTEST) y toFixed(1) con '0.0' cuando no hay data.
 * @param {Array<object>} data Leads ya filtrados por el panel.
 * @returns {{totalLeads: number, totalInscritos: number, totalAgendados: number, totalNoContesta: number, convRate: string}}
 */
export function historicalKpiTotals(data) {
  const leids = Array.isArray(data) ? data : [];
  const totalLeads = leids.length;
  const totalInscritos = leids.filter(l => normalizeGestion(l).includes('INSCRIT')).length;
  const totalAgendados = leids.filter(l => normalizeGestion(l).includes('AGENDAD')).length;
  const totalNoContesta = leids.filter(l => normalizeGestion(l).includes('NO CONTEST')).length;
  const convRate = totalLeads > 0 ? ((totalInscritos / totalLeads) * 100).toFixed(1) : '0.0';
  return { totalLeads, totalInscritos, totalAgendados, totalNoContesta, convRate };
}

/**
 * Mes record del panel historico: maximo de total por mes activo con
 * comparador estricto (el empate conserva el primero de activeMonths) y
 * etiqueta legible via histMonthLabel. '-' y 0 ante datos insuficientes.
 * @param {object} monthlyStats Salida de computeHistoricalAggregates.
 * @param {string[]} activeMonths Meses activos ordenados.
 * @returns {{month: string, count: number}}
 */
export function historicalRecordMonth(monthlyStats, activeMonths) {
  let recordMonth = '-';
  let recordCount = 0;
  const stats = monthlyStats || {};
  (Array.isArray(activeMonths) ? activeMonths : []).forEach(m => {
    if (stats[m] && stats[m].total > recordCount) {
      recordCount = stats[m].total;
      recordMonth = histMonthLabel(m);
    }
  });
  return { month: recordMonth, count: recordCount };
}

/** Medios retirados del negocio (CogniTalking y variantes con errata del
 * valor almacenado): sus leads siguen contando, pero ningun reporte,
 * grafico ni CSV muestra el nombre; se agrupan bajo 'Otros'. */
export const esMedioRetirado = label => /^cogni\s*talk/i.test(String(label ?? '').trim());

/** Etiqueta visible de un medio en listados, ficha y exportaciones: los
 * retirados del negocio se muestran como 'Otros'; el dato guardado no cambia. */
export const medioVisible = m => esMedioRetirado(m) ? 'Otros' : String(m ?? '').trim();

/**
 * Series de datos de los 8 graficos del panel historico (logica pura).
 * Recibe los agregados y KPIs ya calculados por el render para no
 * recomputar. Replica el original: top6 campanas/medios/asesores, top6
 * estados + 'Otros', top5 campanas mensuales + 'Otras' y embudo fijo.
 * @param {Array<object>} data Leads ya filtrados por el panel.
 * @param {object} aggregates Salida de computeHistoricalAggregates.
 * @param {{totalAgendados?: number, totalInscritos?: number}} kpis Salida de historicalKpiTotals.
 */
export function historicalChartSeries(data, aggregates, kpis) {
  const leids = Array.isArray(data) ? data : [];
  const agg = aggregates || {};
  const monthlyStats = agg.monthlyStats || {};
  const activeMonths = Array.isArray(agg.activeMonths) ? agg.activeMonths : [];
  const totalLeads = leids.length;

  const monthly = {
    inscritos: activeMonths.map(k => (monthlyStats[k] || {}).inscritos || 0),
    total: activeMonths.map(k => (monthlyStats[k] || {}).total || 0),
    conversion: activeMonths.map(k => {
      const st = monthlyStats[k] || {};
      return st.total > 0 ? Number(((st.inscritos / st.total) * 100).toFixed(1)) : 0;
    }),
  };

  const campMap = {};
  leids.forEach(l => {
    const c = getField(l, 'Campaña').trim() || 'Sin Campaña';
    if (!campMap[c]) campMap[c] = { total: 0, inscritos: 0 };
    campMap[c].total++;
    if (normalizeGestion(l).includes('INSCRIT')) campMap[c].inscritos++;
  });
  const sortedCamps = Object.entries(campMap).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  const campaigns = {
    labels: sortedCamps.map(c => c[0]),
    totals: sortedCamps.map(c => c[1].total),
    inscritos: sortedCamps.map(c => c[1].inscritos),
  };

  const medioCounts = {};
  leids.forEach(l => {
    const crudo = getField(l, 'Medio').trim();
    // Medio retirado del negocio: cuenta en el resto del grafico, sin nombre.
    const m = crudo && !esMedioRetirado(crudo) ? crudo : 'Directo/Otro';
    medioCounts[m] = (medioCounts[m] || 0) + 1;
  });
  const sortedMedios = Object.entries(medioCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const medios = {
    labels: sortedMedios.map(m => m[0]),
    counts: sortedMedios.map(m => m[1]),
  };

  const agentMap = {};
  leids.forEach(l => {
    const a = getField(l, 'Agente ').trim() || 'Sin Asignar';
    if (!agentMap[a]) agentMap[a] = { total: 0, inscritos: 0 };
    agentMap[a].total++;
    if (normalizeGestion(l).includes('INSCRIT')) agentMap[a].inscritos++;
  });
  const sortedAgents = Object.entries(agentMap).filter(a => a[0] !== 'Sin Asignar' || a[1].total > 2).sort((a, b) => b[1].inscritos - a[1].inscritos).slice(0, 6);
  const agents = {
    labels: sortedAgents.map(a => a[0]),
    totals: sortedAgents.map(a => a[1].total),
    inscritos: sortedAgents.map(a => a[1].inscritos),
  };

  const stacked = (totals, byMonth, n, otherLabel) => {
    const topNames = Object.entries(totals || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
    const series = topNames.map(s => ({
      label: s,
      data: activeMonths.map(m => ((byMonth || {})[m] && byMonth[m][s]) || 0),
    }));
    let other = null;
    if (Object.keys(totals || {}).length > topNames.length) {
      other = {
        label: otherLabel,
        data: activeMonths.map(m => {
          const monthStats = (monthlyStats[m] || { total: 0 });
          const inTop = topNames.reduce((sum, s) => sum + (((byMonth || {})[m] && byMonth[m][s]) || 0), 0);
          return Math.max(monthStats.total - inTop, 0);
        }),
      };
    }
    return { series, other };
  };

  const statesStacked = stacked(agg.stateTotals, agg.stateByMonth, 6, 'Otros');
  const campsStacked = stacked(agg.campTotals, agg.campByMonth, 5, 'Otras');

  const funnel = {
    stages: ['Recibidos', 'Gestionados', 'Agendados', 'Inscritos'],
    values: [totalLeads, agg.funnelGestionados || 0, (kpis && kpis.totalAgendados) || 0, (kpis && kpis.totalInscritos) || 0],
  };

  return { monthly, campaigns, medios, agents, statesStacked, campsStacked, funnel };
}

// --- Graficos y tabla historicos: configs y plantillas puras (fase 31) ------
// Cada histChartX devuelve el objeto { type?, data, options } EXACTO que
// renderHistoricalAnalytics pasaba inline a new Chart; canvas, destruccion
// previa (histCharts) y el new Chart quedan en el wrapper del monolito.
// Sin Chart ni window: comparables byte a byte en node contra el golden.

export function tablaVaciaHistoricoHtml() {
  return `<tr><td colspan="9" class="text-center py-6 text-slate-500 font-sans">No hay registros con los filtros seleccionados</td></tr>`;
}

export function tablaHistoricoHtml(filas) {
  return (filas || []).map(r => `
              <tr class="hover:bg-slate-800/40 transition-colors">
                <td class="px-4 py-3 font-semibold text-slate-200">${escapeHtml(r.mes)}</td>
                <td class="px-4 py-3 text-right text-white font-bold tabular-nums">${r.total.toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-amber-400 tabular-nums">${r.agendados.toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-rose-400 tabular-nums">${r.noContesta.toLocaleString()}</td>
                <td class="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">${r.inscritos.toLocaleString()}</td>
                <td class="px-4 py-3 text-right tabular-nums">
                  <span class="px-2 py-0.5 rounded text-xs font-semibold ${Number(r.conv) >= 15 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}">
                    ${r.conv}%
                  </span>
                </td>
                <td class="px-4 py-3 text-right text-slate-400 tabular-nums">${r.monthPct}%</td>
                <td class="px-4 py-3 text-slate-300 font-sans truncate max-w-[180px]">${escapeHtml(r.topCamp)}</td>
                <td class="px-4 py-3 text-slate-300 font-sans">${escapeHtml(r.topAg)}</td>
              </tr>
            `).join('');
}

export function histChartMonthly(labels, series, commonScales) {
  return {
    data: {
      labels: labels,
      datasets: [
        {
          type: 'line',
          label: 'Inscritos Matriculados',
          data: series.monthly.inscritos,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          borderWidth: 3,
          pointRadius: 5,
          tension: 0.3,
          order: 1
        },
        {
          type: 'bar',
          label: 'Total Leads Captados',
          data: series.monthly.total,
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderRadius: 6,
          order: 2
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: commonScales }
  };
}

export function histChartConversion(labels, series, commonScales) {
  return {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tasa de Conversión (%)',
        data: series.monthly.conversion,
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.12)',
        fill: true,
        borderWidth: 2.5,
        tension: 0.35
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { ...commonScales, y: { ...commonScales.y, ticks: { callback: (val) => val + '%' } } }
    }
  };
}

export function histChartCampaign(series, commonScales) {
  return {
    type: 'bar',
    data: {
      labels: series.campaigns.labels,
      datasets: [
        { label: 'Total Leads', data: series.campaigns.totals, backgroundColor: 'rgba(59, 130, 246, 0.65)', borderRadius: 4 },
        { label: 'Inscritos', data: series.campaigns.inscritos, backgroundColor: 'rgba(16, 185, 129, 0.85)', borderRadius: 4 }
      ]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: commonScales }
  };
}

export function histChartMedio(series) {
  return {
    type: 'doughnut',
    data: {
      labels: series.medios.labels,
      datasets: [{
        data: series.medios.counts,
        backgroundColor: ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'],
        borderColor: '#1e293b',
        borderWidth: 2
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, cutout: '65%' }
  };
}

export function histChartAgent(series, commonScales) {
  return {
    type: 'bar',
    data: {
      labels: series.agents.labels,
      datasets: [
        { label: 'Leads Atendidos', data: series.agents.totals, backgroundColor: 'rgba(148, 163, 184, 0.4)', borderRadius: 4 },
        { label: 'Inscripciones Logradas', data: series.agents.inscritos, backgroundColor: '#10b981', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: commonScales }
  };
}

export function histChartMonthlyStates(monthLabels, statesStacked, commonScales) {
  const statePalette = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#60a5fa', '#34d399'];
  const stateDatasets = statesStacked.series.map((s, i) => ({
    ...s,
    backgroundColor: statePalette[i]
  }));
  if (statesStacked.other) {
    stateDatasets.push({ ...statesStacked.other, backgroundColor: 'rgba(100, 116, 139, 0.55)' });
  }
  return {
    type: 'bar',
    data: { labels: monthLabels, datasets: stateDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ...commonScales.x, stacked: true },
        y: { ...commonScales.y, stacked: true }
      }
    }
  };
}

export function histChartMonthlyCampaigns(monthLabels, campsStacked, commonScales) {
  const campPalette = ['#3b82f6', '#f59e0b', '#10b981', '#f43f5e', '#60a5fa'];
  const campDatasets = campsStacked.series.map((c, i) => ({
    ...c,
    backgroundColor: campPalette[i]
  }));
  if (campsStacked.other) {
    campDatasets.push({ ...campsStacked.other, backgroundColor: 'rgba(100, 116, 139, 0.55)' });
  }
  return {
    type: 'bar',
    data: { labels: monthLabels, datasets: campDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ...commonScales.x, stacked: true },
        y: { ...commonScales.y, stacked: true }
      }
    }
  };
}

export function histChartFunnel(funnel, commonScales) {
  const { stages: funnelStages, values: funnelValues } = funnel;
  return {
    type: 'bar',
    data: {
      labels: funnelStages.map((s, i) => `${s}: ${funnelValues[i].toLocaleString()}`),
      datasets: [{
        label: 'Leads',
        data: funnelValues,
        backgroundColor: ['#3b82f6', '#94a3b8', '#f59e0b', '#10b981'],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...commonScales.x, beginAtZero: true },
        y: commonScales.y
      }
    }
  };
}

/**
 * Texto del aviso de rango activo del historico. mismo orden y redaccion
 * del original: desde/hasta, conteo en rango, aviso de mes anulado y
 * excluidos; separador ' · ' con prefijo 'Rango: '. Invasores devuelven
 * cero leads o el aviso de invisible sin lanzar.
 * @param {{rangeActive: boolean, range?: {from: number|null, to: number|null}|null, data?: {length: number}, selectedMes?: string, excludedNoDate?: number}|null} filtered
 * @returns {{visible: boolean, text: string}}
 */
export function histRangeNoticeText(filtered) {
  const f = filtered || {};
  if (!f.rangeActive) return { visible: false, text: '' };
  const range = f.range || { from: null, to: null };
  const parts = [];
  if (range.from !== null) parts.push('desde ' + new Date(range.from).toISOString().slice(0, 10));
  if (range.to !== null) parts.push('hasta ' + new Date(range.to).toISOString().slice(0, 10));
  const count = Array.isArray(f.data) ? f.data.length : 0;
  parts.push(count.toLocaleString() + ' leads en rango');
  if (f.selectedMes) parts.push('el filtro de mes queda anulado por el rango');
  const excluded = typeof f.excludedNoDate === 'number' ? f.excludedNoDate : 0;
  if (excluded > 0) parts.push(excluded.toLocaleString() + ' sin fecha válida excluidos');
  return { visible: true, text: 'Rango: ' + parts.join(' · ') };
}


/**
 * Filtrado puro del panel historico: campana, agente, ano y rango Desde/Hasta.
 * El rango activo tiene precedencia y anula el filtro de mes; los leads sin
 * fecha parseable se excluyen del rango y se cuentan en excludedNoDate.
 * No muta la entrada; las lecturas del DOM quedan en index.html.
 * @param {Array<object>} data Leads base (origen actual/historico/todos ya aplicado).
 * @param {{campana?: string, agente?: string, anio?: string, mes?: string, range?: {from: number|null, to: number|null}|null}} [filters]
 * @returns {{data: Array<object>, rangeActive: boolean, excludedNoDate: number}}
 */
export function applyHistoricalFilters(data, filters = {}) {
  const campana = filters.campana || '';
  const agente = filters.agente || '';
  const anio = filters.anio || '';
  const mes = filters.mes || '';
  const range = filters.range || { from: null, to: null };
  const rangeActive = range.from !== null || range.to !== null;

  let filtered = Array.isArray(data) ? data : [];
  if (campana) filtered = filtered.filter(l => getField(l, 'Campaña').trim() === campana);
  if (agente) filtered = filtered.filter(l => getField(l, 'Agente ').trim() === agente);
  if (anio === 'SIN-FECHA') {
    filtered = filtered.filter(l => leadReportDate(l) === null);
  } else if (anio) {
    filtered = filtered.filter(l => String(leadReportDate(l)?.anio || '') === anio);
  }

  let excludedNoDate = 0;
  if (rangeActive) {
    const inRange = [];
    filtered.forEach(l => {
      const ts = parseFechaLead(l);
      if (ts === null) { excludedNoDate++; return; }
      if (range.from !== null && ts < range.from) return;
      if (range.to !== null && ts > range.to) return;
      inRange.push(l);
    });
    filtered = inRange;
  } else if (mes) {
    filtered = filtered.filter(l => normalizeLeadMonth(l) === mes);
  }
  return { data: filtered, rangeActive, excludedNoDate };
}

/**
 * Parseo del input date del rango historico (contrato exacto del codigo
 * original): regex estricta YYYY-MM-DD; un dia imposible hace rollover
 * sin validacion de calendario (p. ej. 2026-02-30 -> 2026-03-02).
 * @param {string} s Valor del input (o cadena vacia).
 * @returns {number|null} Timestamp UTC de medianoche o null.
 */
export function histDateInputToTs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * Fechas del rango para un preset del historico, como strings YYYY-MM-DD.
 * `todayTs` (medianoche UTC del dia local del navegador) es inyectable para
 * tests deterministas; preset desconocido devuelve null y el wrapper no
 * toca los inputs.
 * @param {string|null} preset 'clear'|'7d'|'30d'|'month' u otro.
 * @param {number} todayTs Timestamp UTC de medianoche de hoy.
 * @returns {{from: string, to: string}|null}
 */
export function histRangePresetDates(preset, todayTs) {
  const fmt = ts => new Date(ts).toISOString().slice(0, 10);
  if (preset === 'clear') return { from: '', to: '' };
  if (preset === '7d') return { from: fmt(todayTs - 6 * 86400000), to: fmt(todayTs) };
  if (preset === '30d') return { from: fmt(todayTs - 29 * 86400000), to: fmt(todayTs) };
  if (preset === 'month') {
    const hoy = new Date(todayTs);
    return { from: fmt(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)), to: fmt(todayTs) };
  }
  return null;
}


/**
 * Construye los valores de filtros historicos sin DOM ni HTML. Los agentes
 * devueltos son los presentes en datos; el wrapper puede unirlos al catalogo
 * activo mediante catalogOptions antes de renderizarlos.
 * @param {Array<object>} data
 * @returns {{campanas: string[], agentes: string[], meses: string[], anios: string[], haySinFecha: boolean}}
 */
export function historicalFilterOptions(data) {
  const campanas = new Set();
  const agentes = new Set();
  const meses = new Set();
  const anios = new Set();
  let haySinFecha = false;

  (Array.isArray(data) ? data : []).forEach(lead => {
    const campana = getField(lead, 'Campaña').trim();
    const agente = getField(lead, 'Agente ').trim();
    if (campana) campanas.add(campana);
    if (agente) agentes.add(agente);
    meses.add(normalizeLeadMonth(lead));
    const reportDate = leadReportDate(lead);
    if (reportDate) anios.add(String(reportDate.anio));
    else haySinFecha = true;
  });

  const mesesOrdenados = MONTH_CHRONO.filter(month => meses.has(month));
  if (meses.has('OTRO')) mesesOrdenados.push('OTRO');
  return {
    campanas: [...campanas].sort(compareAlphaEs),
    agentes: [...agentes].sort(compareAlphaEs),
    meses: mesesOrdenados,
    anios: [...anios].sort(),
    haySinFecha,
  };
}

/**
 * Resumen del reporte por periodo: consolida leads, filtra por rango de
 * fechas y arma categorias (catalogo activo + extras no conocidos),
 * totales y matriz gestion x campana. Valida internamente antes de
 * publicar. Lanza 'period_range_invalid' si el rango es invalido.
 * @param {Array<object>} leads
 * @param {object} catalogs Filas de catalogo por tipo ({medio,campana,gestion}).
 * @param {string} desde YYYY-MM-DD.
 * @param {string} hasta YYYY-MM-DD.
 * @returns {object} Resumen validado.
 */
export function buildPeriodSummary(leads, catalogs, desde, hasta) {
  if (!periodoValidDate(desde) || !periodoValidDate(hasta) || desde > hasta) throw new Error('period_range_invalid');
  const desdeTs = Date.parse(`${desde}T00:00:00Z`), hastaTs = Date.parse(`${hasta}T00:00:00Z`);
  const activos = consolidateLeadsById(leads || []).filter(lead => !lead.archived_at);
  const norma = value => String(value ?? '').trim().toLocaleLowerCase('es');
  const nuevaCategoria = kind => {
    const porClave = new Map();
    for (const row of catalogs?.[kind] || []) {
      if (!row?.active) continue;
      const label = String(row.value ?? '').trim();
      const clave = norma(label);
      if (!clave || porClave.has(clave)) continue; // duplicado case-insensitive: gana el primero
      porClave.set(clave, { label, count: 0 });
    }
    return porClave;
  };
  const categorias = { medio: nuevaCategoria('medio'), campana: nuevaCategoria('campana'), gestion: nuevaCategoria('gestion') };
  // El catalogo puede traer medios retirados del negocio: no abren fila propia
  // para que el nombre no aparezca en el reporte; sus leads se reportan bajo 'Otros'.
  for (const clave of [...categorias.medio.keys()]) if (esMedioRetirado(clave)) categorias.medio.delete(clave);
  const extras = { medio: new Map(), campana: new Map(), gestion: new Map() };
  const celdas = new Map();
  let fechasInvalidas = 0;
  const seleccion = [];
  for (const lead of activos) {
    const ts = parseFechaLead(lead);
    if (ts === null) { fechasInvalidas++; continue; } // del conjunto cargado, excluidos
    if (ts >= desdeTs && ts <= hastaTs) seleccion.push(lead);
  }
  const registrar = (kind, rawValue) => {
    const trimmed = String(rawValue ?? '').trim() || 'Sin definir';
    const clave = norma(trimmed);
    const catalogo = categorias[kind].get(clave);
    if (catalogo) { catalogo.count++; return catalogo.label; }
    let extra = extras[kind].get(clave);
    if (!extra) { extra = { label: trimmed, count: 0 }; extras[kind].set(clave, extra); }
    extra.count++;
    return extra.label;
  };
  // Una sola pasada: medios, campañas, gestiones y matriz salen de esta selección.
  for (const lead of seleccion) {
    const medioCrudo = getField(lead, 'Medio');
    const medio = registrar('medio', esMedioRetirado(medioCrudo) ? 'Otros' : medioCrudo);
    const campana = registrar('campana', getField(lead, 'Campaña'));
    const gestion = registrar('gestion', getField(lead, 'GESTION'));
    const clave = `${gestion}\u0000${campana}`;
    celdas.set(clave, (celdas.get(clave) || 0) + 1);
  }
  const lista = kind => {
    const resto = [...extras[kind].values()];
    if (!extras[kind].has('sin definir') && !categorias[kind].has('sin definir')) resto.push({ label: 'Sin definir', count: 0 });
    // Todo orden alfabético (categorías de catálogo y extras juntas).
    return [...categorias[kind].values(), ...resto].sort((a, b) => compareAlphaEs(a.label, b.label));
  };
  const medios = lista('medio'), campanas = lista('campana'), gestiones = lista('gestion');
  const total = seleccion.length;
  const matriz = {
    campanas: campanas.map(r => r.label),
    filas: gestiones.map(g => ({ label: g.label, counts: campanas.map(c => celdas.get(`${g.label}\u0000${c.label}`) || 0), total: g.count })),
    totales_columnas: campanas.map(c => c.count),
  };
  const summary = { desde, hasta, total, fechas_invalidas: fechasInvalidas, medios, campanas, gestiones, matriz, totales: { medios: total, campanas: total, gestiones: total, matriz: total } };
  return validatePeriodoSummary(summary, desde, hasta); // comprobaciones internas antes de publicar
}

/**
 * Valida la coherencia de un resumen de periodo antes de publicarlo:
 * totales por categoria igual al total, matriz alineada con categorias y
 * sumas por fila/columna cuadradas. Lanza mensaje claro si algo no cuadra.
 * @param {object} data
 * @param {string} desde
 * @param {string} hasta
 * @returns {object} El mismo data si es valido.
 */
export function validatePeriodoSummary(data, desde, hasta) {
  const fail = () => { throw new Error('Los totales del reporte no coinciden o la respuesta es inválida. Actualiza e informa al administrador si persiste.'); };
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const sum = rows => rows.reduce((total, row) => total + row.count, 0);
  if (!data || data.desde !== desde || data.hasta !== hasta || !count(data.total) || !count(data.fechas_invalidas)) fail();
  for (const key of ['medios', 'campanas', 'gestiones']) {
    const rows = data[key];
    if (!Array.isArray(rows) || !rows.length || rows.some(r => !r || typeof r.label !== 'string' || !count(r.count)) || new Set(rows.map(r => r.label.toLowerCase())).size !== rows.length || sum(rows) !== data.total || data.totales?.[key] !== data.total) fail();
  }
  const m = data.matriz;
  if (!m || !Array.isArray(m.campanas) || !Array.isArray(m.filas) || !Array.isArray(m.totales_columnas) || m.campanas.length !== data.campanas.length || m.filas.length !== data.gestiones.length || m.totales_columnas.length !== m.campanas.length || data.totales?.matriz !== data.total) fail();
  m.filas.forEach((row, i) => {
    if (!row || row.label !== data.gestiones[i].label || !Array.isArray(row.counts) || row.counts.length !== m.campanas.length || !row.counts.every(count) || row.total !== row.counts.reduce((a, b) => a + b, 0) || row.total !== data.gestiones[i].count) fail();
  });
  m.campanas.forEach((label, i) => {
    if (label !== data.campanas[i].label || m.totales_columnas[i] !== data.campanas[i].count || m.filas.reduce((total, r) => total + r.counts[i], 0) !== m.totales_columnas[i]) fail();
  });
  return data;
}

/**
 * Valida la actividad del periodo (RPC management_period_summary): desde/
 * hasta coinciden, gestiones/canales/citas presentes con conteos enteros no
 * negativos y filas por estado coherentes. Lanza mensaje claro si no.
 * @param {object} data
 * @param {string} desde
 * @param {string} hasta
 * @returns {object} El mismo data si es valido.
 */
export function validatePeriodoActividad(data, desde, hasta) {
  const fail = () => { throw new Error('La actividad del período devolvió una respuesta inválida. Actualiza e inténtalo nuevamente.'); };
  const count = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
  if (!data || data.desde !== desde || data.hasta !== hasta) fail();
  for (const key of ['gestiones', 'canales', 'citas']) if (!data[key] || typeof data[key] !== 'object') fail();
  const g = data.gestiones, q = data.canales, c = data.citas;
  if (![g.total_eventos, g.leads_unicos, g.agendados_normales, g.agendados_data_dura, g.inscritos_normales, g.inscritos_data_dura, g.inscripciones_realizadas_normales, g.inscripciones_realizadas_data_dura].every(count)) fail();
  // Las altas reales son un subconjunto de las personas gestionadas estando
  // inscritas, pero las filas usan clasificaciones distintas (la fecha de
  // ingreso para las altas; la etiqueta del evento para los seguimientos),
  // asi que la cota solo vale sobre la suma de ambas columnas.
  if (g.inscripciones_realizadas_normales + g.inscripciones_realizadas_data_dura > g.inscritos_normales + g.inscritos_data_dura) fail();
  if (![q.llamadas_normales, q.llamadas_data_dura, q.llamada_whatsapp, q.whatsapp, q.instagram ?? 0, q.otros].every(count)) fail();
  if (![c.programadas_normales, c.programadas_data_dura, c.asistieron, c.no_asistieron, c.canceladas, c.reprogramadas, c.doral_normal, c.doral_data_dura, c.weston_normal, c.weston_data_dura, c.sin_sede].every(count)) fail();
  if (!Array.isArray(g.por_estado) || g.por_estado.some(r => !r || typeof r.label !== 'string' || !count(r.eventos) || !count(r.leads))) fail();
  return data;
}

/**
 * Lineas del CSV del reporte por periodo (misma estructura del export
 * original): titulo, rango, excluidos, tres bloques de resumen con %,
 * matriz gestion x campana, actividad (por estado ordenado alfabeticamente),
 * canales y agenda. Cada campo pasa por csvReporteField; % via periodoPct.
 * @param {object} summary Resumen validado (buildPeriodSummary).
 * @param {object} actividad Actividad validada (validatePeriodoActividad).
 * @param {string} generado Fecha Miami del momento (el wrapper evalua miamiToday).
 * @returns {string[]} Lineas de texto (unir con \\n para downloadCSV).
 */
export function periodoCsvLines(summary, actividad, generado, inscritosHistorial = null) {
  const d = summary, a = actividad, lines = [], row = values => lines.push(values.map(csvReporteField).join(','));
  row(['Reporte por período']);
  row(['Desde (inclusive)', d.desde, 'Hasta (inclusive)', d.hasta]);
  row(['Gestión actual; no estado histórico al cierre del período']);
  row(['Generado (Miami)', generado]);
  row(['Leads sin fecha válida (excluidos)', d.fechas_invalidas]);
  for (const [title, rows] of [['Captación por medio · leads ingresados', d.medios], ['Captación por campaña · leads ingresados', d.campanas], ['Estado actual de los leads ingresados', d.gestiones]]) {
    row([]); row([title]); row(['Categoría', 'Leads', '%']);
    rows.forEach(r => row([r.label, r.count, periodoPct(r.count, d.total)]));
    row(['TOTAL', d.total, periodoPct(d.total, d.total)]);
  }
  row([]); row(['Matriz estado actual × campaña · leads ingresados']); row(['Gestión', ...d.matriz.campanas, 'Total']);
  d.matriz.filas.forEach(r => row([r.label, ...r.counts, r.total]));
  row(['TOTAL', ...d.matriz.totales_columnas, d.total]);
  if (inscritosHistorial) {
    row([]); row(['Personas inscritas en el período según historial']);
    row(['Una persona por rango; última entrada registrada dentro del rango. Una baja posterior no elimina su inscripción.']);
    row(['Personas inscritas', inscritosHistorial.personas_inscritas]);
    row(['Inscrito', inscritosHistorial.normales]);
    row(['Inscrito Data Dura', inscritosHistorial.data_dura]);
    row(['Sin clase (revisar fechas)', inscritosHistorial.revision]);
    row([]); row(['Inscripciones por campaña (campaña actual del lead)']); row(['Campaña', 'Personas', 'Inscrito', 'Data Dura', 'Sin clase']);
    [...(inscritosHistorial.por_campana || [])].sort((a, b) => compareAlphaEs(a.campana, b.campana)).forEach(r => row([r.campana, r.personas, r.normales, r.data_dura, r.revision]));
    row(['TOTAL', inscritosHistorial.personas_inscritas, inscritosHistorial.normales, inscritosHistorial.data_dura, inscritosHistorial.revision]);
  }
  const ga = a.gestiones, qa = a.canales, ca = a.citas;
  row([]); row(['Actividad realizada en el período (gestiones por fecha trabajada)']); row(['Métrica', 'Cantidad']);
  row(['Leads únicos gestionados', ga.leads_unicos]); row(['Inscripciones realizadas · Inscrito (altas)', ga.inscripciones_realizadas_normales]); row(['Inscripciones realizadas · Data Dura (altas)', ga.inscripciones_realizadas_data_dura]); row(['Gestionados en estado Agendado', ga.agendados_normales]); row(['Gestionados en estado Agendado Data Dura', ga.agendados_data_dura]); row(['Gestionados en estado Inscrito', ga.inscritos_normales]); row(['Gestionados en estado Inscrito Data Dura', ga.inscritos_data_dura]); row(['Total de gestiones', ga.total_eventos]);
  row([]); row(['Gestiones por estado']); row(['Estado', 'Leads únicos', 'Total de gestiones']);
  [...ga.por_estado].sort((a, b) => compareAlphaEs(a.label, b.label)).forEach(r => row([r.label, r.leads, r.eventos]));
  row(['Nota: Leads únicos cuenta personas distintas; Total de gestiones suma todos los intentos. Un mismo lead puede repetirse en varios estados, por eso los leads únicos no se suman.']);
  row([]); row(['Canales de la actividad']); row(['Canal', 'Cantidad']);
  row(['Llamada WhatsApp', qa.llamada_whatsapp]); row(['Llamadas', qa.llamadas_normales]); row(['Llamadas Data Dura', qa.llamadas_data_dura]); row(['Instagram', qa.instagram ?? 0]); row(['Otros o sin canal', qa.otros]); row(['WhatsApp', qa.whatsapp]);
  row([]); row(['Agenda (citas por fecha programada)']); row(['Estado', 'Cantidad']);
  row(['Asistieron', ca.asistieron]); row(['Canceladas', ca.canceladas]); row(['Doral: programadas normales', ca.doral_normal]); row(['Doral: programadas Data Dura', ca.doral_data_dura]); row(['No asistieron', ca.no_asistieron]); row(['Programadas Data Dura', ca.programadas_data_dura]); row(['Programadas normales', ca.programadas_normales]); row(['Reprogramadas', ca.reprogramadas]); row(['Sin sede (programadas)', ca.sin_sede]); row(['Weston: programadas normales', ca.weston_normal]); row(['Weston: programadas Data Dura', ca.weston_data_dura]);
  return lines;
}

/**
 * Lineas CSV del detalle de gestiones del período: una fila por gestion con
 * fecha, hora, nombre, telefono (como texto), asesora que gestiono, asesora
 * asignada, canal, data dura, gestion anterior/nueva, observaciones y la
 * campana del lead. La campana va al final para no mover las columnas que ya
 * consume el archivo.
 * @param {Array<object>} rows Filas ya armadas (ver exportPeriodoGestionesCSV).
 * @param {string} generado Fecha Miami del momento.
 * @returns {string[]} Lineas de texto (unir con \\n para downloadCSV).
 */
export function periodoGestionesCsvLines(rows, generado) {
  const lines = [], row = values => lines.push(values.map(csvReporteField).join(','));
  row(['Detalle de gestiones del período']);
  row(['Generado (Miami)', generado]);
  row([]);
  row(['Fecha', 'Hora', 'Nombre', 'Teléfono', 'Asesora gestión', 'Asesora asignada', 'Canal', 'Data Dura', 'Gestión anterior', 'Gestión nueva', 'Observaciones', 'Campaña']);
  (rows || []).forEach(r => row([
    r.fecha, r.hora, r.nombre,
    // Prefijo apóstrofe para que Excel conserve el teléfono como texto.
    r.telefono ? "'" + r.telefono : '',
    r.asesoraGestion, r.asesoraAsignada, r.canal, r.dataDura,
    r.gestionAnterior, r.gestionNueva, r.observaciones,
    r.campana || ''
  ]));
  return lines;
}
const DIARIO_KEYS = ['gestionados', 'whatsapp', 'facebook', 'directo', 'otros', 'llamadasDia', 'llamadasDura', 'llamadaWhatsapp', 'llamadasTotal', 'agendadosDia', 'agendadosDura', 'agendadosDoral', 'agendadosDoralDura', 'agendadosWeston', 'agendadosWestonDura', 'agendadosTotal', 'reprogramadasHoy', 'visitas', 'noAsistieron', 'canceladas', 'reprogramadas', 'agendadosGestionadosDia', 'agendadosGestionadosDura', 'whatsappNuevos', 'detalleGestionados', 'detalleTotal', 'llamadasNuevos', 'llamadasGestionados', 'llamadasDetalleTotal', 'canalInstagram', 'canalesOtros', 'canalesTotal'];

/** 'Otros o sin canal': buckets retirados de pantalla, juntos. */
const numCanalesOtros = c => (Number(c?.visita) || 0) + (Number(c?.sin_clasificar) || 0);

/** Total del grupo WhatsApp (canales visibles del grupo); los nuevos son un
 * subconjunto. La llamada combinada (llamada_whatsapp) pertenece al grupo de
 * llamadas, no suma aqui. */
export const totalGrupoWhatsapp = canales => (Number(canales?.whatsapp) || 0)
  + (Number(canales?.instagram) || 0)
  + numCanalesOtros(canales);

/** Particion compartida UI/CSV; nuevos llega del SQL (evento de alta del dia).
 * Ausentes/null son cero como en el reporte legado. Grupos disjuntos: WhatsApp
 * (puro, Instagram y otros) y llamadas (normal, Data Dura y llamada WhatsApp). */
export function detalleGestionHoy(b, grupo = 'whatsapp') {
  if (!['whatsapp', 'llamadas'].includes(grupo)) throw new Error('Detalle de gestión no disponible: grupo inválido.');
  const count = value => {
    const n = value == null ? 0 : (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Detalle de gestión no disponible: conteos inválidos. Actualiza el reporte e informa al administrador si persiste.');
    return n;
  };
  const keys = grupo === 'whatsapp' ? ['whatsapp', 'instagram', 'visita', 'sin_clasificar'] : ['llamada', 'data_dura', 'llamada_whatsapp'];
  const total = count(keys.reduce((sum, key) => sum + count(b.canales?.[key]), 0));
  const nuevos = count(b[grupo]?.nuevos);
  if (nuevos > total) throw new Error(`Detalle de gestión no disponible: ${grupo === 'whatsapp' ? 'WhatsApp' : 'Llamadas'} nuevos supera el total. Actualiza el reporte e informa al administrador si persiste.`);
  return { nuevos, gestionados: total - nuevos, total };
}

/** Cabecera del CSV diario (35 columnas: ASESORA + 32 numericas + notas).
 * 'Otros' de procedencia absorbe los medios retirados del negocio (p.ej.
 * CogniTalking) para que el nombre no aparezca; 'Otros o sin canal' agrega
 * los buckets retirados de pantalla (visita conservatorio + sin clasificar)
 * para que el total cuadre. */
const DIARIO_HEADERS = ['Asesora', 'Gestiones realizadas', 'WhatsApp', 'Facebook/Instagram', 'Directo o Referido', 'Otros', 'Llamadas del día', 'Llamadas Data Dura', 'Llamada WhatsApp', 'Total llamadas', 'Citas nuevas hoy', 'Citas nuevas Data Dura', 'Citas nuevas Doral', 'Citas nuevas Data Dura Doral', 'Citas nuevas Weston', 'Citas nuevas Data Dura Weston', 'Total citas nuevas', 'Citas reprogramadas hoy', 'Visitas registradas', 'No asistieron', 'Canceladas', 'Reprogramadas', 'Pasados a Agendado hoy', 'Pasados a Agendado Data Dura hoy', 'WhatsApp nuevos hoy', 'WhatsApp gestionados hoy', 'Total WhatsApp', 'Llamadas nuevos hoy', 'Llamadas gestionados hoy', 'Total llamadas de gestión', 'Canal Instagram', 'Otros o sin canal', 'Total canales', 'Problemas', 'Observaciones'];

/**
 * Resuelve la nota asociada a un bloque del reporte diario con la regla
 * original: primero por autor_user_id; si el bloque no tiene uid, por
 * autor_name contra notas sin uid; fallback b.nota; si nada, {}.
 * @returns {object}
 */
export function resolverNotaBloque(bloque, notas) {
  const uid = bloque.autor_user_id || '';
  return (notas || []).find(n => (uid && n.autor_user_id === uid) || (!n.autor_user_id && n.autor_name === (bloque.autor_name ?? bloque.advisor))) || bloque.nota || {};
}

/**
 * Lineas del CSV del reporte diario (misma estructura del export original).
 * @param {string} fecha Fecha seleccionada.
 * @param {string} filtro Nombre visible de la asesora filtrada ('' = todas).
 * @param {string} generado Fecha Miami del momento (el wrapper evalua miamiToday).
 * @param {object[]} bloques Datos por asesora en pantalla (reporteDayData).
 * @param {object[]} notasResueltas Problemas/observaciones ya resueltos por
 *   el wrapper (DOM primero, nota despues), en el orden de los bloques.
 * @returns {string[]} Lineas de texto (unir con \\n para downloadCSV).
 */
export function diarioCsvLines(fecha, filtro, generado, bloques, notasResueltas) {
  const lineas = ['Reporte Diario de Trabajo', csvReporteField(`Fecha: ${fecha}`), csvReporteField(`Generado: ${generado} Miami`)];
  if (filtro) lineas.push(csvReporteField(`Filtro: ${filtro}`));
  lineas.push('', DIARIO_HEADERS.map(csvReporteField).join(','));
  const sumas = Object.fromEntries(DIARIO_KEYS.map(k => [k, 0]));
  bloques.forEach((b, i) => {
    const p = b.procedencia || {}, l = b.llamadas || {}, c = b.citas || {};
    const detalle = detalleGestionHoy(b);
    const llamadas = detalleGestionHoy(b, 'llamadas');
    const values = [Number(b.gestionados) || 0, p.WhatsApp ?? p.Whatsapp, p['Facebook/Instagram'], p['Directo o Referido'], (Number(p.CogniTalking) || 0) + (Number(p.Otros) || 0), l.del_dia, l.data_dura, l.llamada_whatsapp, (Number(l.del_dia) || 0) + (Number(l.data_dura) || 0) + (Number(l.llamada_whatsapp) || 0), c.agendados_dia, c.agendados_data_dura, c.agendados_doral, c.agendados_doral_data_dura, c.agendados_weston, c.agendados_weston_data_dura, c.total_agendados, c.citas_reprogramadas_hoy, c.visitas, c.no_asistieron, c.canceladas, c.reprogramadas, c.agendados_gestionados_dia, c.agendados_gestionados_data_dura, detalle.nuevos, detalle.gestionados, detalle.total, llamadas.nuevos, llamadas.gestionados, llamadas.total, (b.canales || {}).instagram, numCanalesOtros(b.canales), totalCanalesVisibles(b.canales)].map(v => Number(v) || 0);
    values.forEach((v, n) => { sumas[DIARIO_KEYS[n]] += v; });
    const nota = notasResueltas[i] || {};
    lineas.push([b.autor_name ?? b.advisor, ...values, nota.problemas ?? '', nota.observaciones ?? ''].map(csvReporteField).join(','));
  });
  detalleGestionHoy({ canales: { whatsapp: sumas.detalleTotal }, whatsapp: { nuevos: sumas.whatsappNuevos } });
  detalleGestionHoy({ canales: { llamada: sumas.llamadasDetalleTotal }, llamadas: { nuevos: sumas.llamadasNuevos } }, 'llamadas');
  lineas.push(['TOTAL', ...DIARIO_KEYS.map(k => sumas[k]), '', ''].map(csvReporteField).join(','));
  return lineas;
}

// --- Piezas puras del panel del reporte diario (fase 21) ---------------------

/** Indice de notas por uid y por nombre legado (respaldo sin user_id). */
export function indiceNotas(notas) {
  const porUid = new Map(), porNombre = new Map();
  for (const n of notas || []) (n.autor_user_id ? porUid : porNombre).set(n.autor_user_id || n.autor_name, n);
  return { porUid, porNombre };
}

/** Nota de una asesora: uid primero; el nombre es solo respaldo. */
export function notaDeBloque({ porUid, porNombre }, b) {
  return (b.autor_user_id && porUid.get(b.autor_user_id)) || porNombre.get(b.autor_name) || null;
}

/** Totales del panel (gestiones, llamadas, citas, reprogramadas, visitas). */
export function totalDiario(bloques) {
  const num = (o, k) => Number(o?.[k]) || 0;
  return (bloques || []).reduce((a, b) => {
    a.g += num(b, 'gestionados');
    // "Total llamadas" = el grupo Llamadas (llamada + llamada Data Dura +
    // llamada WhatsApp), el mismo que muestra el detalle por asesora y la
    // columna del CSV. El grupo de WhatsApp lleva lo demas, asi que el
    // resumen cuadra con los detalles.
    a.l += num(b.llamadas, 'del_dia') + num(b.llamadas, 'data_dura') + num(b.llamadas, 'llamada_whatsapp');
    a.c += Number(b.citas?.total_agendados) || 0;
    a.r += Number(b.citas?.citas_reprogramadas_hoy) || 0;
    a.v += Number(b.citas?.visitas) || 0;
    return a;
  }, { g: 0, l: 0, c: 0, r: 0, v: 0 });
}

const celdaDiago = (label, value) => `<div class="daily-metric"><div class="text-xs text-slate-500">${label}</div><strong class="text-lg text-indigo-900">${value}</strong></div>`;
const filasDetalle = rows => `<table class="text-sm"><tbody>${rows.map(([l, v]) => `<tr><td>${l}</td><td class="font-semibold">${v}</td></tr>`).join('')}</tbody></table>`;
const tablaDetalle = (title, rows, extra = '') => `<div class="daily-detail-card"><h5 class="font-semibold text-indigo-900">${title}</h5>${filasDetalle(rows)}${extra}</div>`;

/** Las cuatro tablas de detalle de una asesora (pantalla coherencia fase 16). */
export function detallesBloqueHtml(b) {
  const num = (o, k) => Number(o?.[k]) || 0;
  let detalle;
  try {
    const d = detalleGestionHoy(b);
    const l = detalleGestionHoy(b, 'llamadas');
    detalle = tablaDetalle('Detalle de gestión', [['WhatsApp nuevos hoy', d.nuevos], ['WhatsApp gestionados hoy', d.gestionados], ['Total grupo WhatsApp', d.total]],
      '<h6 class="mt-3 font-semibold text-indigo-900">Llamadas</h6>' + filasDetalle([['Llamadas del día', num(b.canales, 'llamada')], ['Llamadas Data Dura', num(b.canales, 'data_dura')], ['Llamada WhatsApp', num(b.canales, 'llamada_whatsapp')], ['Total llamadas', l.total]]));
  } catch (error) {
    detalle = `<div class="daily-detail-card" role="alert"><h5 class="font-semibold text-indigo-900">Detalle de gestión</h5><p>${escapeHtml(error.message)}</p></div>`;
  }
  const p = b.procedencia || {}, c = b.citas || {};
  const pt = Object.values(p).reduce((a, v) => a + (Number(v) || 0), 0);
  return tablaDetalle('Procedencia', [['WhatsApp', num(p, 'WhatsApp')], ['Facebook/Instagram', num(p, 'Facebook/Instagram')], ['Directo o Referido', num(p, 'Directo o Referido')], ['Otras procedencias', num(p, 'CogniTalking') + num(p, 'Otros')], ['Total', pt]])
    + tablaDetalle('Canales', [['Llamada', num(b.canales, 'llamada')], ['Llamada Data Dura', num(b.canales, 'data_dura')], ['Llamada WhatsApp', num(b.canales, 'llamada_whatsapp')], ['WhatsApp', num(b.canales, 'whatsapp')], ['Instagram', num(b.canales, 'instagram')], ['Otros o sin canal', num(b.canales, 'visita') + num(b.canales, 'sin_clasificar')], ['Total', totalCanalesVisibles(b.canales)]])
    + detalle
    + tablaDetalle('Citas creadas y resultados registrados hoy', [['Citas nuevas Doral', num(c, 'agendados_doral')], ['Citas nuevas Data Dura Doral', num(c, 'agendados_doral_data_dura')], ['Citas nuevas Weston', num(c, 'agendados_weston')], ['Citas nuevas Data Dura Weston', num(c, 'agendados_weston_data_dura')], ['Citas nuevas hoy', num(c, 'total_agendados')], ['Citas reprogramadas hoy', num(c, 'citas_reprogramadas_hoy')], ['Visitas registradas', num(c, 'visitas')], ['No asistieron', num(c, 'no_asistieron')], ['Canceladas', num(c, 'canceladas')], ['Reprogramadas', num(c, 'reprogramadas')]]);
}

/** Manual de problemas/observaciones: edicion o lectura (respaldo exacto). */
export function manualBloqueHtml(i, nota, editable) {
  if (editable) return `<label for="reporte-problemas-${i}" class="block text-xs font-semibold text-slate-600">Problemas</label><textarea id="reporte-problemas-${i}" class="reporte-manual w-full p-2" rows="3" maxlength="5000">${escapeHtml(nota?.problemas || '')}</textarea><label for="reporte-obs-${i}" class="block text-xs font-semibold text-slate-600">Observaciones</label><textarea id="reporte-obs-${i}" class="reporte-manual w-full p-2" rows="3" maxlength="5000">${escapeHtml(nota?.observaciones || '')}</textarea><div class="daily-note-actions flex flex-wrap gap-2"><button id="reporte-save-${i}" data-ev="click:saveReporteNota(${i})" class="px-3 py-1 bg-indigo-600 text-white">Guardar</button>${nota?.id ? '<button id="reporte-delete-' + i + '" data-ev="click:deleteReporteNota(' + i + ')" class="px-3 py-1 border border-slate-300">Eliminar</button>' : ''}</div>`;
  return `<p class="text-sm">${escapeHtml(nota?.problemas || '')} ${escapeHtml(nota?.observaciones || '')}</p>`;
}

/** Bloque de una asesora con su resumen de detail + manuales. */
export function bloqueDiaHtml(b, i, manualHtml) {
  const num = (o, k) => Number(o?.[k]) || 0;
  return `<details class="daily-advisor"><summary class="cursor-pointer font-bold text-indigo-900">${escapeHtml(b.autor_name || b.advisor || 'Sin asesora')} — ${num(b, 'gestionados')} gestiones</summary><div class="daily-advisor-body"><div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">${detallesBloqueHtml(b)}</div><div class="mt-4 space-y-2"><h4 class="text-sm font-semibold text-slate-700">Problemas y observaciones</h4>${manualHtml}</div></div></details>`;
}

/** Shell del panel diario con el aviso de notas y el Resumen general. */
export function cuerpoReporteDiario(notasOk, total, bloquesHtml, equipoHtml = '') {
  return `${notasOk ? '' : '<div class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">No se pudieron cargar las notas guardadas. La edicion esta desactivada para no sobrescribir datos: recarga la pagina o intentalo mas tarde.</div>'}<section class="daily-summary space-y-3"><h3 class="font-bold text-lg text-indigo-900">Resumen general</h3><div class="grid grid-cols-2 sm:grid-cols-5 gap-3">${celdaDiago('Gestiones realizadas', total.g)}${celdaDiago('Total llamadas', total.l)}${celdaDiago('Citas nuevas hoy', total.c)}${celdaDiago('Reprogramadas hoy', total.r)}${celdaDiago('Visitas registradas', total.v)}</div></section>${equipoHtml}<section class="space-y-3"><h3 class="font-bold text-lg text-indigo-900">Comparativa por asesora</h3>${bloquesHtml || '<p class="text-slate-500">Sin gestiones para esta fecha.</p>'}</section>`;
}

/** Totales del dia de todas las asesoras (bloque 'equipo' del RPC): las
 * mismas cuatro tarjetas del detalle por asesora, siempre del equipo
 * completo de la fecha y ajenas al filtro individual. El servidor decide
 * quien cuenta como asesora; sin bloque, no se inventa la seccion. */
export function equipoDiarioHtml(equipo) {
  if (!equipo || typeof equipo !== 'object' || Array.isArray(equipo)) return '';
  return `<section class="daily-summary space-y-3"><h3 class="font-bold text-lg text-indigo-900">Totales de las asesoras</h3><p class="text-xs text-slate-500">Suma de lo realizado por todas las asesoras del día; el filtro de asesora no cambia este bloque.</p><div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">${detallesBloqueHtml(equipo)}</div></section>`;
}

/**
 * Lista de asesoras del select con ids estables (bug del filtro): la
 * respuesta filtrada solo trae a una asesora, asi que se preservan los ids
 * ya conocidos (previas), se completan con los de la respuesta y con los
 * nombres del catalogo (id '') sin duplicar por nombre; un id real gana.
 * Orden alfabetico es.
 * @param {object[]} bloques Bloques de la respuesta ({autor_user_id, autor_name}).
 * @param {string[]} catalogoNombres Nombres del catalogo de agentes.
 * @param {object[]} previas Lista {id,name} cacheada de una carga anterior.
 * @returns {{id: string, name: string}[]}
 */
export function asesorasDisponibles(bloques, catalogoNombres, previas) {
  const porNombre = new Map();
  const agregar = (id, name) => {
    const clave = String(name ?? '').trim().toLowerCase();
    if (!clave) return;
    const actual = porNombre.get(clave);
    if (!actual || (!actual.id && id)) porNombre.set(clave, { id: id || '', name });
  };
  for (const { id, name } of previas || []) agregar(id, name);
  for (const b of bloques || []) agregar(b.autor_user_id || '', b.autor_name || '');
  for (const name of catalogoNombres || []) agregar('', name);
  return [...porNombre.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// --- Piezas puras de la seccion Campanas (fase 22) ---------------------------

/**
 * Universo de campanas: catalogo activo + rollup del CRM + filas manuales,
 * con el mapeo y fallbacks exactos del export original; orden alfabetico es.
 * Con periodRows ademas incorpora el desglose por períodos de fechas:
 * - vista mes (periodo null): el valor efectivo es la fila manual si existe y,
 *   si no, la suma de los períodos del mes; los totales de períodos viajan en
 *   periodos_*. Con periodosDisponibles=false y sin fila manual, el mes no es
 *   calculable: Meta va en null (nunca un cero que parezca real).
 * - vista período ({desde, hasta}): alcance/gasto/resultados de ESE período
 *   exacto y metricas CRM en null (el rollup del CRM es mensual).
 * @param {string[]} catalogo Nombres del catalogo activo.
 * @param {object[]} rollupRows Filas del RPC campaign_monthly_rollup.
 * @param {object[]} statRows Filas de campaign_stats.
 * @param {object[]} periodRows Filas de campaign_period_stats del mes.
 * @param {{desde: string, hasta: string}|null} periodo Rango de la vista período (YYYY-MM-DD) o null para vista mensual.
 * @param {boolean} periodosDisponibles false si la carga de períodos falló.
 * @returns {object[]}
 */
export function campanasDeFuentes(catalogo, rollupRows, statRows, periodRows = [], periodo = null, periodosDisponibles = true) {
  const statsMap = new Map((statRows || []).map(s => [s.campaign_name, s]));
  const rollupMap = new Map((rollupRows || []).map(r => [r.campaign_name, r]));
  const totales = new Map();
  for (const p of periodRows || []) {
    if (!p?.campaign_name || String(p.campaign_name).trim() === '') continue;
    const acc = totales.get(p.campaign_name) || { alcance: 0, gasto: 0, resultados: 0, count: 0 };
    acc.alcance += Number(p.alcance) || 0;
    acc.gasto += Number(p.gasto) || 0;
    acc.resultados += Number(p.resultados) || 0;
    acc.count += 1;
    totales.set(p.campaign_name, acc);
  }
  const names = new Set([...(catalogo || []), ...(rollupRows || []).map(r => r.campaign_name), ...(statRows || []).map(s => s.campaign_name), ...(periodRows || []).map(p => p.campaign_name)].filter(v => String(v || '').trim() !== ''));
  return [...names].sort((a, b) => String(a).localeCompare(String(b))).map(name => {
    const r = rollupMap.get(name) || {};
    const s = statsMap.get(name);
    const pk = totales.get(name) || { alcance: 0, gasto: 0, resultados: 0, count: 0 };
    if (periodo && periodo.desde && periodo.hasta) {
      const p = (periodRows || []).find(x => x?.campaign_name === name && String(x.desde).slice(0, 10) === String(periodo.desde).slice(0, 10) && String(x.hasta).slice(0, 10) === String(periodo.hasta).slice(0, 10));
      const disp = periodosDisponibles;
      return {
        name: String(name),
        stat_id: s?.id ?? null,
        period_id: p?.id ?? null,
        estado: s?.estado || 'activa',
        alcance: disp ? (Number(p?.alcance) || 0) : null,
        gasto: disp ? (Number(p?.gasto) || 0) : null,
        resultados: disp ? (Number(p?.resultados) || 0) : null,
        periodos_alcance: disp ? pk.alcance : null,
        periodos_gasto: disp ? pk.gasto : null,
        periodos_resultados: disp ? pk.resultados : null,
        periodos_count: disp ? pk.count : 0,
        leads_nuevos: null,
        agendados: null,
        asistieron: null,
        inscritos: null,
        agendados_previos: null,
        pendientes: null,
      };
    }
    const manual = s != null;
    return {
      name: String(name),
      stat_id: s?.id ?? null,
      estado: s?.estado || 'activa',
      // Valor efectivo del mes: fila manual si existe; si no, suma de períodos.
      // Sin períodos disponibles y sin fila manual: no calculable (null = '—').
      alcance: manual ? Number(s?.alcance) || 0 : (periodosDisponibles ? pk.alcance : null),
      gasto: manual ? Number(s?.gasto) || 0 : (periodosDisponibles ? pk.gasto : null),
      resultados: manual ? Number(s?.resultados) || 0 : (periodosDisponibles ? pk.resultados : null),
      periodos_alcance: periodosDisponibles ? pk.alcance : null,
      periodos_gasto: periodosDisponibles ? pk.gasto : null,
      periodos_resultados: periodosDisponibles ? pk.resultados : null,
      periodos_count: periodosDisponibles ? pk.count : 0,
      leads_nuevos: Number(r.leads_nuevos) || 0,
      agendados: Number(r.agendados) || 0,
      asistieron: Number(r.asistieron) || 0,
      inscritos: Number(r.inscritos) || 0,
      agendados_previos: Number(r.agendados_previos) || 0,
      pendientes: Number(r.pendientes) || 0,
    };
  });
}

/** Resumen de 4 metricas (o vacio sin filas). En vista período el CRM no aplica.
  * Con datosIncompletos (carga de períodos fallida) las metricas Meta muestran
  * 'No disponible' en lugar de un cero que parezca real. */
export function resumenCampanasHtml(rows, totals, esPeriodo = false, datosIncompletos = false) {
  if (!rows?.length) return '';
  const tarjetas = esPeriodo
    ? [
        ['Inversión Meta', `$${totals.gasto.toFixed(2)}`, true],
        ['Resultados Meta', totals.resultados, true],
        ['Alcance', totals.alcance, true],
        ['Coste/Resultado', campaignCosteResultado(totals.gasto, totals.resultados), true],
      ]
    : [
        ['Inversión Meta', `$${totals.gasto.toFixed(2)}`, true],
        ['Resultados Meta', totals.resultados, true],
        ['Leads nuevos', totals.leads_nuevos, false],
        ['Inscritos', totals.inscritos, false],
      ];
  return tarjetas.map(([label, value, esMeta]) => `<div><span class="text-[11px] text-slate-400">${label}</span><strong>${datosIncompletos && esMeta ? 'No disponible' : escapeHtml(String(value))}</strong></div>`).join('');
}

/** Estado vacio de la tabla (carga fallida o sin campanas del mes). */
export function estadoVacioCampanasHtml(loadFailed, mesLabel) {
  return loadFailed
    ? '<tr><td colspan="13" class="campaigns-empty"><p class="text-sm font-semibold">No se pudo cargar el informe.</p><p class="mt-1 text-xs">Revisa el aviso anterior e inténtalo de nuevo.</p><button type="button" class="campaigns-retry" data-ev="click:loadCampanas()">Reintentar</button></td></tr>'
    : `<tr><td colspan="13" class="campaigns-empty"><p class="text-sm font-semibold">Sin campañas para ${escapeHtml(mesLabel)}.</p><p class="mt-1 text-xs">Selecciona otro mes para consultar sus resultados.</p></td></tr>`;
}

/** Fila de campana. Vista período: inputs siempre (es la via habitual de
  * captura). Vista mes: LECTURA por defecto; "Ajustar mensual" habilita SOLO
  * esa fila (editandoMensual = nombre), con Guardar ajuste/Cancelar. Sin
  * períodos disponibles y sin fila manual, el mes no es calculable: '—'. */
export function filaCampanaHtml(r, { esEditor, isAdmin, monthStr, periodo = null, editandoMensual = null, periodosDisponibles = true } = {}) {
  const esPeriodo = Boolean(periodo && periodo.desde && periodo.hasta);
  const periodoAttrs = esPeriodo ? ` data-desde="${escapeAttr(periodo.desde)}" data-hasta="${escapeAttr(periodo.hasta)}"` : '';
  const editandoMes = !esPeriodo && esEditor && editandoMensual === r.name;
  const estadoOptions = sel => ['activa', 'finalizada', 'pausada'].map(e => `<option value="${e}"${e === sel ? ' selected' : ''}>${e.charAt(0).toUpperCase() + e.slice(1)}</option>`).join('');
  const fmtNum = val => (val == null ? '—' : val);
  const numCell = (field, val) => ((esEditor && esPeriodo) || editandoMes)
    ? `<input type="number" min="0" step="0.01" data-field="${field}" value="${val == null ? 0 : val}" data-ev="input:recalcCampaignRow(this)" class="w-24 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-right text-slate-100">`
    : `<span class="font-mono">${fmtNum(val)}</span>`;
  const estadoCell = (esPeriodo || !editandoMes)
    ? escapeHtml(r.estado)
    : `<select data-field="estado" class="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100">${estadoOptions(r.estado)}</select>`;
  const btnSave = esPeriodo
    ? (esEditor
      ? `<button type="button" data-ev="click:saveCampaignPeriodStatFromData('${encodeURIComponent(r.name)}','${escapeAttr(periodo.desde)}','${escapeAttr(periodo.hasta)}')" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">Guardar</button>`
      : '')
    : (editandoMes
      ? `<button type="button" data-ev="click:saveCampaignStatFromData('${encodeURIComponent(r.name)}','${escapeAttr(monthStr)}',${r.stat_id == null ? 'null' : Number(r.stat_id)})" class="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer">Guardar ajuste</button>`
        + `<button type="button" data-ev="click:cancelarAjusteMensual()" class="px-2 py-1 rounded border border-slate-500 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer">Cancelar</button>`
      : (esEditor && r.alcance != null
        ? `<button type="button" data-ev="click:iniciarAjusteMensualFromData('${encodeURIComponent(r.name)}')" class="px-2 py-1 rounded border border-indigo-500 text-indigo-300 hover:bg-indigo-950 font-semibold cursor-pointer">Ajustar mensual</button>`
        : ''));
  const btnDelete = isAdmin && !editandoMes && (esPeriodo ? r.period_id != null : r.stat_id != null)
    ? (esPeriodo
      ? `<button type="button" data-ev="click:deleteCampaignPeriodStat(${Number(r.period_id)},'${escapeAttr(periodo.desde)}','${escapeAttr(periodo.hasta)}')" class="px-2 py-1 rounded border border-rose-700 text-rose-300 hover:bg-rose-950 font-semibold cursor-pointer">Eliminar</button>`
      : `<button type="button" data-ev="click:deleteCampaignStat(${Number(r.stat_id)},'${escapeAttr(monthStr)}')" class="px-2 py-1 rounded border border-rose-700 text-rose-300 hover:bg-rose-950 font-semibold cursor-pointer">Eliminar</button>`)
    : '';
  // Volver al automático: solo en vista mes, con corrección manual y fuera del modo ajuste.
  const btnAuto = esEditor && !esPeriodo && !editandoMes && r.stat_id != null
    ? `<button type="button" data-ev="click:resetCampaignStatAutoFromData('${encodeURIComponent(r.name)}','${escapeAttr(monthStr)}')" class="px-2 py-1 rounded border border-slate-500 text-slate-200 hover:bg-slate-700 font-semibold cursor-pointer">Volver al automático</button>`
    : '';
  const crmCell = val => `<td class="p-3 text-right font-mono">${val == null ? '—' : val}</td>`;
  // Pista del desglose por períodos en vista mes: suma registrada, para que la
  // divergencia con el mes ajustado a mano quede a la vista.
  const hintPeriodos = !esPeriodo && r.periodos_count > 0
    ? `<span class="block text-[10px] font-normal text-slate-400">Períodos (${r.periodos_count}): ${r.periodos_alcance} · $${Number(r.periodos_gasto).toFixed(2)} · ${r.periodos_resultados} res.</span>`
    : '';
  // Aviso de que el mes fue corregido a mano (excepción al cálculo automático).
  const chipAjustado = !esPeriodo && !editandoMes && r.stat_id != null
    ? '<span class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Mensual ajustado</span>'
    : '';
  return `<tr id="campaign_row_${escapeAttr(r.name)}" data-month="${escapeAttr(monthStr)}"${periodoAttrs} data-stat-id="${r.stat_id == null ? '' : Number(r.stat_id)}" class="hover:bg-slate-800/50">
          <td class="p-3 text-left text-slate-200">${escapeHtml(r.name)}${chipAjustado}${hintPeriodos}</td>
          <td class="p-3 text-left">${estadoCell}</td>
          <td class="p-3 text-right">${numCell('alcance', r.alcance)}</td>
          <td class="p-3 text-right">${numCell('gasto', r.gasto)}</td>
          <td class="p-3 text-right">${numCell('resultados', r.resultados)}</td>
          <td class="p-3 text-right font-mono" data-field="coste">${campaignCosteResultado(r.gasto, r.resultados)}</td>
          ${crmCell(r.leads_nuevos)}
          ${crmCell(r.agendados)}
          ${crmCell(r.asistieron)}
          ${crmCell(r.inscritos)}
          ${crmCell(r.agendados_previos)}
          ${crmCell(r.pendientes)}
          <td class="p-3 text-right whitespace-nowrap space-x-1">${btnSave}${btnAuto}${btnDelete}</td>
        </tr>`;
}

/** Fila TOTAL de la tabla de campanas. En vista período el CRM no aplica.
  * Con datosIncompletos las columnas Meta muestran guion (suma no fiable). */
export function totalCampanasHtml(totals, mesLabel, esPeriodo = false, datosIncompletos = false) {
  const crm = val => esPeriodo ? '—' : val;
  const meta = val => datosIncompletos ? '—' : val;
  return `<tr class="campaigns-total-row font-semibold text-slate-100 border-t-2 border-indigo-600">
        <td class="p-3 text-left">TOTAL · ${escapeHtml(mesLabel)}</td>
        <td class="p-3"></td>
        <td class="p-3 text-right font-mono">${meta(totals.alcance)}</td>
        <td class="p-3 text-right font-mono">${meta(totals.gasto.toFixed(2))}</td>
        <td class="p-3 text-right font-mono">${meta(totals.resultados)}</td>
        <td class="p-3 text-right font-mono">${datosIncompletos ? '—' : campaignCosteResultado(totals.gasto, totals.resultados)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.leads_nuevos)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.agendados)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.asistieron)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.inscritos)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.agendados_previos)}</td>
        <td class="p-3 text-right font-mono">${crm(totals.pendientes)}</td>
        <td class="p-3"></td>
      </tr>`;
}

/** Lineas del CSV de campanas (mismo orden y total que el export).
  * Con periodoLabel (ej. "01/10 al 07/10") el CSV corresponde a ese período y
  * las metricas CRM van vacias (el rollup del CRM es mensual). */
export function campanasCsvLines(rows, monthStr, generado, periodoLabel = '') {
  const esPeriodo = periodoLabel !== '';
  const titulo = esPeriodo ? `Campañas · ${monthStr} · ${periodoLabel}` : `Campañas · ${monthStr}`;
  const headers = ['Campaña', 'Estado', 'Alcance', 'Gasto (USD)', 'Resultados Meta', 'Coste/Resultado', 'Leads Nuevos', 'Agendados', 'Asistieron', 'Inscritos', 'Agendados Meses Anteriores', 'Pendientes'];
  const lineas = [titulo, `Generado: ${generado} Miami`, '', headers.join(',')];
  for (const r of rows || []) {
    lineas.push([csvReporteField(r.name), csvReporteField(r.estado), csvReporteField(r.alcance), csvReporteField(r.gasto), csvReporteField(r.resultados), csvReporteField(campaignCosteResultado(r.gasto, r.resultados)), csvReporteField(r.leads_nuevos), csvReporteField(r.agendados), csvReporteField(r.asistieron), csvReporteField(r.inscritos), csvReporteField(r.agendados_previos), csvReporteField(r.pendientes)].join(','));
  }
  const t = campaignTotals((rows || []).map(r => (esPeriodo ? { ...r, leads_nuevos: 0, agendados: 0, asistieron: 0, inscritos: 0, agendados_previos: 0, pendientes: 0 } : r)));
  lineas.push([csvReporteField('TOTAL'), csvReporteField(''), csvReporteField(t.alcance), csvReporteField(t.gasto.toFixed(2)), csvReporteField(t.resultados), csvReporteField(campaignCosteResultado(t.gasto, t.resultados)), csvReporteField(esPeriodo ? '' : t.leads_nuevos), csvReporteField(esPeriodo ? '' : t.agendados), csvReporteField(esPeriodo ? '' : t.asistieron), csvReporteField(esPeriodo ? '' : t.inscritos), csvReporteField(esPeriodo ? '' : t.agendados_previos), csvReporteField(esPeriodo ? '' : t.pendientes)].join(','));
  return lineas;
}

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== 'undefined') {
  window.MONTH_CHRONO = MONTH_CHRONO;
  window.GESTION_STATE_GROUPS = GESTION_STATE_GROUPS;
  window.parseFechaLead = parseFechaLead;
  window.normalizeLeadMonth = normalizeLeadMonth;
  window.leadReportDate = leadReportDate;
  window.isInscritoDataDura = isInscritoDataDura;
  window.histMonthKey = histMonthKey;
  window.histMonthLabel = histMonthLabel;
  window.sortHistMonthKeys = sortHistMonthKeys;
  window.normalizeGestion = normalizeGestion;
  window.groupGestionEstado = groupGestionEstado;
  window.periodoPresetRange = periodoPresetRange;
  window.periodoValidDate = periodoValidDate;
  window.periodoPct = periodoPct;
  window.csvReporteField = csvReporteField;
  window.esMedioRetirado = esMedioRetirado;
  window.medioVisible = medioVisible;
  window.campaignCosteResultado = campaignCosteResultado;
  window.campaignTotals = campaignTotals;
  window.computeHistoricalAggregates = computeHistoricalAggregates;
  window.applyHistoricalFilters = applyHistoricalFilters;
  window.histDateInputToTs = histDateInputToTs;
  window.histRangePresetDates = histRangePresetDates;
  window.historicalSummaryCsv = historicalSummaryCsv;
  window.historicalSummaryRows = historicalSummaryRows;
  window.historicalKpiTotals = historicalKpiTotals;
  window.historicalRecordMonth = historicalRecordMonth;
  window.histRangeNoticeText = histRangeNoticeText;
  window.historicalChartSeries = historicalChartSeries;
  window.tablaVaciaHistoricoHtml = tablaVaciaHistoricoHtml;
  window.tablaHistoricoHtml = tablaHistoricoHtml;
  window.histChartMonthly = histChartMonthly;
  window.histChartConversion = histChartConversion;
  window.histChartCampaign = histChartCampaign;
  window.histChartMedio = histChartMedio;
  window.histChartAgent = histChartAgent;
  window.histChartMonthlyStates = histChartMonthlyStates;
  window.histChartMonthlyCampaigns = histChartMonthlyCampaigns;
  window.histChartFunnel = histChartFunnel;
  window.buildPeriodSummary = buildPeriodSummary;
  window.validatePeriodoSummary = validatePeriodoSummary;
  window.validatePeriodoActividad = validatePeriodoActividad;
  window.periodoCsvLines = periodoCsvLines;
  window.diarioCsvLines = diarioCsvLines;
  window.resolverNotaBloque = resolverNotaBloque;
  window.indiceNotas = indiceNotas;
  window.notaDeBloque = notaDeBloque;
  window.equipoDiarioHtml = equipoDiarioHtml;
  window.totalDiario = totalDiario;
  window.detallesBloqueHtml = detallesBloqueHtml;
  window.manualBloqueHtml = manualBloqueHtml;
  window.bloqueDiaHtml = bloqueDiaHtml;
  window.cuerpoReporteDiario = cuerpoReporteDiario;
  window.asesorasDisponibles = asesorasDisponibles;
  window.campanasDeFuentes = campanasDeFuentes;
  window.resumenCampanasHtml = resumenCampanasHtml;
  window.estadoVacioCampanasHtml = estadoVacioCampanasHtml;
  window.filaCampanaHtml = filaCampanaHtml;
  window.totalCampanasHtml = totalCampanasHtml;
  window.campanasCsvLines = campanasCsvLines;
  window.historicalFilterOptions = historicalFilterOptions;
  window.periodoGestionesCsvLines = periodoGestionesCsvLines;
}

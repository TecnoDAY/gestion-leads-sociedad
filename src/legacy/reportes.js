/**
 * Capa 2 del patron strangler: helpers puros de las areas Reportes/Historico/
 * Campanas extraidos del monolito index.html. Sin DOM ni estado de sesion.
 * Importan helpers.js directamente (getField, miamiToday) para seguir
 * testeandose en node. El script clasico sigue resolviendolos via window.*
 * (registro al final de este modulo); las llamadas quedaron intactas.
 */

import { compareAlphaEs, getField, miamiToday } from './helpers.js';

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
  return ['llamada', 'data_dura', 'llamada_whatsapp', 'whatsapp', 'instagram'].reduce((a, k) => a + (Number(c[k]) || 0), 0);
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
    const m = getField(l, 'Medio').trim() || 'Directo/Otro';
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
  window.historicalFilterOptions = historicalFilterOptions;
  window.totalCanalesVisibles = totalCanalesVisibles;
}

/**
 * Capa 2 del patron strangler: helpers puros de las areas Reportes/Historico/
 * Campanas extraidos del monolito index.html. Sin DOM ni estado de sesion.
 * Importan helpers.js directamente (getField, miamiToday) para seguir
 * testeandose en node. El script clasico sigue resolviendolos via window.*
 * (registro al final de este modulo); las llamadas quedaron intactas.
 */

import { getField, miamiToday } from './helpers.js';

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
  window.totalCanalesVisibles = totalCanalesVisibles;
}

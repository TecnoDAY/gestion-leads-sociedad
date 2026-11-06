import { aggregateMetrics, canEditMetrics, createDemoStore, currentMetrics, demoEnabled, LIVE_START, validateMetric, validateRange } from './campaign-metrics-model.js';

export const isCampaignDemo = demoEnabled(globalThis.window?.location);
const access = () => window.currentAccess;
const demo = createDemoStore(access);
async function rpc(name, args) {
  const { data, error } = await window.supabaseClient.rpc(name, args);
  if (error) throw error;
  return data;
}
function requireEditor() {
  if (!canEditMetrics(access())) throw new Error('campaign_editor_required');
}
export async function insertCampaignMetric(input) {
  requireEditor();
  const v = validateMetric(input, { demo: isCampaignDemo });
  if (isCampaignDemo) return demo.insert(v);
  return rpc('insert_campaign_metric_v2', { p_campaign_name: v.campaignName, p_start_date: v.startDate,
    p_end_date: v.endDate, p_alcance: v.alcance, p_spend: v.spend, p_cost_per_result: v.cost, p_reported_meta_leads: v.metaLeads });
}
export async function correctCampaignMetric(input) {
  requireEditor();
  const v = validateMetric(input, { demo: isCampaignDemo });
  if (!String(input.reason || '').trim()) throw new Error('El motivo del cambio es obligatorio.');
  if (isCampaignDemo) return demo.correct({ ...v, originalId: input.originalId, reason: input.reason });
  return rpc('correct_campaign_metric_v2', { p_original_id: input.originalId, p_start_date: v.startDate,
    p_end_date: v.endDate, p_alcance: v.alcance, p_spend: v.spend, p_cost_per_result: v.cost,
    p_reported_meta_leads: v.metaLeads, p_reason: input.reason.trim() });
}
export async function listCampaignMetrics(campaignName) {
  if (isCampaignDemo) return demo.list(campaignName);
  return await rpc('list_campaign_metrics_with_authors_v2', { p_campaign_name: campaignName }) || [];
}
export async function aggregateCampaignMetrics(campaignName, from, to) {
  validateRange(from, to);
  if (isCampaignDemo) return aggregateMetrics(demo.list(campaignName), from, to);
  return rpc('aggregate_campaign_metrics_v2', { p_campaign_name: campaignName, p_from: from, p_to: to });
}
// Main report, summary and CSV all receive these same aggregate objects.
export async function campaignMetricReport(catalogue, crm, from, to, period = false) {
  validateRange(from, to);
  const history = isCampaignDemo ? demo.names().flatMap(name => demo.list(name)) : await rpc('list_campaign_metrics_with_authors_v2', { p_campaign_name: null });
  const names = [...new Set([...catalogue, ...crm.map(r => r.campaign_name), ...history.map(r => r.campaign_name)])].sort();
  return Promise.all(names.map(async name => {
    const a = isCampaignDemo ? aggregateMetrics(history.filter(r => r.campaign_name === name), from, to) : await aggregateCampaignMetrics(name, from, to);
    const c = crm.find(r => r.campaign_name === name) || {};
    const row = { name, metrics_source: true, estado: isCampaignDemo ? 'DEMO FICTICIO' : 'por rangos',
      alcance: a.alcance, gasto: Number(a.spend), resultados: Number(a.derived_results), meta_leads: a.reported_meta_leads,
      estimated: a.estimated, metric_count: a.count, stat_id: null };
    for (const key of ['leads_nuevos', 'agendados', 'asistieron', 'inscritos', 'agendados_previos', 'pendientes']) row[key] = period ? null : Number(c[key]) || 0;
    return row;
  }));
}

let panelEl, currentCampaign, editingOriginal, syncedRange, request = 0, opened = false, submitting = false;
const node = id => panelEl.querySelector(`#${id}`);
const field = name => node('cmpForm').elements.namedItem(name);
const fmt = value => value == null ? '—' : Number(value).toLocaleString('es', { maximumFractionDigits: 4 });
function message(text, error = false) {
  node('cmpMsg').textContent = text;
  node('cmpMsg').className = error ? 'text-xs text-rose-400' : 'text-xs text-emerald-400';
}
function ensurePanel() {
  if (panelEl) return;
  panelEl = document.createElement('aside');
  panelEl.id = 'campaignMetricsPanel';
  panelEl.className = 'campaign-metrics-panel translate-x-full';
  panelEl.setAttribute('aria-label', 'Métricas e historial de campaña');
  panelEl.innerHTML = `
    <header><h2 id="cmpTitle">Métricas Meta</h2><button id="cmpClose" type="button" aria-label="Cerrar">×</button></header>
    <p id="cmpSession"></p>
    <div id="cmpDemo" hidden><strong>DEMO · FICTICIO</strong></div>
    <div class="cmp-range"><label>Desde<input id="cmpFrom" type="date"></label><label>Hasta<input id="cmpTo" type="date"></label><button id="cmpFilter" type="button">Filtrar</button></div>
    <div id="cmpTotals" aria-live="polite"></div>
    <form id="cmpForm">
      <div class="cmp-row"><label>Desde<input type="date" name="start" required></label><label>Hasta<input type="date" name="end" required></label></div>
      <div class="cmp-row"><label>Importe (USD)<input type="number" name="spend" step="0.01" min="0" required></label><label>Coste/resultado (USD)<input type="number" name="cost" step="any" min="0" required></label></div>
      <output id="cmpPreview">Resultados ≈ —</output>
      <label id="cmpReasonWrap" hidden>Motivo *<textarea name="reason" rows="1"></textarea></label>
      <div id="cmpModeBadge"></div>
      <div class="cmp-actions"><button id="cmpSubmit" type="submit">Registrar</button><button id="cmpCancelEdit" type="button" hidden>Cancelar</button></div>
    </form>
    <p id="cmpMsg" role="status"></p>
    <h3>Historial</h3><div id="cmpHistory"></div>`;
  document.body.appendChild(panelEl);
  node('cmpClose').addEventListener('click', closeCampaignMetricsPanel);
  node('cmpForm').addEventListener('submit', onSubmit);
  node('cmpForm').addEventListener('input', () => {
    try { node('cmpPreview').textContent = `Resultados aproximados: ${fmt(validateMetric(formInput(), { demo: isCampaignDemo }).results)}`; }
    catch { node('cmpPreview').textContent = 'Resultados aproximados: — (completa importe, coste y fechas válidos)'; }
  });
  node('cmpCancelEdit').addEventListener('click', cancelEdit);
  node('cmpFilter').addEventListener('click', () => {
    try {
      validateRange(node('cmpFrom').value, node('cmpTo').value);
      syncedRange = { from: node('cmpFrom').value, to: node('cmpTo').value };
      cancelEdit(); refreshPanel();
    } catch (e) { message(e.message, true); }
  });
  node('cmpDemo').hidden = !isCampaignDemo;

}
function formInput() {
  return { campaignName: currentCampaign, startDate: field('start').value, endDate: field('end').value,
    spend: field('spend').value, cost: field('cost').value, metaLeads: null, alcance: 0 };
}
export function openCampaignMetricsPanel(campaignName, range) {
  ensurePanel();
  request++;
  currentCampaign = campaignName;
  const month = isCampaignDemo ? '2026-10' : new Date().toISOString().slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  syncedRange = range || { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` };
  node('cmpFrom').value = syncedRange.from; node('cmpTo').value = syncedRange.to;
  node('cmpTitle').textContent = `Métricas Meta — ${campaignName}`;
  panelEl.classList.remove('translate-x-full'); panelEl.classList.add('translate-x-0');
  opened = true;
  cancelEdit();
  refreshPanel();
}
export function closeCampaignMetricsPanel() {
  request++; opened = false; editingOriginal = null;
  if (panelEl) { panelEl.classList.add('translate-x-full'); panelEl.classList.remove('translate-x-0'); }
}
function cancelEdit() {
  editingOriginal = null;
  node('cmpForm').reset();
  field('start').value = syncedRange.from; field('end').value = syncedRange.to;
  field('start').min = field('end').min = isCampaignDemo ? '' : LIVE_START;
  node('cmpReasonWrap').hidden = node('cmpCancelEdit').hidden = true;
  field('reason').required = false;
  node('cmpModeBadge').textContent = '';
  node('cmpPreview').textContent = 'Resultados aproximados: —';
  node('cmpSubmit').textContent = 'Registrar métricas';
  node('cmpForm').hidden = !canEditMetrics(access()) || (!isCampaignDemo && syncedRange.to < LIVE_START);
  node('cmpSubmit').disabled = submitting;
}
function startCorrection(row) {
  if (!canEditMetrics(access()) || submitting) return;
  cancelEdit(); editingOriginal = row;
  field('start').value = row.start_date; field('end').value = row.end_date;
  field('spend').value = row.spend; field('cost').value = row.cost_per_result ?? row.input_cost ?? row.cost;
  node('cmpReasonWrap').hidden = node('cmpCancelEdit').hidden = false;
  field('reason').required = true;
  node('cmpModeBadge').textContent = `Corrigiendo versión vigente: ${row.start_date} → ${row.end_date}`;
  node('cmpSubmit').textContent = 'Registrar corrección';
}
function text(parent, tag, value) {
  const el = document.createElement(tag); el.textContent = value; parent.appendChild(el); return el;
}
async function refreshPanel() {
  const token = ++request, campaign = currentCampaign, range = { ...syncedRange }, identity = access();
  const valid = () => opened && token === request && campaign === currentCampaign && identity === access();
  node('cmpSession').textContent = identity?.activo && String(identity.nombre || '').trim()
    ? identity.nombre : 'Sesión no disponible';
  node('cmpTotals').textContent = 'Cargando…'; node('cmpHistory').replaceChildren(); message('');
  try {
    const [agg, rows] = await Promise.all([aggregateCampaignMetrics(campaign, range.from, range.to), listCampaignMetrics(campaign)]);
    if (!valid()) return;
    node('cmpForm').hidden = !canEditMetrics(access()) || (!isCampaignDemo && range.to < LIVE_START);
    node('cmpTotals').textContent = `Importe $${fmt(agg.spend)} · Resultados ≈ ${fmt(agg.derived_results)} · Coste ponderado $${fmt(agg.cost_per_result)} · Meta reportados ${fmt(agg.reported_meta_leads)} · ${agg.estimated ? 'Estimado: prorrateado por días' : 'Sin prorrateo'} · ${range.from} → ${range.to}`;
    const current = new Set(currentMetrics(rows).map(r => r.id));
    // Filter entire correction families: moved-out previous versions still explain current totals.
    const roots = new Set(rows.filter(r => r.start_date <= range.to && r.end_date >= range.from).map(r => r.original_id || r.id));
    const visible = rows.filter(r => roots.has(r.original_id || r.id)).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
    if (!visible.length) text(node('cmpHistory'), 'p', 'Sin registros en este rango.');
    for (const row of visible) {
      const item = document.createElement('article'); item.className = 'campaign-metrics-record';
      text(item, 'strong', `${row.start_date} → ${row.end_date} · ${current.has(row.id) ? 'Vigente' : 'Reemplazado'}`);
      text(item, 'p', `Importe $${fmt(row.spend)} · Coste $${fmt(row.cost_per_result ?? row.input_cost)} · Resultados ≈ ${fmt(row.derived_results)} · Meta reportados ${fmt(row.reported_meta_leads ?? row.meta_leads)}`);
      text(item, 'small', `${row.created_at || ''} · Autor ${row.author_name || row.created_by || '—'}`);
      if (row.correction_reason) text(item, 'p', `Motivo: ${row.correction_reason}`);
      if (canEditMetrics(access()) && current.has(row.id)) {
        const button = text(item, 'button', 'Corregir'); button.type = 'button';
        button.disabled = submitting;
        button.addEventListener('click', () => startCorrection(row));
      }
      node('cmpHistory').appendChild(item);
    }
  } catch (e) {
    if (valid()) { node('cmpTotals').textContent = 'Métricas no disponibles'; message(`Error: ${e.message || e}`, true); }
  }
}
async function onSubmit(event) {
  event.preventDefault();
  if (submitting) return;
  const campaign = currentCampaign, token = request, identity = access(), original = editingOriginal;
  try {
    requireEditor();
    const input = formInput();
    submitting = true; node('cmpSubmit').disabled = true;
    if (original) await correctCampaignMetric({ ...input, alcance: original.alcance ?? input.alcance,
      metaLeads: original.meta_leads ?? original.reported_meta_leads ?? input.metaLeads,
      originalId: original.id, reason: field('reason').value });
    else await insertCampaignMetric(input);
    // Refresh the main report even when the user has switched or closed the panel.
    window.dispatchEvent(new Event('campaign-metrics-changed'));
    if (opened && token === request && campaign === currentCampaign && identity === access()) {
      cancelEdit(); await refreshPanel(); message('Carga registrada. El historial anterior se conserva.');
    }
  } catch (e) {
    if (opened && token === request && campaign === currentCampaign) message(`Error: ${e.message || e}`, true);
  } finally { submitting = false; if (panelEl) node('cmpSubmit').disabled = false; }
}
if (typeof document !== 'undefined') document.addEventListener('click', event => {
  const button = event.target?.closest?.('[data-campaign-metrics]');
  if (!button) return;
  const { month, desde, hasta } = button.closest('tr')?.dataset || {};
  let range;
  if (desde && hasta) range = { from: desde, to: hasta };
  else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    const [y, m] = month.split('-').map(Number);
    range = { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` };
  }
  try { openCampaignMetricsPanel(decodeURIComponent(button.getAttribute('data-campaign-metrics')), range); }
  catch (e) { console.warn('Campaña inválida', e); }
});
if (typeof window !== 'undefined') {
  Object.assign(window, { openCampaignMetricsPanel, closeCampaignMetricsPanel, campaignMetricReport, isCampaignDemo });

}

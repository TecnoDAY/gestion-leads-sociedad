// Pure helpers for campaign metrics (spend + cost per result model).
// No DOM, no Supabase. Used by UI and tests.

export const LIVE_START = '2026-11-01';

export function demoEnabled(location) {
  if (!location) return false;
  const host = String(location.hostname || '');
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  const search = String(location.search || '');
  return loopback && /[?&]campaignDemo=1(?:&|$)/.test(search);
}

export function canEditMetrics(access) {
  if (!access || !access.activo) return false;
  return ['admin', 'trafficker', 'supervisor'].includes(access.role);
}

export function validateRange(from, to) {
  if (!from || !to) throw new Error('Rango de fechas requerido.');
  const a = new Date(from), b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) throw new Error('Fecha inválida.');
  if (a > b) throw new Error('La fecha inicial no puede ser posterior a la final.');
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateMetric(input, { demo = false } = {}) {
  if (input.spend === '' || input.spend == null || input.cost === '' || input.cost == null) throw new Error('negative_value_not_allowed');
  const v = {
    campaignName: String(input.campaignName || '').trim(),
    startDate: String(input.startDate || '').trim(),
    endDate: String(input.endDate || '').trim(),
    spend: Number(input.spend),
    cost: Number(input.cost),
    metaLeads: input.metaLeads === '' || input.metaLeads == null ? null : Number(input.metaLeads),
    alcance: input.alcance === '' || input.alcance == null ? 0 : Number(input.alcance),
  };
  if (!v.campaignName) throw new Error('campaign_name_required');
  if (!isValidDate(v.startDate) || !isValidDate(v.endDate)) throw new Error('invalid_date_range');
  if (new Date(v.startDate) > new Date(v.endDate)) throw new Error('invalid_date_range');
  if (!Number.isFinite(v.spend) || v.spend < 0) throw new Error('negative_value_not_allowed');
  if (!Number.isFinite(v.cost) || v.cost < 0) throw new Error('negative_value_not_allowed');
  if (v.cost === 0 && v.spend > 0) throw new Error('cost_required_for_positive_spend');
  if (v.metaLeads != null && (!Number.isInteger(v.metaLeads) || v.metaLeads < 0)) throw new Error('negative_value_not_allowed');
  if (!Number.isInteger(v.alcance) || v.alcance < 0) throw new Error('negative_value_not_allowed');
  if (!demo && v.startDate < LIVE_START) throw new Error(`La fecha debe ser posterior a ${LIVE_START}`);
  v.results = v.cost > 0 ? v.spend / v.cost : (v.spend === 0 ? 0 : Infinity);
  return v;
}

export function derivedResults(spend, costPerResult) {
  const s = Number(spend), c = Number(costPerResult);
  if (!Number.isFinite(s) || !Number.isFinite(c) || s < 0 || c < 0) return 0;
  if (c === 0) return s > 0 ? Infinity : 0;
  return s / c;
}

export function weightedCpl(totalSpend, totalResults) {
  const s = Number(totalSpend), r = Number(totalResults);
  if (!Number.isFinite(s) || !Number.isFinite(r) || r <= 0) return 0;
  return s / r;
}

export function prorate(value, overlapDays, blockDays) {
  const v = Number(value), o = Number(overlapDays), b = Number(blockDays);
  if (!Number.isFinite(v) || !Number.isFinite(o) || !Number.isFinite(b) || b <= 0 || o <= 0) return 0;
  return v * (o / b);
}

export function overlapDays(startA, endA, startB, endB) {
  const s = Math.max(new Date(startA).getTime(), new Date(startB).getTime());
  const e = Math.min(new Date(endA).getTime(), new Date(endB).getTime());
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function blockDays(start, end) {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  if (e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function aggregateMetrics(blocks, from, to) {
  let totalSpend = 0, totalResults = 0, totalAlcance = 0, totalReported = 0, estimated = false;
  const vig = currentMetrics(blocks);
  let blocksWithOverlap = 0, blocksWithReported = 0;
  for (const b of vig) {
    const bd = blockDays(b.start_date, b.end_date);
    const od = overlapDays(b.start_date, b.end_date, from, to);
    if (od <= 0 || bd <= 0) continue;
    blocksWithOverlap++;
    const fullyContained = new Date(b.start_date) >= new Date(from) && new Date(b.end_date) <= new Date(to);
    const ratio = od / bd;
    const dr = b.derived_results != null ? Number(b.derived_results) : derivedResults(b.spend, b.cost);
    if (fullyContained) {
      totalSpend += Number(b.spend) || 0;
      totalResults += dr;
      totalAlcance += Number(b.alcance) || 0;
      if (b.meta_leads != null) { totalReported += Number(b.meta_leads) || 0; blocksWithReported++; }
    } else {
      estimated = true;
      totalSpend += (Number(b.spend) || 0) * od / bd;
      totalResults += dr * ratio;
      totalAlcance += Math.round((Number(b.alcance) || 0) * ratio);
      if (b.meta_leads != null) { totalReported += Math.round(Number(b.meta_leads) * ratio); blocksWithReported++; }
    }
  }
  return { spend: totalSpend, results: totalResults, derived_results: totalResults,
    cost_per_lead: weightedCpl(totalSpend, totalResults), cost_per_result: weightedCpl(totalSpend, totalResults),
    meta_leads: (blocksWithOverlap > 0 && blocksWithReported === blocksWithOverlap) ? totalReported : null,
    reported_meta_leads: (blocksWithOverlap > 0 && blocksWithReported === blocksWithOverlap) ? totalReported : null,
    alcance: totalAlcance, estimated,
    count: vig.filter(b => overlapDays(b.start_date, b.end_date, from, to) > 0).length };
}

export function currentMetrics(rows) {
  const byId = new Map(rows.map(r => [r.id, r]));
  const current = new Map();
  for (const row of rows) {
    // Follow older chained fixtures too; new demo/SQL corrections use root IDs.
    let root = row;
    const seen = new Set();
    while (root.original_id && byId.has(root.original_id) && !seen.has(root)) {
      seen.add(root);
      root = byId.get(root.original_id);
    }
    const key = root.original_id || root.id || root;
    const previous = current.get(key);
    const revision = Number(row.revision) || 0;
    const previousRevision = Number(previous?.revision) || 0;
    const time = new Date(row.created_at || 0).getTime() || 0;
    const previousTime = new Date(previous?.created_at || 0).getTime() || 0;
    if (!previous || revision > previousRevision || (revision === previousRevision &&
      (time > previousTime || (time === previousTime && String(row.id).localeCompare(String(previous.id)) > 0)))) {
      current.set(key, row);
    }
  }
  return rows.filter(row => [...current.values()].includes(row));
}

export function createDemoStore(accessFn) {
  let seq = 0;
  const rows = [];
  const requireEditor = () => {
    const a = accessFn();
    if (!a || !a.activo) throw new Error('active_user_required');
    if (!canEditMetrics(a)) throw new Error('campaign_editor_required');
  };
  return {
    insert(input) {
      requireEditor();
      const v = validateMetric(input, { demo: true });
      const overlap = currentMetrics(rows).some(r => r.campaign_name === v.campaignName &&
        new Date(r.start_date) <= new Date(v.endDate) && new Date(r.end_date) >= new Date(v.startDate));
      if (overlap) throw new Error('solapa');
      seq++;
      const row = { id: `demo-${seq}`, revision: 1, campaign_name: v.campaignName, start_date: v.startDate,
        end_date: v.endDate, spend: v.spend, cost: v.cost, input_cost: v.cost, meta_leads: v.metaLeads,
        alcance: v.alcance, derived_results: v.results, created_at: new Date().toISOString(),
        created_by: accessFn().user_id || null, author_name: String(accessFn().nombre || '').trim() || null,
        is_correction: false, original_id: null };
      rows.push(row);
      return row;
    },
    correct(input) {
      requireEditor();
      if (!String(input.reason || '').trim()) throw new Error('El motivo del cambio es obligatorio.');
      const v = validateMetric(input, { demo: true });
      const orig = rows.find(r => r.id === input.originalId);
      if (!orig) throw new Error('original_metric_not_found');
      const rootId = orig.original_id || orig.id;
      const current = currentMetrics(rows);
      const latest = current.find(r => (r.original_id || r.id) === rootId);
      const overlap = current.some(r => (r.original_id || r.id) !== rootId && r.campaign_name === orig.campaign_name &&
        new Date(r.start_date) <= new Date(v.endDate) && new Date(r.end_date) >= new Date(v.startDate));
      if (overlap) throw new Error('solapa');
      seq++;
      const row = { id: `demo-${seq}`, revision: (latest?.revision || 1) + 1, campaign_name: orig.campaign_name,
        start_date: v.startDate, end_date: v.endDate, spend: v.spend, cost: v.cost, input_cost: v.cost,
        meta_leads: v.metaLeads, alcance: v.alcance, derived_results: v.results,
        created_at: new Date().toISOString(), created_by: accessFn().user_id || null,
        author_name: String(accessFn().nombre || '').trim() || null, is_correction: true,
        original_id: rootId, correction_reason: input.reason.trim() };
      rows.push(row);
      return row;
    },
    list(campaignName) { 
      const a = accessFn();
      if (!a || !a.activo) throw new Error('active_user_required');
      return rows.filter(r => r.campaign_name === campaignName);
    },
    names() { return [...new Set(rows.map(r => r.campaign_name))]; },
  };
}

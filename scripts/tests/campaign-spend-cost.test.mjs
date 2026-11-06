import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateMetrics, createDemoStore, validateMetric, demoEnabled, currentMetrics } from '../../src/legacy/campaign-metrics-model.js';

const input = (extra = {}) => ({ campaignName: 'Kids', startDate: '2026-10-01', endDate: '2026-10-07', spend: 100, cost: 3, ...extra });
const editor = { activo: true, role: 'trafficker' };

test('spend / cost keeps fractions; optional reported leads remain separate; weighted monthly CPL', () => {
  const store = createDemoStore(() => editor);
  store.insert(input({ metaLeads: 30 }));
  store.insert(input({ startDate: '2026-10-08', endDate: '2026-10-14', spend: 200, cost: 12 }));
  const a = aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-31');
  assert.equal(a.spend, 300);
  assert.equal(a.results, 50);
  assert.equal(a.cost_per_lead, 6);
  assert.equal(a.meta_leads, null, 'incomplete optional reported totals must not appear complete');
  assert.equal(a.estimated, false, 'fully contained weekly blocks are exact');
  const partial = aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-02');
  assert.equal(partial.spend, 100 * 2 / 7);
  assert.equal(partial.results, (100 / 3) * 2 / 7);
  assert.equal(partial.estimated, true);
});

test('validation rejects bad numbers/dates and leaves history and id counter unchanged', () => {
  const store = createDemoStore(() => editor);
  for (const extra of [{ spend: -1 }, { spend: NaN }, { spend: '' }, { spend: Infinity }, { cost: 0 }, { cost: -1 }, { cost: NaN }, { cost: '' }, { metaLeads: -1 }, { metaLeads: 1.5 }, { metaLeads: 'oops' }, { alcance: -1 }, { alcance: 1.2 }, { startDate: '2026-02-30' }, { endDate: '2026-09-30' }]) {
    assert.throws(() => store.insert(input(extra)));
    assert.deepEqual(store.list('Kids'), []);
  }
  assert.equal(store.insert(input({ spend: 0, cost: 0 })).id, 'demo-1');
  assert.equal(validateMetric(input({ spend: 0, cost: 0 }), { demo: true }).results, 0);
  assert.throws(() => validateMetric(input()), /2026-11-01/);
  assert.doesNotThrow(() => validateMetric(input({ startDate: '2026-11-01', endDate: '2026-11-07' })));
});

test('corrections always replace current root, including changed dates and repeated corrections', () => {
  const store = createDemoStore(() => editor);
  const original = store.insert(input());
  const second = store.correct({ ...input({ spend: 60, cost: 6, startDate: '2026-10-08', endDate: '2026-10-14' }), originalId: original.id, reason: '<img onerror=alert(1)>' });
  store.correct({ ...input({ spend: 90, cost: 6, startDate: '2026-10-15', endDate: '2026-10-21' }), originalId: second.id, reason: 'Otra corrección' });
  assert.equal(store.list('Kids').length, 3);
  assert.equal(aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-07').spend, 0);
  assert.equal(aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-31').results, 15);
  assert.throws(() => store.correct({ ...input(), originalId: original.id, reason: ' ' }), /motivo/i);
  store.insert(input()); // original range was freed by correction
  assert.throws(() => store.insert(input()), /solapa/);
  assert.throws(() => store.correct({ ...input(), originalId: second.id, reason: 'conflicto' }), /solapa/);
  assert.equal(store.list('Kids').length, 4);
});

test('active readers can read but cannot mutate; inactive access fails closed', () => {
  let access = editor;
  const store = createDemoStore(() => access);
  store.insert(input());
  access = { activo: true, role: 'agente' };
  assert.equal(store.list('Kids').length, 1);
  assert.throws(() => store.insert(input()), /campaign_editor_required/);
  assert.throws(() => store.correct({ ...input(), originalId: 'demo-1', reason: 'x' }), /campaign_editor_required/);
  assert.equal(store.list('Kids').length, 1);
  access = { activo: false, role: 'admin' };
  assert.throws(() => store.list('Kids'), /active_user_required/);
});

test('invalid corrections preserve history; a zero correction moves the current range', () => {
  const store = createDemoStore(() => editor);
  const root = store.insert(input());
  for (const cost of [null, NaN, Infinity, -Infinity]) {
    const before = structuredClone(store.list('Kids'));
    assert.throws(() => store.correct({ ...input({ cost }), originalId: root.id, reason: 'Invalid' }), /^Error: negative_value_not_allowed$/);
    assert.deepEqual(store.list('Kids'), before);
  }
  const corrected = store.correct({ ...input({ startDate: '2026-10-08', endDate: '2026-10-14', spend: 0, cost: 0 }), originalId: root.id, reason: 'Zero correction' });
  assert.equal(corrected.id, 'demo-2', 'rejected corrections must not consume ids');
  assert.equal(corrected.revision, 2);
  assert.equal(aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-07').count, 0);
  assert.equal(aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-31').results, 0);
});

test('demo is explicit loopback-only and independent stores never share data', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) assert.equal(demoEnabled({ hostname, search: '?campaignDemo=1' }), true);
  for (const hostname of ['example.com', 'localhost.evil', '192.168.1.5']) assert.equal(demoEnabled({ hostname, search: '?campaignDemo=1' }), false);
  assert.equal(demoEnabled({ hostname: 'localhost', search: '' }), false);
  const one = createDemoStore(() => editor), two = createDemoStore(() => editor);
  one.insert(input());
  assert.deepEqual(two.list('Kids'), []);
});

test('same-clock sibling corrections have one current revision without mutating history', () => {
  const rows = [
    { id: 'root', revision: 1, spend: 100, cost: 10, is_correction: false },
    { id: 'second', revision: 2, spend: 60, cost: 6, is_correction: true, original_id: 'root' },
    { id: 'third', revision: 3, spend: 90, cost: 6, is_correction: true, original_id: 'root' },
  ].map(r => ({ ...r, campaign_name: 'Kids', start_date: '2026-10-01', end_date: '2026-10-07', created_at: '2026-10-01T00:00:00Z' }));
  const before = structuredClone(rows);
  assert.deepEqual(currentMetrics(rows).map(r => r.id), ['third']);
  const a = aggregateMetrics(rows, '2026-10-01', '2026-10-31');
  assert.equal(a.spend, 90);
  assert.equal(a.results, 15);
  assert.equal(a.count, 1);
  assert.deepEqual(rows, before);
});

test('demo corrections normalize roots and reject overlap against corrected active ranges atomically', () => {
  const store = createDemoStore(() => editor);
  const first = store.insert(input());
  store.correct({ ...input({ startDate: '2026-10-08', endDate: '2026-10-14', spend: 60, cost: 6 }), originalId: first.id, reason: 'Move' });
  const before = structuredClone(store.list('Kids'));
  assert.throws(() => store.insert(input({ startDate: '2026-10-08', endDate: '2026-10-14' })), /solapa/);
  assert.deepEqual(store.list('Kids'), before);
  const third = store.correct({ ...input({ startDate: '2026-10-15', endDate: '2026-10-21', spend: 90, cost: 6 }), originalId: first.id, reason: 'Again' });
  assert.equal(third.id, 'demo-3', 'rejected insert must not consume a demo id');
  assert.equal(third.original_id, first.id);
  assert.equal(third.revision, 3, 'correcting an old root advances the current revision');
  assert.deepEqual(currentMetrics(store.list('Kids')).map(r => r.id), [third.id]);
  assert.equal(aggregateMetrics(store.list('Kids'), '2026-10-01', '2026-10-31').spend, 90);
  const other = store.insert(input());
  const snapshot = structuredClone(store.list('Kids'));
  assert.throws(() => store.correct({ ...input({ campaignName: 'Other', startDate: '2026-10-15', endDate: '2026-10-21' }), originalId: other.id, reason: 'Conflict' }), /solapa/);
  assert.deepEqual(store.list('Kids'), snapshot);
});

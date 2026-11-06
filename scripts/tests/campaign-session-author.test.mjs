import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { filaCampanaHtml, resumenCampanasHtml, totalCampanasHtml, campaignTotals, campanasCsvLines, estadoVacioCampanasHtml } from '../../src/legacy/reportes.js';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('reach is absent consistently from reports, header, summaries and CSV while stored data stays intact', () => {
  const row = { name: 'Kids', alcance: 987654, gasto: 10, resultados: 2 };
  const totals = campaignTotals([row]);
  for (const html of [filaCampanaHtml(row), totalCampanasHtml(totals, 'Nov'), resumenCampanasHtml([row], totals, true)]) {
    assert.doesNotMatch(html, /987654|Alcance/);
  }
  assert.equal(row.alcance, 987654);
  const csv = campanasCsvLines([row], '2026-11', '2026-11-30');
  assert.doesNotMatch(csv.join('\n'), /987654|Alcance/);
  assert.equal(csv[3].split(',').length, 11);
  assert.equal((filaCampanaHtml(row).match(/<td /g) || []).length, 12);
  assert.match(estadoVacioCampanasHtml(false, 'Nov'), /colspan="12"/);
  const header = read('index.html').match(/<thead><tr><th class="p-3 text-left">Campaña[\s\S]*?<\/thead>/)[0];
  assert.doesNotMatch(header, /Alcance/);
});
test('0004 contains SQL only; additive author RPC is guarded, scoped, JSONB and read-only', () => {
  assert.doesNotMatch(read('supabase/migrations/202610300004_campaign_metrics_spend_cost.sql'), /\nSQL\n|echo "migration/);
  const path = 'supabase/migrations/202610300005_campaign_metrics_author_names.sql';
  assert.ok(existsSync(new URL(`../../${path}`, import.meta.url)), 'new additive read endpoint migration exists');
  const sql = read(path);
  assert.match(sql, /function public\.list_campaign_metrics_with_authors_v2\(p_campaign_name text\)/);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /if not public\.is_active_user\(\)/i);
  assert.match(sql, /left join public\.user_access \w+ on \w+\.user_id = \w+\.created_by/i);
  assert.match(sql, /'author_name'/);
  assert.match(sql, /p_campaign_name is null or/i);
  assert.match(sql, /revoke all on function .* from PUBLIC, anon;/i);
  assert.match(sql, /grant execute on function .* to authenticated;/i);
  assert.doesNotMatch(sql, /\b(insert into|update|delete from|create policy|grant select)\b/i);
});

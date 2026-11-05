import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { filaLeadHtml, tarjetaLeadMovilHtml } from '../../src/legacy/leads.js';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

test('approved table layout keeps nine proportional columns and accessible scrolling', () => {
  const table = html.match(/<section id="leadsResultsPanel"[\s\S]*?<\/section>/)?.[0];
  assert.ok(table, 'layout must be scoped to the lead results panel');
  assert.match(table, /id="leadsTableViewport"[^>]*tabindex="0"[^>]*role="region"/);
  assert.equal((table.match(/<th\b/g) || []).length, 9);
  assert.equal((table.match(/scope="col"/g) || []).length, 9);
  const widths = [...table.matchAll(/<col style="width:\s*(\d+)%"/g)].map(m => Number(m[1]));
  assert.equal(widths.length, 9);
  assert.equal(widths.reduce((a, b) => a + b, 0), 100);
  assert.ok(widths[2] > widths[1], 'lead name has more room than date');
  assert.ok(widths[8] >= 10, 'reserve space for all three admin actions');
  assert.match(css, /#leadsTable\s*\{[^}]*table-layout:\s*fixed[^}]*min-width:\s*1170px/s);
  assert.match(css, /#leadsTableBody td:not\(\[colspan\]\)\s*\{[^}]*height:\s*56px/s);
  assert.match(css, /#leadsTableBody td:nth-child\(3\) > div\s*\{[^}]*flex-direction:\s*row/s);
  assert.match(css, /#leadsTableBody td:nth-child\(9\) > div\s*\{[^}]*justify-content:\s*center/s);
  assert.match(css, /#leadsTable :is\(th, td\):is\(:nth-child\(1\), :nth-child\(2\), :nth-child\(7\), :nth-child\(8\), :nth-child\(9\)\)\s*\{[^}]*text-align:\s*center/s);
});

test('vibrant palette is scoped, documented and preserves semantic status labels', () => {
  const system = readFileSync('design/system.md', 'utf8');
  assert.match(css, /#leadsResultsPanel\s*\{[^}]*--leads-accent:\s*#4338ca/s);
  for (const color of ['#4338ca', '#047857', '#92400e', '#be123c']) {
    assert.ok(system.includes(color));
  }
  assert.match(css, /#leadsResultsPanel[^}]*bg-emerald-500[^}]*background(?:-color)?:\s*var\(--leads-positive\)/s);
  assert.match(css, /#leadsResultsPanel[^}]*bg-rose-500[^}]*background(?:-color)?:\s*var\(--leads-negative\)/s);
  for (const [status, family] of [['INSCRITO', 'emerald'], ['AGENDADO', 'amber'], ['No contesta', 'rose']]) {
    const markup = filaLeadHtml({ id: 1, GESTION: status }, { leadId: 1, origin: 'actual', isAdmin: false });
    assert.ok(markup.includes(status));
    assert.ok(markup.includes(`bg-${family}-500/15`));
  }
});

test('layout retains lead actions, historical badges, attribution and mobile cards', () => {
  const lead = { id: 5297, Nombre: '<Lead>', Telefono: '1 (202) 555-0100', AGENTE: 'Ana', __gestionEnRango: { autor: 'Jessica' }, GESTION: 'No contesta', 'FECHA INSCRIPCION': '2026-11-05' };
  const admin = filaLeadHtml(lead, { leadId: 5297, origin: 'actual', isAdmin: true });
  assert.equal((admin.match(/<td\b/g) || []).length, 9);
  for (const action of ['openEditLeadModal', 'openViewLeadModal', 'archiveLead']) assert.ok(admin.includes(action));
  assert.match(admin, /Jessica/);
  assert.match(admin, /Inscripción: 2026-11-05/);
  assert.match(admin, /&lt;Lead&gt;/);
  assert.match(admin, /href="tel:\+12025550100"/);
  const historical = filaLeadHtml(lead, { leadId: 5297, origin: 'historico', isAdmin: true });
  assert.doesNotMatch(historical, /archiveLead/);
  assert.match(historical, /2025/);
  const mobile = tarjetaLeadMovilHtml(lead, { leadId: 5297, origin: 'actual', isAdmin: false });
  assert.match(mobile, /Jessica/);
  assert.doesNotMatch(mobile, /archiveLead/);
  assert.equal(lead.AGENTE, 'Ana');
});

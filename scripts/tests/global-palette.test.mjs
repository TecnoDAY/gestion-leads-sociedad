import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync('src/index.css', 'utf8');
const system = readFileSync('design/system.md', 'utf8');
const luminance = hex => {
  const rgb = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};

test('global palette shares the approved semantic colors with accessible white labels', () => {
  for (const [name, hex] of Object.entries({ accent: '#4338ca', positive: '#047857', pending: '#92400e', negative: '#be123c' })) {
    assert.ok(css.includes(`--app-${name}: ${hex}`), `missing global ${name} token`);
    assert.ok(system.includes(hex));
    assert.ok(1.05 / (luminance(hex) + .05) >= 4.5, `${name} must have AA contrast with white`);
  }
  assert.match(css, /--app-on-color:\s*#ffffff/);
  assert.match(css, /--app-link:\s*#a5b4fc/);
});

test('global palette covers navigation, forms, statuses, reports, calendar and kanban without layout changes', () => {
  const palette = css.split('/* Global vibrant palette')[1];
  assert.ok(palette, 'global palette is explicitly bounded');
  for (const marker of ['.sidebar-nav-button.is-active', '.bottom-nav-button.is-active', '.metric-icon', '.lead-form-header', '.tasks-scope', '.kanban-column-header', '.fc-button-primary', '#reporteDiario', 'bg-rose-500/15', 'bg-emerald-500/15', 'bg-indigo-600']) {
    assert.ok(palette.includes(marker), `missing surface: ${marker}`);
  }
  assert.doesNotMatch(palette, /\b(?:display|visibility|opacity|position|width|height|pointer-events|content)\s*:/, 'palette must not change layout, visibility or interaction');
  assert.ok(palette.includes('button:not(:disabled):hover'), 'hover must preserve disabled semantics');
  assert.ok(palette.includes('[data-theme="dark"]'), 'dark theme keeps a readable link color');
});

// Encabezado del panel: sin refresco manual (realtime mantiene los datos).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('el encabezado no tiene boton de refresco manual (realtime mantiene los datos)', () => {
  const html = source('index.html');
  assert.doesNotMatch(html, /id="btnRefresh"/);
  assert.doesNotMatch(html, /refreshLeadsData/);
  assert.doesNotMatch(source('src/legacy/actions.js'), /'refreshLeadsData'/);
  assert.match(html, /\.channel\('public:leads:realtime'\)/);
});

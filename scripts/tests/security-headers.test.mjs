import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));

test('el modal RLS no publica SQL ejecutable ni accion de copia', () => {
  assert.match(html, /id="modalRls"/);
  assert.doesNotMatch(html, /CREATE TABLE IF NOT EXISTS public\.leads|copyRlsCode/);
});

test('las cabeceras de produccion cubren los avisos pasivos de ZAP', () => {
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-origin');
  assert.equal(headers['Cross-Origin-Embedder-Policy'], 'credentialless');
});

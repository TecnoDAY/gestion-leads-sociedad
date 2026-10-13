// Cabeceras de seguridad (fase 15): la CSP estricta vive en un <meta>
// generado por inline-dist (scripts/csp-utils.mjs); la cabecera HTTP de
// vercel.json conserva solo lo que un meta no soporta (frame-ancestors) y
// NO lleva fetch-directives de script/style (duplicarian la interseccion).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));

test('la cabecera HTTP conserva frame-ancestors y no duplica la politica del meta', () => {
  const csp = headers['Content-Security-Policy'];
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /base-uri 'self'/);
  // sin fetch-directives de script/style: esos los aporta el meta del build
  assert.doesNotMatch(csp, /script-src|style-src|default-src/);
  // y por supuesto sin inline abierto en ninguna parte de la config
  for (const value of Object.values(headers)) assert.doesNotMatch(value, /unsafe-inline/);
});

test('resto de cabeceras de seguridad intactas', () => {
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assert.equal(headers['Cross-Origin-Resource-Policy'], 'same-origin');
  assert.equal(headers['Cross-Origin-Embedder-Policy'], 'credentialless');
});

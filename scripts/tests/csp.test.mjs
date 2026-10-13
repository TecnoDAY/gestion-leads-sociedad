// Caracterizacion de la utilidad CSP del build (fase 15): hashes sobre los
// bloques inline finales, meta insertada antes del primer script, guardias.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bloquesInline, cspHtml, insertarMetaCsp, problemasCsp } from '../csp-utils.mjs';

const HTML_BASICO = `<html><head>
  <script src="https://cdn.jsdelivr.net/npm/x@1"></script>
  <script>
    const SUPABASE_URL = 'https://demo.supabase.co';
  </script>
</head><body>
  <style>body { color: #123456; }</style>
  <script type="module">console.log('bundle');</script>
</body></html>`;

test('extrae solo los bloques inline (sin src)', () => {
  const { scripts, styles } = bloquesInline(HTML_BASICO);
  assert.equal(scripts.length, 2);
  assert.equal(styles.length, 1);
  assert.match(scripts[0], /const SUPABASE_URL/);
});

test('politica estricta: hashes de todos los bloques y sin unsafe-inline', () => {
  const csp = cspHtml(HTML_BASICO);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/unpkg\.com 'sha256-/);
  assert.match(csp, /style-src 'self' 'sha256-/);
  assert.match(csp, /form-action 'self'/);
  assert.doesNotMatch(csp, /frame-ancestors/);
  // determinista y sin repeticion de hashes
  assert.equal(csp, cspHtml(HTML_BASICO));
  assert.equal(csp.split("'sha256-").length - 1, 3);
});

test('meta insertada tras <head> y antes del primer script inline', () => {
  const con = insertarMetaCsp(HTML_BASICO);
  const iHead = con.indexOf('<head>');
  const iMeta = con.indexOf('<meta http-equiv="Content-Security-Policy"');
  const iCDN = con.indexOf('<script src=');
  assert.ok(iMeta > iHead, 'el meta va despues de <head>');
  assert.ok(iMeta < iCDN, 'el meta va antes del primer script');
  // idempotente
  assert.equal(insertarMetaCsp(con), con);
});

test('guardia limpia cuando el artefacto es coherente', () => {
  const con = insertarMetaCsp(HTML_BASICO);
  assert.deepEqual(problemasCsp(con), []);
});

test('guardia detecta on*= y hashes desincronizados', () => {
  // on*= presente
  const conOn = insertarMetaCsp(HTML_BASICO).replace('<body>', '<body><button onclick="hola()">');
  const problemasOn = problemasCsp(conOn);
  assert.equal(problemasOn.length, 1);
  assert.match(problemasOn[0], /on\*=/);
  // bloque inline eliminado tras insertar el meta: descripcion desincronizada
  const conStale = insertarMetaCsp(HTML_BASICO).replace(/<script>[\s\S]*?<\/script>\s*\n\s*<\/head>/, '</head>');
  const problemasStale = problemasCsp(conStale);
  assert.equal(problemasStale.length, 1);
  assert.match(problemasStale[0], /desincronizado/);
});

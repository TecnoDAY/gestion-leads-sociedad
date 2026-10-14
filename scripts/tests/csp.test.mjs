// Caracterizacion de la utilidad CSP del build (fase 15): hashes sobre los
// bloques inline finales, meta insertada antes del primer script, guardias.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bloquesInline, cspHtml, cspPaginaEstatica, insertarMetaCsp, insertarMetaCspNonce, problemasCsp } from '../csp-utils.mjs';

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

test('guardia detecta on*= y hashes desincronizados', () => {  // on*= presente
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

// --- fase 23: paginas estaticas auxiliares (privacidad/404) ------------------
const PAGINA = `<html><head>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <style>
    body { color: #0f172a; }
  </style>
</head><body><a href="/">Volver</a></body></html>`;

test('pagina estatica: politica sin scripts ni formularios y hash del style', () => {
  const csp = cspPaginaEstatica(PAGINA);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /style-src 'self' 'sha256-/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.equal(csp.split("'sha256-").length - 1, 1);
  // metrica generica exige que exista un <style>: sin el, lanza
  assert.throws(() => cspPaginaEstatica('<html><head></head><body></body></html>'), /no tiene <style>/);
});

test('pagina estatica: insercion del meta y guardia limpia', () => {
  const con = insertarMetaCsp(PAGINA, cspPaginaEstatica(PAGINA));
  const iMeta = con.indexOf('<meta http-equiv="Content-Security-Policy"');
  const iStyle = con.indexOf('<style>');
  assert.ok(iMeta > con.indexOf('<head>') && iMeta < iStyle);
  assert.deepEqual(problemasCsp(con, cspPaginaEstatica(con)), []);
  // un <style> cambiado invalida el hash
  const stale = con.replace('color: #0f172a', 'color: #000');
  assert.match(problemasCsp(stale, cspPaginaEstatica(stale))[0], /desincronizado/);
});

// --- regresion calendario (2026-10-14): nonce para FullCalendar --------------
test('cspHtml: sin meta csp-nonce no anade nonce (comportamiento previo)', () => {
  assert.doesNotMatch(cspHtml(HTML_BASICO), /nonce-/);
});

test('cspHtml: con meta csp-nonce anade el nonce a style-src y conserva hashes', () => {
  const conNonce = insertarMetaCspNonce(HTML_BASICO, 'NONCE-TEST-123');
  const csp = cspHtml(conNonce);
  assert.match(csp, /style-src 'self' 'sha256-[^']*' 'nonce-NONCE-TEST-123'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  // script-src sigue sin nonce (FC solo necesita style)
  assert.doesNotMatch(csp.split(';').find(d => d.includes('script-src')), /nonce-/);
  // determinista
  assert.equal(csp, cspHtml(conNonce));
});

test('insertarMetaCspNonce: anade tras <head> y es idempotente (reemplaza)', () => {
  const una = insertarMetaCspNonce(HTML_BASICO, 'AAA');
  assert.ok(una.indexOf('<meta name="csp-nonce" content="AAA">') > una.indexOf('<head>'));
  const dos = insertarMetaCspNonce(una, 'BBB');
  assert.equal((dos.match(/<meta name="csp-nonce"/g) || []).length, 1);
  assert.match(dos, /content="BBB"/);
  assert.doesNotMatch(dos, /content="AAA"/);
});

test('flujo inline-dist: nonce + meta CSP coherentes pasan la guardia', () => {
  let html = insertarMetaCspNonce(HTML_BASICO, 'NONCE-X');
  html = insertarMetaCsp(html);
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /'nonce-NONCE-X'/);
  // el meta CSP va antes del primer script inline a pesar del nonce
  assert.ok(html.indexOf('<meta http-equiv="Content-Security-Policy"') < html.indexOf('<script src='));
  assert.deepEqual(problemasCsp(html), []);
  // reinyectar no duplica ni desincroniza
  assert.deepEqual(problemasCsp(insertarMetaCsp(html)), []);
});

test('cspPaginaEstatica: ignora el nonce (paginas sin FC)', () => {
  const conNonce = insertarMetaCspNonce(PAGINA, 'ZZZ');
  assert.doesNotMatch(cspPaginaEstatica(conNonce), /nonce-/);
});

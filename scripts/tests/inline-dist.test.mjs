import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cspPaginaEstatica, problemasCsp } from '../csp-utils.mjs';

const BUNDLE = 'const texto = "import(\\"./core-test.js\\")"; export const cargar = () => Promise.all([import(`./core-test.js`), import("./daygrid-test.js"), import(\'./timegrid-test.js\')]);';
const CSS = '@font-face{font-family:local;src:url(../fonts/test.woff2)} body{color:#123456}';
const ESTATICA = '<html><head><style>body{color:#123456}</style></head><body>Informacion</body></html>';

function ejecutar(t, bundle = BUNDLE) {
  const root = mkdtempSync(join(tmpdir(), 'inline-dist-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'dist/assets'), { recursive: true });
  mkdirSync(join(root, 'dist/fonts'));
  for (const file of ['inline-dist.mjs', 'csp-utils.mjs']) {
    copyFileSync(new URL(`../${file}`, import.meta.url), join(root, 'scripts', file));
  }
  writeFileSync(join(root, 'dist/index.html'), '<html><head><script type="module" crossorigin src="./assets/main-test.js"></script><link rel="modulepreload" href="./assets/core-test.js"><link rel="stylesheet" href="./assets/main-test.css"></head><body><img src="/favicon.svg"></body></html>');
  writeFileSync(join(root, 'dist/assets/main-test.js'), bundle);
  writeFileSync(join(root, 'dist/assets/main-test.css'), CSS);
  for (const name of ['core', 'daygrid', 'timegrid']) {
    writeFileSync(join(root, `dist/assets/${name}-test.js`), 'export default "calendar";');
  }
  writeFileSync(join(root, 'dist/fonts/test.woff2'), 'font-fixture');
  for (const page of ['privacidad.html', '404.html']) writeFileSync(join(root, 'dist', page), ESTATICA);
  const result = spawnSync(process.execPath, [join(root, 'scripts/inline-dist.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /inline-dist: dist\/index.html autocontenido/);
  for (const page of ['privacidad.html', '404.html']) assert.ok(result.stdout.includes(`inline-dist: dist/${page} con CSP estricta en meta`));
  return { root, html: readFileSync(join(root, 'dist/index.html'), 'utf8') };
}

test('los imports de calendario inline resuelven a los chunks emitidos en raiz y subdirectorio', t => {
  const { root, html } = ejecutar(t);
  const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, 'el bundle inline necesita un mapa para conservar su base assets/');
  const { imports } = JSON.parse(match[1]);
  assert.ok(html.indexOf(match[0]) < html.indexOf('<script type="module">'));
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf(match[0]));
  for (const base of ['https://example.test/index.html', 'https://example.test/panel/index.html']) {
    const entries = new Map(Object.entries(imports).map(([key, value]) => [new URL(key, base).href, new URL(value, base).href]));
    for (const name of ['core', 'daygrid', 'timegrid']) {
      const specifier = `./${name}-test.js`;
      // Tanto import() como el preload de Vite resuelven una URL normalizada.
      const resolved = entries.get(new URL(specifier, base).href);
      assert.equal(resolved, new URL(specifier, new URL('./assets/main-test.js', base)).href);
      assert.equal(readFileSync(join(root, 'dist/assets', `${name}-test.js`), 'utf8'), 'export default "calendar";');
    }
  }
  assert.ok(html.includes(`<script type="module">${BUNDLE}</script>`), 'no reescribe imports aparentes dentro de cadenas ni el codigo');
  assert.deepEqual(problemasCsp(html), [], 'los hashes deben cubrir tambien el import map');
});

test('conserva CSS, fuentes, escape de script, nonce y paginas estaticas con CSP estricta', t => {
  const bundle = 'console.log("</script>");';
  const { root, html } = ejecutar(t, bundle);
  assert.ok(html.includes('<script type="module">console.log("<\\/script>");</script>'));
  assert.ok(html.includes(`url(data:font/woff2;base64,${Buffer.from('font-fixture').toString('base64')})`));
  assert.ok(html.includes('body{color:#123456}'));
  assert.ok(html.includes('src="favicon.svg"'));
  assert.doesNotMatch(html, /<link rel="(?:stylesheet|modulepreload)"/);
  assert.match(html, /<meta name="csp-nonce" content="[^"]+">/);
  assert.match(html, /style-src[^;]*'nonce-/);
  assert.deepEqual(problemasCsp(html), []);
  for (const page of ['privacidad.html', '404.html']) {
    const contenido = readFileSync(join(root, 'dist', page), 'utf8');
    assert.ok(contenido.includes('<body>Informacion</body>'));
    assert.match(contenido, /script-src 'none'/);
    assert.deepEqual(problemasCsp(contenido, cspPaginaEstatica(contenido)), []);
  }
});

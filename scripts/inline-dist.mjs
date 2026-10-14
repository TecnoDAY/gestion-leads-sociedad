#!/usr/bin/env node
// Convierte dist/index.html en un archivo estatico autocontenido: incrusta el
// CSS y el bundle JS generados por Vite y reescribe las rutas locales a
// relativas. Asi el panel funciona abriendo el archivo directo (file://),
// con un servidor simple o en cualquier plataforma sin paso de build,
// como promete el README.
//
// Guardia anti-regresion: si tras el proceso queda cualquier referencia a
// /assets o /src, el script termina en error y rompe el build/CI.
//
// Uso: node scripts/inline-dist.mjs  (lo encadena `pnpm build`)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cspPaginaEstatica, insertarMetaCsp, insertarMetaCspNonce, problemasCsp } from './csp-utils.mjs';
import { randomBytes } from 'node:crypto';

const dist = new URL('../dist/', import.meta.url);
const htmlPath = join(dist.pathname, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const originalLength = html.length;

// 1. CSS compilado -> <style> inline.
html = html.replace(
  /<link\s+rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/i,
  (_, ruta) => `<style>${readFileSync(join(dist.pathname, ruta), 'utf8')}</style>`,
);

// 2. Bundle JS -> <script type="module"> inline. Se escapa </script para no
//    cerrar el tag antes de tiempo (dentro de JS, \/ equivale a /).
html = html.replace(
  /<script\s+type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"[^>]*><\/script>/i,
  (_, ruta) => {
    const codigo = readFileSync(join(dist.pathname, ruta), 'utf8')
      .replace(/<\/script/gi, '<\\/script');
    return `<script type="module">${codigo}</script>`;
  },
);

// 3. Preloads de chunks que ya no existen (van inline) y rutas absolutas locales.
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');
html = html.replace(/(href|src)="\/(?!\/)/g, '$1="');
// El CSS compilado (en /assets/) referencia public/ como ../fonts/...; al
// incrustarlo en dist/index.html la base pasa a ser el documento -> ./fonts/.
// (url(https:// y url(data: no empiezan por ../ ni /, no se tocan.)
html = html.replace(/url\((['"]?)\.\.\//g, 'url($1./');
html = html.replace(/url\((['"]?)\/(?!\/)/g, 'url($1./');

// 3b. Fuentes locales -> data: (fase 15): con la CSP estricta en un meta,
// file:// tiene origen nulo y 'self' no matchea; las fuentes viajarias
// quedarian bloqueadas al abrir el archivo directo. Incrustadas como data:
// el artefacto es UN fichero y font-src 'self' data: basta.
html = html.replace(/url\((['"]?)\.\/fonts\/([^)'"]+\.woff2)\1\)/g, (m, q, nombre) => {
  const ruta = join(dist.pathname, 'fonts', decodeURIComponent(nombre));
  const base64 = readFileSync(ruta).toString('base64');
  return `url(${q}data:font/woff2;base64,${base64}${q})`;
});

// 4. Guardia: debe quedar autocontenido (solo CDN y data:).
const pendientes = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g) || [];
if (pendientes.length > 0) {
  console.error(`inline-dist: quedan referencias locales sin incrustar:\n  ${pendientes.join('\n  ')}`);
  process.exit(1);
}
if (/<style>/.test(html) === false || /<script type="module">\s*\S/.test(html) === false) {
  console.error('inline-dist: no se encontro CSS o bundle JS que incrustar; ¿cambio la salida de Vite?');
  process.exit(1);
}
if (/url\((['"]?)\.\/fonts\//.test(html)) {
  console.error('inline-dist: quedan fuentes locales sin incrustar como data: (file:// se quedaria sin fuentes)');
  process.exit(1);
}

// 5. CSP estricta (fase 15): hashes de los bloques inline finales en un meta
// dentro del propio HTML; auspiciado ANTES del primer script inline. La
// cabecera HTTP (vercel.json) conserva solo lo que el meta no soporta
// (frame-ancestors). Sin este paso, la CSP por defecto bloquearia los
// bloques inline del artefacto autocontenido.
// Regresion calendario (2026-10-14): FullCalendar v6 inyecta su CSS base con
// un <style> creado en runtime (nonce via meta[name=csp-nonce]); los hashes
// de style-src no lo cubren. Se fija/un genera un nonce por artefacto y la
// politica (cspHtml) lo detecta del propio HTML, manteniendo problemasCsp
// idempotente.
if (!/<meta\s+name="csp-nonce"\s+content="[^"]+"/i.test(html)) {
  html = insertarMetaCspNonce(html, randomBytes(16).toString('base64'));
}
html = insertarMetaCsp(html);
const problemas = problemasCsp(html);
if (problemas.length > 0) {
  console.error(`inline-dist: el artefacto no pasa la guardia CSP:\n  ${problemas.join('\n  ')}`);
  process.exit(1);
}

writeFileSync(htmlPath, html, 'utf8');
console.log(`inline-dist: dist/index.html autocontenido (${(originalLength / 1024).toFixed(0)} kB -> ${(html.length / 1024).toFixed(0)} kB), CSP estricta en meta`);

// 6. Paginas estaticas auxiliares (fase 23): privacidad y 404 tambien
//    llevan su propia meta estricta con el hash de su <style> inline.
for (const pagina of ['privacidad.html', '404.html']) {
  const ruta = join(dist.pathname, pagina);
  if (!existsSync(ruta)) { console.error(`inline-dist: falta dist/${pagina}`); process.exit(1); }
  const original = readFileSync(ruta, 'utf8');
  const conMeta = insertarMetaCsp(original, cspPaginaEstatica(original));
  const fallos = problemasCsp(conMeta, cspPaginaEstatica(conMeta));
  if (fallos.length > 0) {
    console.error(`inline-dist: ${pagina} no pasa la guardia CSP:\n  ${fallos.join('\n  ')}`);
    process.exit(1);
  }
  writeFileSync(ruta, conMeta, 'utf8');
  console.log(`inline-dist: dist/${pagina} con CSP estricta en meta`);
}

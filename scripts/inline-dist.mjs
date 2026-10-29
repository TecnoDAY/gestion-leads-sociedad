#!/usr/bin/env node
// Convierte dist/index.html y dist/kanban.html en archivos estaticos autocontenidos.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cspPaginaEstatica, insertarMetaCsp, insertarMetaCspNonce, problemasCsp } from './csp-utils.mjs';
import { randomBytes } from 'node:crypto';

const dist = new URL('../dist/', import.meta.url);
const PAGINAS_PRINCIPALES = ['index.html'];

function inlinePagina(nombre) {
  const htmlPath = join(dist.pathname, nombre);
  if (!existsSync(htmlPath)) { console.error(`inline-dist: falta dist/${nombre}`); process.exit(1); }
  let html = readFileSync(htmlPath, 'utf8');
  const originalLength = html.length;

  // 1. CSS compilado -> <style> inline.
  html = html.replace(
    /<link\s+rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/i,
    (_, ruta) => `<style>${readFileSync(join(dist.pathname, ruta), 'utf8')}</style>`,
  );
  // 2. Bundle JS -> <script type="module"> inline.
  html = html.replace(
    /<script\s+type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"[^>]*><\/script>/i,
    (_, ruta) => {
      const codigo = readFileSync(join(dist.pathname, ruta), 'utf8').replace(/<\/script/gi, '<\\/script');
      return `<script type="module">${codigo}</script>`;
    },
  );
  // 3. Preloads y rutas absolutas locales.
  html = html.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');
  html = html.replace(/(href|src)="\/(?!\/)/g, '$1="');
  html = html.replace(/url\((['"]?)\.\.\//g, 'url($1./');
  html = html.replace(/url\((['"]?)\/(?!\/)/g, 'url($1./');
  // 3b. Fuentes locales -> data:
  html = html.replace(/url\((['"]?)\.\/fonts\/([^)'"]+\.woff2)\1\)/g, (m, q, nombreF) => {
    const ruta = join(dist.pathname, 'fonts', decodeURIComponent(nombreF));
    const base64 = readFileSync(ruta).toString('base64');
    return `url(${q}data:font/woff2;base64,${base64}${q})`;
  });

  // 4. Guardias.
  const pendientes = html.match(/(?:src|href)="\/(?!\/)[^"]*"/g) || [];
  if (pendientes.length > 0) {
    console.error(`inline-dist: quedan referencias locales sin incrustar en ${nombre}:\n  ${pendientes.join('\n  ')}`);
    process.exit(1);
  }
  const originalHtml = readFileSync(htmlPath, 'utf8');
  const teniaBundleLocal = /<link\s+rel="stylesheet"[^>]*href="\.?\/?assets\//i.test(originalHtml) || /<script\s+type="module"[^>]*src="\.?\/?assets\//i.test(originalHtml);
  if (teniaBundleLocal && (/<style>/.test(html) === false || /<script type="module">\s*\S/.test(html) === false)) {
    console.error(`inline-dist: no se encontro CSS o bundle JS en ${nombre}`);
    process.exit(1);
  }
  if (/url\((['"]?)\.\/fonts\//.test(html)) {
    console.error(`inline-dist: quedan fuentes locales sin incrustar en ${nombre}`);
    process.exit(1);
  }

  // 5. CSP estricta.
  if (!/<meta\s+name="csp-nonce"\s+content="[^"]+"/i.test(html)) {
    html = insertarMetaCspNonce(html, randomBytes(16).toString('base64'));
  }
  html = insertarMetaCsp(html);
  const problemas = problemasCsp(html);
  if (problemas.length > 0) {
    console.error(`inline-dist: ${nombre} no pasa la guardia CSP:\n  ${problemas.join('\n  ')}`);
    process.exit(1);
  }

  writeFileSync(htmlPath, html, 'utf8');
  console.log(`inline-dist: dist/${nombre} autocontenido (${(originalLength / 1024).toFixed(0)} kB -> ${(html.length / 1024).toFixed(0)} kB)`);
}

for (const pagina of PAGINAS_PRINCIPALES) inlinePagina(pagina);

// 6. Paginas estaticas auxiliares.
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

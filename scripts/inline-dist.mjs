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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

writeFileSync(htmlPath, html, 'utf8');
console.log(`inline-dist: dist/index.html autocontenido (${(originalLength / 1024).toFixed(0)} kB -> ${(html.length / 1024).toFixed(0)} kB)`);

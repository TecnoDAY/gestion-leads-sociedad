import tailwindcss from '@tailwindcss/vite';
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const productionHeaders = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
    .headers[0].headers as {key: string; value: string}[];
  const headers = Object.fromEntries(productionHeaders.map(({key, value}) => [key, value]));
  // HMR utiliza WebSocket local; Vercel no necesita esta excepcion.
  // Dev usa una CSP relajada (unico lugar con 'unsafe-inline'): el HMR
  // inyecta <style>/scripts inline y romperia con la politica estricta. La
  // politica real del artefacto se ejercita con `pnpm preview`: inline-dist
  // escribe un meta CSP con hashes en dist/index.html y la cabecera HTTP
  // (sin fetch-directives de script/style) no la estreche por interseccion.
  const SUPABASE = 'https://hkkuyomlcqyxtzblowle.supabase.co';
  const devHeaders = { ...headers, 'Content-Security-Policy': [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${SUPABASE}`,
    "font-src 'self' data:",
    `connect-src 'self' ws://localhost:* ws://127.0.0.1:* ${SUPABASE} wss://hkkuyomlcqyxtzblowle.supabase.co`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ') };
  return {
    // React eliminado: el panel es un monolito index.html + modulos JS.
    plugins: [tailwindcss()],
    // base relativa: dist/index.html funciona tambien abriendo el archivo
    // directo (file://) o desde cualquier servidor estatico, como promete
    // el README ("archivo estatico autocontenido").
    base: './',
    build: {
      rollupOptions: {
        output: {
          // Un solo chunk: el inliner (scripts/inline-dist.mjs) incrusta el
          // bundle completo en dist/index.html tras el build. (inlineDynamicImports
          // esta obsoleto desde Rollup 4.x / Vite 8.)
          codeSplitting: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': dirname(fileURLToPath(import.meta.url)),
      },
    },
    server: {
      headers: devHeaders,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {headers},
  };
});

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
  headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
    'connect-src ', 'connect-src ws://localhost:* ws://127.0.0.1:* ',
  );
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
      headers,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {headers},
  };
});

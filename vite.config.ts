import tailwindcss from '@tailwindcss/vite';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig(() => {
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
          // bundle completo en dist/index.html tras el build.
          inlineDynamicImports: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': dirname(fileURLToPath(import.meta.url)),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

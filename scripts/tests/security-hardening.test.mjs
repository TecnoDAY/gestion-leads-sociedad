// Endurecimiento de seguridad (odd/tasks/security-hardening.md); sin red ni datos reales.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');

test('S1: kanban.html standalone retirado del repo y del build', async () => {
  assert.equal(existsSync(new URL('kanban.html', root)), false);
  const { default: configure } = await import(new URL('vite.config.ts', root).href);
  const config = configure({ command: 'build', mode: 'production' });
  assert.deepEqual(config.build.rollupOptions.input, { main: 'index.html' });
  assert.doesNotMatch(source('scripts/inline-dist.mjs'), /kanban\.html/);
});

test('S1: /kanban.html redirige a / en Vercel', () => {
  const vercel = JSON.parse(source('vercel.json'));
  assert.deepEqual(vercel.redirects, [{ source: '/kanban.html', destination: '/', permanent: true }]);
});

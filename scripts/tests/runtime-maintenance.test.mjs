// Contratos locales de mantenimiento; sin red, SDK reales ni datos del CRM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes('function miamiToday'));

function extractFunctions(name) {
  return [...script.matchAll(new RegExp(`function\\s+${name}\\s*\\(`, 'g'))].map(match => {
    for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
      const candidate = script.slice(match.index, end + 1);
      try { new vm.Script(`(${candidate})`); return candidate; }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    throw new Error(`No se pudo extraer ${name}`);
  });
}

for (const url of [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2',
  'https://unpkg.com/lucide@1.49.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.1',
]) {
  test(`runtime frontend fija ${url}`, () => {
    assert.ok(html.includes(`<script src="${url}"></script>`));
  });
}

for (const name of ['authorize-user', 'change-user-email', 'meta-whatsapp-webhook']) {
  test(`${name} conserva createClient ESM en Supabase 2.117.1`, () => {
    const source = readFileSync(new URL(`supabase/functions/${name}/index.ts`, root), 'utf8');
    assert.equal(source.split('\n').find(line => line.includes('import { createClient }')),
      "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1';");
  });
}

test('npm test expone la suite existente sin modificar puertos dev', () => {
  assert.equal(pkg.scripts.test, 'node --test scripts/tests/*.test.mjs');
  assert.equal(pkg.scripts.dev, 'vite --port=3000 --host=0.0.0.0');
});

test('helpers Miami tienen una sola implementacion canonica', () => {
  for (const name of ['miamiToday', 'miamiDayBounds']) {
    const copies = extractFunctions(name);
    assert.ok(copies.length > 0);
    assert.ok(copies.every(copy => copy === copies[0]), `${name}: no deduplicar implementaciones distintas`);
    assert.equal(copies.length, 1);
  }
});

test('miamiDayBounds conserva medianoche, DST, leap day y entradas invalidas', () => {
  const bounds = vm.runInNewContext(`(${extractFunctions('miamiDayBounds')[0]})`);
  const cases = [
    ['2026-01-15', ['2026-01-15T05:00:00.000Z', '2026-01-16T05:00:00.000Z']],
    ['2026-07-15', ['2026-07-15T04:00:00.000Z', '2026-07-16T04:00:00.000Z']],
    ['2026-03-08', ['2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z']],
    ['2026-11-01', ['2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z']],
    ['2024-02-29', ['2024-02-29T05:00:00.000Z', '2024-03-01T05:00:00.000Z']],
    ['', [null, null]], [null, [null, null]], ['not-a-date', [null, null]],
  ];
  for (const [input, expected] of cases) assert.deepEqual(Array.from(bounds(input)), expected);
});

test('miamiToday conserva el dia Miami a ambos lados de medianoche', () => {
  for (const [instant, expected] of [
    ['2026-01-15T04:59:00Z', '2026-01-14'], ['2026-01-15T05:00:00Z', '2026-01-15'],
    ['2026-07-15T03:59:00Z', '2026-07-14'], ['2026-07-15T04:00:00Z', '2026-07-15'],
  ]) {
    const today = vm.runInNewContext(`(${extractFunctions('miamiToday')[0]})`, {
      Date: class extends Date { constructor() { super(instant); } },
    });
    assert.equal(today(), expected);
  }
});

test('Vite carga ESM nativo, conserva alias absoluto y ambas opciones HMR', async () => {
  const previous = process.env.DISABLE_HMR;
  try {
    for (const disabled of ['false', 'true']) {
      process.env.DISABLE_HMR = disabled;
      const url = new URL('vite.config.ts', root);
      url.searchParams.set('hmr', disabled);
      const { default: configure } = await import(url.href);
      const config = configure({ command: 'serve', mode: 'development' });
      assert.equal(config.resolve.alias['@'], dirname(fileURLToPath(new URL('vite.config.ts', root))));
      assert.equal(config.server.hmr, disabled !== 'true');
      assert.deepEqual(config.server.watch, disabled === 'true' ? null : {});
      assert.ok(config.plugins.length > 0);
    }
  } finally {
    if (previous === undefined) delete process.env.DISABLE_HMR;
    else process.env.DISABLE_HMR = previous;
  }
});

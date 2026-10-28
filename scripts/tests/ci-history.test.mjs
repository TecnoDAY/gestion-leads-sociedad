import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CI descarga la historia necesaria para el golden de admin-usuarios', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /uses: actions\/checkout@v4\s+with:[^\n]*\n(?:\s*#[^\n]*\n)*\s+fetch-depth: 0/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
test('campaign card uses content height with bounded viewport scroll, not a full-height drawer', () => {
  const panel = css.match(/\.campaign-metrics-panel \{([^}]+)\}/)[1];
  assert.match(panel, /bottom:\s*auto/);
  assert.match(panel, /max-height:\s*calc\(100dvh - 2rem\)/);
  assert.match(panel, /border-radius:\s*1\.25rem/);
  assert.match(panel, /overflow-y:\s*auto/);
});

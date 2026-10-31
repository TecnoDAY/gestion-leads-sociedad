import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { diarioCsvLines, totalDiario } from '../../src/legacy/reportes.js';

test('CSV no inventa cero sin contrato de altas, tampoco en TOTAL', () => {
  for (const value of [undefined, null, -1, 0.5, '3', NaN, Infinity]) {
    const b = { autor_name: '=Ana', inscritos: { total: 999 }, inscripciones_realizadas: value };
    const before = structuredClone(b);
    const lines = diarioCsvLines('2026-10-30', '', '2026-10-30', [b, { inscripciones_realizadas: 2 }], []);
    assert.equal(lines[5].split(',').at(-1), '""');
    assert.equal(lines.at(-1).split(',').at(-1), '""');
    assert.match(lines[5], /^"'=Ana"/);
    assert.deepEqual(b, before);
  }
  assert.equal(diarioCsvLines('2026-10-30', '', '2026-10-30', [], []).at(-1).split(',').at(-1), '""');
});

// Comparacion estructural, NO prueba de ejecucion PostgreSQL. Fija que el
// nuevo contrato es aditivo frente al cuerpo vigente del baseline del repo.
test('migracion diaria conserva literalmente la logica previa fuera del nuevo conteo', () => {
  const base = readFileSync(new URL('../../supabase/migrations/00000000000000_baseline.sql', import.meta.url), 'utf8')
    .match(/CREATE OR REPLACE FUNCTION "public"\."daily_management_report"[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)[1];
  const migration = readFileSync(new URL('../../supabase/migrations/202610300001_reporte_diario_inscritos.sql', import.meta.url), 'utf8');
  const body = migration.match(/as \$\$([\s\S]*?)\$\$;/)[1];
  const previousLogic = body
    .replace(/  inscripciones as \([\s\S]*?\n  booked as \(/, '  booked as (')
    .replace(/^.*as inscripciones_realizadas,\n/gm, '')
    .replace(/^.*'inscripciones_realizadas',.*\n/gm, '')
    .replace(/b\.inscripciones_realizadas, |e\.inscripciones_realizadas, /g, '');
  const normalized = text => text.replace(/^\s*--.*$/gm, '').replace(/\s+/g, '');
  assert.equal(normalized(previousLogic), normalized(base));
  assert.match(migration, /public\._crm_inscripcion_eventos\(\)/);
  assert.doesNotMatch(body, /from public\.crm_inscripciones_historial/);
  assert.match(migration, /revoke all on function public\.daily_management_report\(date, uuid\) from public, anon;/);
  assert.match(migration, /grant execute on function public\.daily_management_report\(date, uuid\) to authenticated;/);
});

test('no publica sumas inseguras de altas', () => {
  const bloques = [{ inscripciones_realizadas: Number.MAX_SAFE_INTEGER }, { inscripciones_realizadas: 1 }];
  assert.equal(totalDiario(bloques).i, null);
  assert.equal(diarioCsvLines('2026-10-30', '', '2026-10-30', bloques, []).at(-1).split(',').at(-1), '""');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { detallesBloqueHtml, diarioCsvLines, csvReporteField } from '../../src/legacy/reportes.js';

const migration = readFileSync(new URL('../../supabase/migrations/202610160006_daily_report_management_detail.sql', import.meta.url), 'utf8');

test('SQL real del reporte: WhatsApp combinado, puro, procedencia y aislamiento (SQLite local)', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'scripts/tests/test_daily_report_whatsapp.py', '-v'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 6 tests/);
});

test('migracion siguiente conserva cuerpo aplicado salvo criterio de seguimientos del detalle', () => {
  const previous = readFileSync(new URL('../../supabase/migrations/202610160005_daily_report_whatsapp_detail.sql', import.meta.url), 'utf8');
  const body = sql => sql.slice(sql.indexOf('declare result jsonb;'), sql.indexOf('\n$$;'));
  const expected = body(previous)
    .replace("canal in ('whatsapp', 'llamada y whatsapp') and gestion_anterior is not null", "canal not in ('llamada', 'llamada data dura', 'visita conservatorio') and gestion_anterior is not null")
    .replace(/^ *--.*\n/gm, '');
  const actual = body(migration)
    .replace(/^ *--.*\n/gm, '');
  assert.equal(actual, expected);
  assert.match(migration, /security definer\nset search_path = public/);
  assert.match(migration, /revoke all on function public\.daily_management_report\(date, uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.daily_management_report\(date, uuid\) to authenticated/);
});

test('pantalla y CSV admiten detalle WhatsApp mayor que canal WhatsApp sin inflar total canales', () => {
  const block = {
    autor_name: 'Ana', autor_user_id: 'a', gestionados: 7,
    whatsapp: { nuevos: 2, gestionados: 4, total: 6 },
    canales: { llamada: 1, data_dura: 0, llamada_whatsapp: 2, whatsapp: 2, instagram: 1, visita: 0, sin_clasificar: 1, total: 7 },
    llamadas: { del_dia: 1, data_dura: 0, llamada_whatsapp: 2, total: 3 },
  };
  const lines = diarioCsvLines('2026-10-16', '', '2026-10-16', [block], []);
  const header = lines[4].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const row = lines.at(-2).split(',');
  const total = lines.at(-1).split(',');
  for (const [label, expected] of [['WhatsApp nuevos hoy', 2], ['WhatsApp gestionados hoy', 4], ['Total WhatsApp', 6], ['Total canales', 7], ['Gestiones realizadas', 7]]) {
    const index = header.indexOf(csvReporteField(label));
    assert.ok(index >= 0, label);
    assert.equal(row[index], csvReporteField(String(expected)), label);
    assert.equal(total[index], row[index], `TOTAL ${label}`);
  }
  const html = detallesBloqueHtml(block);
  assert.match(html, /Detalle de gestión/);
  assert.match(html, /WhatsApp nuevos hoy<\/td><td[^>]*>2<\/td>/);
  assert.match(html, /WhatsApp gestionados hoy<\/td><td[^>]*>4<\/td>/);
  assert.doesNotMatch(html, /Total detalle de gestión/);
  assert.doesNotMatch(html, /Detalle WhatsApp/);
  assert.equal(header.length, row.length);
});

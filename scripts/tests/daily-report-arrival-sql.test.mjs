import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { detalleGestionHoy, detallesBloqueHtml, diarioCsvLines } from '../../src/legacy/reportes.js';

const migration = readFileSync(new URL('../../supabase/migrations/202610200003_daily_report_llamada_whatsapp_grupo.sql', import.meta.url), 'utf8');

test('particiones reales SQL: llegada, alta, canales, legacy, autor y limites Miami', () => {
  const result = spawnSync('python3', ['-m', 'unittest', 'scripts/tests/test_daily_report_arrival.py', '-v'], { cwd: new URL('../..', import.meta.url), encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 6 tests/);
});

test('RPC conserva guardia/ACL, citas y JSON; nuevo depende solo del evento', () => {
  const base = readFileSync(new URL('../../supabase/migrations/202610160008_daily_report_event_new.sql', import.meta.url), 'utf8');
  const section = (sql, start, end) => sql.slice(sql.indexOf(start), sql.indexOf(end));
  // Los actores eventdate el CTE result_events, pero booked/gest permanecen estables.
  assert.match(section(migration, '  booked as (', '  gest as ('), /result_events as \(/);
  assert.match(migration, /result_events as \(/);
  assert.match(migration, /not public\.is_active_user\(\) or not \(public\.is_crm_user\(\) or public\.is_campaign_editor\(\)\)/);
  assert.match(migration, /security definer\nset search_path = public/);
  assert.match(migration, /revoke all on function public\.daily_management_report\(date, uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.daily_management_report\(date, uuid\) to authenticated/);
  const gest = section(migration, '  gest as (', '  blocks as (');
  assert.match(gest, /\(g.gestion_anterior is null\) as es_nuevo/);
  assert.match(gest, /where g.fecha_gestion = p_fecha/);
  assert.doesNotMatch(gest, /created_at|::date|to_date/);
  assert.doesNotMatch(migration, /lead_date_parts|lead_date_numbers|dated_leads|capture_date/);
  const base008 = readFileSync(new URL('../../supabase/migrations/202610160008_daily_report_event_new.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(base008, /action_name/);
  assert.ok(migration.includes("result_events e where e.action_user_id is not distinct from f.user_id"), "result attribution missing");
  assert.match(migration, /public\._daily_report_data_dura\(mes, fecha, p_fecha\)/);
});

const fields = line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(v => v.slice(1, -1));
test('helper UI/CSV individual y TOTAL separa llamadas y combinado; valores serializados', () => {
  const b = { autor_name: 'Ana', gestionados: 12, canales: { whatsapp: 2, llamada_whatsapp: 3, instagram: 1, visita: 1, sin_clasificar: 1, llamada: '3', data_dura: '1', total: 12 }, whatsapp: { nuevos: 3 }, llamadas: { del_dia: '3', data_dura: '1', llamada_whatsapp: 3, total: 7, nuevos: '1' } };
  const before = structuredClone(b);
  // La llamada combinada suma en llamadas: WhatsApp = 2+1+1+1 = 5, llamadas = 3+1+3 = 7.
  assert.deepEqual(detalleGestionHoy(b), { nuevos: 3, gestionados: 2, total: 5 });
  assert.deepEqual(detalleGestionHoy(b, 'llamadas'), { nuevos: 1, gestionados: 6, total: 7 });
  const html = detallesBloqueHtml(b);
  assert.match(html, /Total grupo WhatsApp<\/td><td[^>]*>5<\/td>/);
  assert.match(html, /<h6[^>]*>Llamadas<\/h6>/);
  const calls = html.split(/<h6[^>]*>Llamadas<\/h6>/)[1].split('</div>')[0];
  assert.match(calls, /Llamadas nuevas hoy<\/td><td[^>]*>1<\/td>/);
  assert.match(calls, /Llamadas gestionadas hoy<\/td><td[^>]*>6<\/td>/);
  assert.match(calls, /Llamadas del día<\/td><td[^>]*>3<\/td>/);
  assert.match(calls, /Llamadas Data Dura<\/td><td[^>]*>1<\/td>/);
  assert.match(calls, /Llamada WhatsApp<\/td><td[^>]*>3<\/td>/);
  assert.match(calls, /Total llamadas<\/td><td[^>]*>7<\/td>/);
  assert.equal((calls.match(/<tr/g) || []).length, 6);
  assert.doesNotMatch(calls, /Llamadas normales|Total llamadas de gestión/);
  assert.match(html, /Llamada<\/td><td[^>]*>3<\/td>/);
  assert.match(html, /Llamada Data Dura<\/td><td[^>]*>1<\/td>/);
  const lines = diarioCsvLines('2026-10-16', 'Ana', '2026-10-16', [b, b], []);
  const header = fields(lines[5]), rows = lines.slice(6).map(fields);
  for (const [label, expected] of [['Total WhatsApp', [5, 5, 10]], ['Llamadas nuevos hoy', [1, 1, 2]], ['Llamadas gestionados hoy', [6, 6, 12]], ['Total llamadas de gestión', [7, 7, 14]], ['Total llamadas', [7, 7, 14]], ['Llamadas del día', [3, 3, 6]], ['Llamadas Data Dura', [1, 1, 2]], ['Llamada WhatsApp', [3, 3, 6]], ['Gestiones realizadas', [12, 12, 24]], ['Total canales', [12, 12, 24]]]) {
    assert.deepEqual(rows.map(row => Number(row[header.indexOf(label)])), expected, label);
  }
  assert.deepEqual(b, before);
  assert.deepEqual(detalleGestionHoy({ canales: null, llamadas: null }, 'llamadas'), { nuevos: 0, gestionados: 0, total: 0 });
});

test('seleccion de grupo y conteos llamadas invalidos bloquean UI/CSV sin clamp', () => {
  assert.throws(() => detalleGestionHoy({}, 'otro'), /grupo inválido/);
  for (const value of [-1, 0.1, true, '', ' ', 'abc', Infinity, NaN, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    for (const b of [{ canales: { llamada: value } }, { canales: { data_dura: value } }, { canales: { llamada_whatsapp: value } }, { llamadas: { nuevos: value } }]) {
      assert.throws(() => detalleGestionHoy(b, 'llamadas'), /conteos inválidos/);
      assert.match(detallesBloqueHtml(b), /role="alert"/);
      assert.throws(() => diarioCsvLines('2026-10-16', '', '', [b], []), /Detalle de gestión no disponible/);
    }
  }
  const tooMany = { canales: { llamada: 1, data_dura: 1, llamada_whatsapp: 0 }, llamadas: { nuevos: 3 } };
  assert.throws(() => detalleGestionHoy(tooMany, 'llamadas'), /Llamadas nuevos supera/);
  const large = { canales: { llamada: Number.MAX_SAFE_INTEGER }, llamadas: { nuevos: 0 } };
  assert.throws(() => diarioCsvLines('', '', '', [large, large], []), /conteos inválidos/);
});

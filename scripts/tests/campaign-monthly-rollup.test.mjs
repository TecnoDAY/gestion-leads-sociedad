import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';

const originalPath = 'supabase/migrations/202609290001_campaign_stats.sql';
const migrationPath = process.env.CAMPAIGN_MIGRATION || 'supabase/migrations/202609300004_campaign_monthly_rollup_year.sql';
const original = readFileSync(new URL(`../../${originalPath}`, import.meta.url), 'utf8');
const migration = readFileSync(new URL(`../../${migrationPath}`, import.meta.url), 'utf8');
const functionStart = 'create or replace function public.campaign_monthly_rollup';
const resultStart = 'select coalesce(jsonb_agg';
const body = sql => sql.slice(sql.indexOf(functionStart), sql.indexOf('$$;', sql.indexOf(functionStart)) + 3);
const ctes = sql => body(sql).slice(body(sql).indexOf('with '), body(sql).indexOf(resultStart));

// Execute the migration's actual counting CTEs, not a separately written model.
// Only PostgreSQL syntax/builtins are adapted. This is NOT PostgreSQL verification:
// function creation, grants, RLS, planner behavior and timestamptz remain untested.
function sqliteCtes(sql) {
  return ctes(sql)
    .replaceAll('public.', '')
    .replace(/l\.date_parts\[(\d)\]::int/g, (_, n) => `cast(json_extract(l.date_parts, '$[${Number(n) - 1}]') as integer)`)
    .replace(/l\.date_parts\[(\d)\]/g, (_, n) => `json_extract(l.date_parts, '$[${Number(n) - 1}]')`)
    .replaceAll("~ '^[0-9]{4}-'", "regexp '^[0-9]{4}-'")
    .replaceAll("extract(day from (make_date(capture_year, capture_month, 1) + interval '1 month - 1 day'))", 'month_days(capture_year, capture_month)')
    .replaceAll('extract(year from l.capture_date)', 'date_year(l.capture_date)')
    .replaceAll("from_date + interval '1 month'", 'next_month(:from_date)')
    .replace(/\bfrom_date\b(?!\))/g, ':from_date')
    .replace(/\bp_anio\b/g, ':p_anio')
    .replace(/\bmonth_name\b/g, ':month_name')
    .replace(/\bilike\b/gi, 'like');
}

function database(t, sql = migration) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.function('btrim', value => value === null ? null : value.trim());
  db.function('regexp', (pattern, value) => value === null ? null : Number(new RegExp(pattern).test(value)));
  db.function('regexp_match', (value, pattern) => {
    const match = value === null ? null : new RegExp(pattern).exec(value);
    return match ? JSON.stringify(match.slice(1)) : null;
  });
  db.function('month_days', (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate());
  db.function('make_date', (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    assert.equal(date.getUTCFullYear(), year);
    assert.equal(date.getUTCMonth() + 1, month);
    assert.equal(date.getUTCDate(), day);
    return date.toISOString().slice(0, 10);
  });
  db.function('date_year', value => value === null ? null : Number(value.slice(0, 4)));
  db.function('next_month', value => {
    const [year, month] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  });
  db.exec(`
    create table leads (id integer primary key, archived_at text, "Mes" text, "Fecha" text,
      "Campaña" text, "GESTION" text, created_at text);
    create table lead_appointments (lead_id integer, scheduled_at text, status text);
    create table campaign_stats (campaign_name text, anio integer, mes text);
  `);
  const insert = db.prepare('insert into leads values (?, ?, ?, ?, ?, ?, ?)');
  const add = (id, fecha, { month = 'ENERO', campaign = 'A', gestion = '', archived = null } = {}) =>
    insert.run(id, archived, month, fecha, campaign, gestion, '2026-09-30T12:00:00Z');
  const appointment = (id, scheduled, status) => db.prepare('insert into lead_appointments values (?, ?, ?)').run(id, scheduled, status);
  const prefix = sqliteCtes(sql);
  const rows = (year = 2026, month = 'ENERO', monthNumber = 1) => {
    const query = db.prepare(`${prefix}
      select bc.campaign_name,
        coalesce(lc.leads_nuevos, 0) as leads_nuevos, coalesce(lc.inscritos, 0) as inscritos,
        coalesce(ac.agendados, 0) as agendados, coalesce(ac.asistieron, 0) as asistieron,
        coalesce(ac.pendientes, 0) as pendientes, coalesce(ac.agendados_previos, 0) as agendados_previos
      from base_campaigns bc
      left join lead_counts lc on lc.campaign_name = bc.campaign_name
      left join appt_counts ac on ac.campaign_name = bc.campaign_name
      order by lower(bc.campaign_name)`);
    return query.all({ ':p_anio': year, ':month_name': month, ':from_date': `${year}-${String(monthNumber).padStart(2, '0')}-01` })
      .map(row => ({ ...row }));
  };
  return { db, add, appointment, rows, prefix };
}

test('preserves RPC validation, security and JSON contract from the canonical migration', () => {
  const prior = body(original), next = body(migration);
  assert.equal(next.slice(0, next.indexOf('with ')), prior.slice(0, prior.indexOf('with ')));
  assert.equal(next.slice(next.indexOf(resultStart)), prior.slice(prior.indexOf(resultStart)));
  assert.ok(migration.trimStart().includes('begin;'));
  assert.ok(migration.trimEnd().endsWith('commit;'));
  assert.ok(migration.includes('revoke all on function public.campaign_monthly_rollup(int, text) from public;'));
  assert.ok(migration.includes('grant execute on function public.campaign_monthly_rollup(int, text) to authenticated;'));
  assert.ok(!next.includes('created_at'));
  assert.deepEqual([...migration.matchAll(/create or replace function ([^(]+)/g)].map(m => m[1]), ['public.campaign_monthly_rollup']);
  assert.ok(!/[\t ]+$/m.test(migration), 'no trailing whitespace in the new migration');
});

test('separates the same declared month across years, not the import created_at', t => {
  const { add, rows } = database(t);
  add(1, '15/01/2025', { gestion: 'INSCRITO' });
  add(2, '2026-01-20', { gestion: 'INSCRITA' });
  add(3, '21-1-26');
  add(4, '1/1/2025', { campaign: 'Solo 2025' });
  assert.deepEqual(rows(), [{ campaign_name: 'A', leads_nuevos: 2, inscritos: 1, agendados: 0, asistieron: 0, pendientes: 0, agendados_previos: 0 }]);
  assert.equal(rows(2025).find(r => r.campaign_name === 'A').leads_nuevos, 1);
  assert.ok(rows(2025).some(r => r.campaign_name === 'Solo 2025'));
});

test('textual capture dates match the existing parseFechaLead rules including calendar validation', t => {
  const { add, db, prefix } = database(t);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function parseFechaLead(lead) {');
  const end = html.indexOf('\n    }', start) + '\n    }'.length;
  const parseFechaLead = vm.runInNewContext(`(${html.slice(start, end)})`, { getField: (lead, key) => lead[key] || '' });
  const dates = ['1/1/2026', ' 09-1-26 ', '2025-12-31', '29/2/2024', '29/02/2025',
    '31/4/2026', '0/1/2026', '1/13/2026', '1/1/1999', '1/1/2101', '1/1/00', '31/12/99',
    null, '', 'ENERO 2026', '1/1', '2026-01-01T12:00:00Z', '21/07/2025 0:00:00',
    '31/12/2100', '1/1/2000', '28/2/2026', '29/2/2100', '1/0/2026', '32/1/2026',
    '9999-99-99', '99999999/1/2026', '2026-01-00'];
  for (const [i, fecha] of dates.entries()) add(i + 1, fecha);
  const parsed = db.prepare(`${prefix} select id, capture_date from dated_leads order by id`).all();
  assert.equal(parsed.length, dates.length);
  for (const [i, raw] of dates.entries()) {
    const timestamp = parseFechaLead({ Fecha: raw });
    const expected = timestamp === null ? null : new Date(timestamp).toISOString().slice(0, 10);
    assert.equal(parsed[i].capture_date, expected, `Fecha ${JSON.stringify(raw)}`);
  }
});

test('retains Mes attribution even when Fecha month differs; does not invent missing years', t => {
  const { add, rows } = database(t);
  add(1, '15/02/2026', { month: ' enero ' });
  add(2, '15/01/2026', { month: 'FEBRERO' });
  add(3, null);
  add(4, '31/02/2026');
  add(5, '01/01/2026', { month: null });
  assert.equal(rows()[0].leads_nuevos, 1);
  assert.equal(rows(2026, 'FEBRERO', 2)[0].leads_nuevos, 1);
});

test('keeps every appointment status in agendados and year-aware previous cohorts', t => {
  const { add, appointment, rows } = database(t);
  add(1, '1/1/2026');
  add(2, '1/1/2025');
  add(3, '1/12/2025', { month: 'DICIEMBRE' });
  add(4, null);
  add(5, '31/2/2026');
  for (const [i, status] of ['PROGRAMADA', 'ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA'].entries()) {
    appointment(i + 1, '2026-01-15T12:00:00Z', status);
  }
  appointment(1, '2025-12-31T12:00:00Z', 'PROGRAMADA');
  appointment(1, '2026-02-01T00:00:00Z', 'ASISTIO');
  assert.deepEqual(rows(), [{ campaign_name: 'A', leads_nuevos: 1, inscritos: 0, agendados: 5, asistieron: 1, pendientes: 1, agendados_previos: 2 }]);
});

test('preserves archive handling, empty campaigns, stats-only campaigns and empty result', t => {
  const { db, add, appointment, rows } = database(t);
  assert.deepEqual(rows(), []);
  add(1, '1/1/2026', { campaign: ' Archivada ', archived: '2026-01-20' });
  add(2, '1/1/2026', { campaign: '  ' });
  appointment(1, '2026-01-15T12:00:00Z', 'CANCELADA');
  appointment(2, '2026-01-15T12:00:00Z', 'PROGRAMADA');
  db.exec("insert into campaign_stats values ('Solo stats', 2026, 'ENERO'), ('Stats 2025', 2025, 'ENERO')");
  assert.deepEqual(rows(), [
    { campaign_name: 'Archivada', leads_nuevos: 0, inscritos: 0, agendados: 1, asistieron: 0, pendientes: 0, agendados_previos: 0 },
    { campaign_name: 'Solo stats', leads_nuevos: 0, inscritos: 0, agendados: 0, asistieron: 0, pendientes: 0, agendados_previos: 0 },
  ]);
});

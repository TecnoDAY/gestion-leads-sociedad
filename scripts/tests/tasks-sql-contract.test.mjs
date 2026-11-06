import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../supabase/migrations/202610270001_crm_tasks_module.sql', import.meta.url), 'utf8');
const permissionsSql = readFileSync(new URL('../../supabase/migrations/20261028010200_tareas_permisos_admin.sql', import.meta.url), 'utf8');
const availabilitySql = readFileSync(new URL('../../supabase/migrations/20261028010300_tareas_disponibilidad.sql', import.meta.url), 'utf8');

test('tasks migration defines table and rpcs', () => {
  assert.match(sql, /create table if not exists public\.crm_tasks/);
  for (const fn of ['create_crm_task', 'claim_crm_task', 'complete_crm_task', 'cancel_crm_task', 'refresh_crm_task_assignments', 'list_crm_task_advisors']) {
    assert.ok(sql.includes('create or replace function public.' + fn), fn);
  }
});

test('tasks rpcs are revoked from public and anon', () => {
  assert.ok(sql.includes('revoke all on function public.claim_crm_task(uuid) from public, anon, authenticated'));
  assert.ok(sql.includes('grant execute on function public.claim_crm_task(uuid) to authenticated'));
});

test('tasks table has rls enabled', () => {
  assert.match(sql, /alter table public\.crm_tasks enable row level security/);
});

test('permisos de lectura: admin todas, equipo solo propias o bandeja general', () => {
  assert.match(permissionsSql, /drop policy if exists crm_tasks_select/);
  assert.match(permissionsSql, /ua\.activo = true[\s\S]*?ua\.role = 'admin'[\s\S]*?assignee_id = \(select auth\.uid\(\)\)[\s\S]*?status = 'sin_asignar' and assignee_id is null/);
});

test('retirada solo admin: mantiene fila e historial, incluso si se completo', () => {
  assert.match(permissionsSql, /access\.role <> 'admin'[\s\S]*?errcode = '42501'/);
  assert.match(permissionsSql, /update public\.crm_tasks[\s\S]*?status = 'cancelada'[\s\S]*?history = history \|\| jsonb_build_array[\s\S]*?status in \('asignada', 'sin_asignar', 'completada'\)/);
  assert.doesNotMatch(permissionsSql, /delete\s+from\s+public\.crm_tasks/i);
  assert.match(permissionsSql, /revoke all on function public\.cancel_crm_task\(uuid\) from public, anon, authenticated/);
});

test('presencia autenticada no confunde actividad con conexion', () => {
  assert.match(availabilitySql, /create table public\.crm_task_presence[\s\S]*?user_id uuid primary key[\s\S]*?last_seen_at timestamptz/);
  assert.match(availabilitySql, /alter table public\.crm_task_presence enable row level security/);
  assert.match(availabilitySql, /revoke all on public\.crm_task_presence from public, anon, authenticated/);
  assert.match(availabilitySql, /create function public\.crm_task_heartbeat\(\)[\s\S]*?ua\.user_id = auth\.uid\(\) and ua\.activo = true[\s\S]*?values \(auth\.uid\(\), now\(\)\)/);
  assert.doesNotMatch(availabilitySql, /update public\.agent_sessions|set last_activity_at = now\(\)/);
});

test('disponibilidad sin desasignar: T-20 sin presencia o siempre al vencer', () => {
  assert.match(availabilitySql, /p_claimed_at is null[\s\S]*?p_scheduled_at <= now\(\) or \([\s\S]*?p_scheduled_at <= now\(\) \+ interval '20 minutes'[\s\S]*?last_seen_at >= now\(\) - interval '3 minutes'/);
  assert.match(availabilitySql, /create policy crm_tasks_select[\s\S]*?ua\.role = 'admin'[\s\S]*?assignee_id = \(select auth\.uid\(\)\)[\s\S]*?status = 'sin_asignar'[\s\S]*?status = 'asignada' and public\.crm_task_is_shared/);
  assert.match(availabilitySql, /create view public\.crm_tasks_visible with \(security_invoker = true\)/);
  assert.match(availabilitySql, /create or replace function public\.refresh_crm_task_assignments\(\)[\s\S]*?return 0;/);
  assert.doesNotMatch(availabilitySql, /set assignee_id = null/);
});

test('toma atomica de tarea compartida con responsable original y sin re-tomas', () => {
  assert.match(availabilitySql, /update public\.crm_tasks t[\s\S]*?set assignee_id = auth\.uid\(\), status = 'asignada', claimed_at = now\(\)[\s\S]*?'from', t\.assignee_id[\s\S]*?t\.assignee_id <> auth\.uid\(\)[\s\S]*?public\.crm_task_is_shared\(t\.assignee_id, t\.scheduled_at, t\.claimed_at\)/);
  const locks = availabilitySql.match(/pg_advisory_xact_lock\(hashtextextended\('crm_task_presence:' \|\| (?:auth\.uid\(\)|previous_assignee)::text, 0\)\)/g) || [];
  assert.equal(locks.length, 2, 'heartbeat y toma serializan la misma responsable');
  assert.ok(availabilitySql.indexOf('select t.assignee_id into previous_assignee') < availabilitySql.indexOf('update public.crm_tasks t'));
  assert.match(availabilitySql, /revoke all on function public\.claim_crm_task\(uuid\) from public, anon, authenticated/);
});

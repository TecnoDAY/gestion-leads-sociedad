import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../../supabase/migrations/202610270001_crm_tasks_module.sql', import.meta.url), 'utf8');

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

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// Static contract checks only: these do not execute PostgreSQL or prove rollback.
const migrations = new URL('../../supabase/migrations/', import.meta.url);
const sql = readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(new URL(name, migrations), 'utf8')).join('\n');
const definitions = [...sql.matchAll(/create or replace function public\.(update_lead_\w+)\(([^)]*)\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi)];
function body(name, parameterCount) {
  const definition = definitions.filter((match) => match[1] === name && match[2].split(',').length === parameterCount).at(-1);
  assert.ok(definition, `${name}/${parameterCount} exists`);
  return definition[3];
}

test('canonical seven-argument appointment saves followup without losing details, campus or guards', () => {
  const source = body('update_lead_with_appointment', 7);
  assert.match(source, /public\.update_lead_followup\(p_id,/);
  assert.match(source, /create_lead_appointment\(updated\.id, p_scheduled_at, p_notes, p_advisor_user_id, p_details, p_campus\)/);
  for (const guard of ['crm_access_forbidden', 'telefono_invalido', 'nombre_required', 'lead_contacts']) {
    assert.ok(source.includes(guard), guard);
  }
});

test('admin full edit preserves contact synchronization and bypasses commercial SET for followup-only', () => {
  const source = body('update_lead_full', 2);
  assert.match(source, /lead_contacts/);
  assert.match(source, /admin_required/);
  assert.match(source, /telefono_invalido/);
  assert.match(source, /return public\.update_lead_followup\(p_id, p_lead\)/);
});

test('followup rejects mismatched values, non-ISO dates and overlong action; dynamic SQL binds values', () => {
  const source = body('update_lead_followup', 2);
  assert.match(source, /\(next_action is null\) is distinct from \(followup_date_text is null\)/);
  assert.match(source, /length\(next_action\) > 200/);
  assert.match(source, /\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/);
  assert.match(source, /to_char\(followup_date, 'YYYY-MM-DD'\)/);
  assert.match(source, /using p_fields, p_id/);
  assert.doesNotMatch(source, /quote_literal\(p_fields/);
});

test('recreated five-argument legacy overload is closed to API roles', () => {
  const lastGrant = sql.lastIndexOf('grant execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) to authenticated');
  const lastRevoke = sql.lastIndexOf('revoke execute on function public.update_lead_with_appointment(bigint, jsonb, timestamptz, text, uuid) from public, anon, authenticated');
  assert.ok(lastRevoke > lastGrant, 'legacy execute grant must be revoked after the defective migration');
});

test('campus wrapper routes admin fields to full edit and keeps ownership and lead-before-appointment order', () => {
  const source = body('update_lead_followup_with_appointment_campus', 4);
  assert.match(source, /appointment_lead_id is null or appointment_lead_id <> p_id/);
  assert.match(source, /appointment_not_found_or_wrong_lead/);
  assert.match(source, /if public\.is_admin_user\(\) then\s+updated := public\.update_lead_full\(p_id, p_fields\);\s+else\s+updated := public\.update_lead_followup\(p_id, p_fields\);\s+end if;/);
  const campusUpdate = source.indexOf('perform public.update_lead_appointment_campus(p_appointment_id, p_campus)');
  assert.ok(campusUpdate > source.indexOf('public.update_lead_full(p_id, p_fields)'));
  assert.ok(campusUpdate > source.indexOf('public.update_lead_followup(p_id, p_fields)'));
  assert.ok(source.indexOf('appointment_not_found_or_wrong_lead') < source.indexOf('public.update_lead_full(p_id, p_fields)'));
});

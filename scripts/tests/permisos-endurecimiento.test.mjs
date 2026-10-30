// Fija los criterios de las migraciones de endurecimiento (004-007) y del
// limitador global del webhook. Son comprobaciones de contenido: si alguien
// revierte una sentencia (por ejemplo el ALTER DEFAULT PRIVILEGES o la
// guarda de sesion), el test falla.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const raiz = new URL('../../', import.meta.url);
const leer = ruta => readFileSync(new URL(ruta, raiz), 'utf8');

const ratificacion = leer('supabase/migrations/archive/202610200004_ratificacion_modelo_equipo_citas.sql');
const endurecimiento = leer('supabase/migrations/archive/202610200005_endurecimiento_privilegios.sql');
const sesiones = leer('supabase/migrations/archive/202610200006_sesiones_usuario_activo.sql');
const correcciones = leer('supabase/migrations/archive/202610200007_sesion_inactiva_y_limitador_webhook.sql');

test('004: ratifica el modelo de citas por equipo y solo documenta', () => {
  for (const fn of [
    'public.set_lead_appointment_status(bigint, text, text)',
    'public.reschedule_lead_appointment(bigint, timestamp with time zone, text)',
    'public.record_lead_appointment_event()',
  ]) assert.ok(ratificacion.includes(`comment on function ${fn}`), fn);
  assert.match(ratificacion, /comment on table public\.lead_appointment_events/);
  assert.match(ratificacion, /Modelo de equipo ratificado/);
  assert.match(ratificacion, /action_user_id\/action_name = actor/);
  // No debe cambiar el comportamiento de ninguna funcion.
  assert.doesNotMatch(ratificacion, /create\s+(or\s+replace\s+)?function/i);
  assert.doesNotMatch(ratificacion, /\b(drop|alter|insert|update|delete|truncate)\b/i);
});

test('005: el default de privilegios y los revokes que cierran la superficie anon', () => {
  assert.match(endurecimiento, /alter default privileges for role postgres in schema public revoke execute on functions from public, anon/);
  assert.match(endurecimiento, /alter default privileges for role service_role in schema public revoke execute on functions from public, anon/);
  assert.match(endurecimiento, /alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated/);
  assert.match(endurecimiento, /alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated/);
  for (const fn of ['title_case_text(text)', 'normalize_agent_name(text)', '_daily_report_data_dura(text, text, date)']) {
    assert.ok(endurecimiento.includes(`revoke execute on function public.${fn} from public, anon`), fn);
    assert.ok(endurecimiento.includes(`grant execute on function public.${fn} to authenticated, service_role`), fn);
  }
  assert.match(endurecimiento, /revoke select on table public\.leads, public\.leads_historico, public\.user_access from anon/);
  for (const fn of [
    'record_lead_gestion()',
    'record_lead_appointment_event()',
    'set_lead_gestion_meta()',
    'trg_sync_lead_agendado_dd_appointments()',
  ]) assert.ok(endurecimiento.includes(`revoke execute on function public.${fn} from authenticated`), fn);
  // La app conserva lo que usa.
  assert.match(endurecimiento, /grant execute on function public\.daily_management_report\(date, uuid\) to authenticated, service_role/);
});

test('006: las sesiones exigen usuario activo y conservan los permisos de la app', () => {
  const funciones = sesiones.split('create or replace function').slice(1);
  assert.equal(funciones.length, 2, 'touch_agent_session y end_agent_session');
  for (const bloque of funciones) {
    assert.match(bloque, /security definer/);
    assert.match(bloque, /set search_path = public/);
    assert.match(bloque, /is_active_user\(\)/);
    assert.match(bloque, /user_id = auth\.uid\(\)/);
  }
  assert.match(sesiones, /grant execute on function public\.touch_agent_session\(bigint\) to authenticated, service_role/);
  assert.match(sesiones, /grant execute on function public\.end_agent_session\(bigint, text\) to authenticated, service_role/);
  assert.match(sesiones, /revoke execute on function public\.end_agent_session\(bigint, text\) from public, anon/);
});

test('007: el cierre por desactivacion se permite y el limitador es global y fail-closed', () => {
  // session_invalid es el flujo de desactivacion: debe cerrar aunque la cuenta
  // ya este inactiva.
  assert.match(correcciones, /p_reason <> 'session_invalid' and not public\.is_active_user\(\)/);
  assert.match(correcciones, /create table if not exists public\.webhook_rate_limit/);
  assert.match(correcciones, /alter table public\.webhook_rate_limit enable row level security/);
  assert.match(correcciones, /revoke all on table public\.webhook_rate_limit from public, anon, authenticated/);
  assert.match(correcciones, /create or replace function public\.webhook_rate_limit_hit/);
  assert.match(correcciones, /grant execute on function public\.webhook_rate_limit_hit\(text, integer, integer\) to service_role/);
  assert.match(correcciones, /revoke execute on function public\.webhook_rate_limit_hit\(text, integer, integer\) from public, anon, authenticated/);
  assert.match(correcciones, /set search_path = public/);
});

test('el webhook limita con la base de datos y con la IP de confianza', () => {
  const webhook = leer('supabase/functions/meta-whatsapp-webhook/index.ts');
  // Contador global (no el Map en memoria, que se repartia entre instancias).
  assert.match(webhook, /service\.rpc\('webhook_rate_limit_hit'/);
  assert.doesNotMatch(webhook, /new Map<string, \{ count/);
  // La clave es la IP de Cloudflare; x-forwarded-for solo como ultimo recurso
  // y tomando la ultima entrada (la primera la manipulable).
  assert.match(webhook, /cf-connecting-ip/);
  assert.match(webhook, /x-real-ip/);
  const ipDe = webhook.slice(webhook.indexOf('const ipDe'), webhook.indexOf('function getServiceRoleKey'));
  assert.match(ipDe, /forwarded\[i\]/);
  assert.doesNotMatch(ipDe, /split\(','\)\[0\]/);
  // Si el limitador falla, la verificacion de Meta no se cae.
  assert.match(webhook, /Si el limitador falla/);
});

test('las tres edge functions tienen CORS fail-closed con opt-in explicito', () => {
  for (const name of ['authorize-user', 'change-user-email', 'meta-whatsapp-webhook']) {
    const src = leer(`supabase/functions/${name}/index.ts`);
    assert.match(src, /const ORIGENES_POR_DEFECTO/);
    assert.match(src, /http:\/\/localhost:4173/, `${name}: falta el origen del preview`);
    assert.match(src, /if \(configurado === '\*'\) return '\*'/);
    assert.doesNotMatch(src, /Deno\.env\.get\('ALLOWED_ORIGIN'\) \|\| '\*'/);
  }
});

// Preferencia por asesora del cierre automatico por inactividad.
// Patron SQL (migracion) + comportamiento real de las guardas de sesion en VM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { test } from 'node:test';
import path from 'node:path';
import { escapeHtml, escapeAttr } from '../../src/legacy/helpers.js';

const baseline = process.argv.includes('--baseline');
const read = p => baseline ? execFileSync('git', ['show', `HEAD:${p}`], { encoding: 'utf8' }) : readFileSync(p, 'utf8');
const migration = read('supabase/migrations/202610120001_user_access_idle_timeout.sql');
const html = read('index.html');
// La ayuda vive en src/legacy/help.js (extraida del monolito en la fase 1).
const helpSource = read('src/legacy/help.js');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('async function loadCurrentAccess'));

function extractFunction(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(script);
  assert.ok(match, `Función real ausente: ${name}`);
  for (let end = script.indexOf('}', match.index); end !== -1; end = script.indexOf('}', end + 1)) {
    const candidate = script.slice(match.index, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`No se pudo extraer ${name}`);
}

// ---------------------------------------------------------------------------
// Migracion
// ---------------------------------------------------------------------------

test('migracion: columna con default true y sin escrituras directas de user_access', () => {
  assert.match(migration, /add column if not exists idle_timeout_enabled boolean not null default true/);
  // La tabla se escribe solo via RPC: la migracion no crea policies de update
  // ni concede UPDATE directo.
  assert.doesNotMatch(migration, /grant update on public\.user_access/i);
  assert.doesNotMatch(migration, /for update to authenticated/i);
  assert.match(migration, /comment on column public\.user_access\.idle_timeout_enabled/);
});

test('migracion: la firma del RPC admin no cambia y set_idle_timeout es admin-only', () => {
  assert.match(migration, /create or replace function public\.admin_manage_user_access\(\s*p_action text,\s*p_user_id uuid default null,\s*p_activo boolean default null\s*\)/);
  assert.match(migration, /if not public\.is_admin_user\(\) then[\s\S]*raise exception using errcode = '42501', message = 'admin_required'/);
  assert.match(migration, /elsif p_action = 'set_idle_timeout' and p_user_id is not null then\s+update public\.user_access set idle_timeout_enabled = coalesce\(p_activo, true\), updated_at = now\(\)/);
  assert.match(migration, /grant execute on function public\.admin_manage_user_access\(text, uuid, boolean\) to authenticated;/);
  assert.doesNotMatch(migration, /grant execute on function public\.admin_manage_user_access\(text, uuid, boolean\) to anon/);
  assert.match(migration, /revoke all on function public\.admin_manage_user_access\(text, uuid, boolean\) from anon;/);
});

test('migracion: el listado expone la preferencia y set_active se conserva intacto', () => {
  assert.match(migration, /'idle_timeout_enabled', idle_timeout_enabled/);
  assert.match(migration, /elsif p_action = 'set_active' and p_user_id is not null then\s+update public\.user_access set activo = coalesce\(p_activo, false\), updated_at = now\(\)/);
  assert.match(migration, /raise exception using errcode = '22023', message = 'unsupported_user_action'/);
});

// ---------------------------------------------------------------------------
// Guardas de sesion (comportamiento real en VM)
// ---------------------------------------------------------------------------

const IDLE_KEY = 'idleLastActivityAt';

function sesionSandbox({ acceso, conSesion = true, respuestaServidor = null, falloServidor = false, errorServidor = false } = {}) {
  const spies = { stopIdleTracking: 0, hideIdleBanner: 0, restartIdleTimers: 0, touch: 0, closes: [], rpc: [] };
  const store = new Map();
  const ctx = vm.createContext({
    console: { warn() {}, log() {}, error() {} },
    IDLE_KEY,
    sessionGeneration: 1,
    currentUser: conSesion ? { id: 'u1' } : null,
    currentAccess: acceso,
    agentSessionId: conSesion ? 77 : null,
    supabaseClient: {
      from() {
        return { select() { return this; }, eq() { return this; },
          maybeSingle: () => Promise.resolve(
            falloServidor ? Promise.reject(new Error('red caida'))
              : { data: respuestaServidor, error: errorServidor ? { message: 'x' } : null }) };
      },
      rpc(name) { spies.rpc.push(name); return Promise.resolve({ data: null, error: null }); },
    },
    localStorage: {
      getItem: k => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    },
    isIdleMonitored: null, // se sustituye por la real extraida
    stopIdleTracking: () => { spies.stopIdleTracking++; },
    hideIdleBanner: () => { spies.hideIdleBanner++; },
    restartIdleTimers: () => { spies.restartIdleTimers++; },
    touchAgentSessionThrottled: () => { spies.touch++; },
    closeInvalidSession: async razon => { spies.closes.push(razon); },
  });
  new vm.Script(extractFunction('isIdleMonitored')).runInContext(ctx);
  new vm.Script(extractFunction('endAgentSessionForIdle')).runInContext(ctx);
  new vm.Script(extractFunction('markUserActivity')).runInContext(ctx);
  return { ctx, spies, store };
}

const agente = pref => ({ role: 'agente', idle_timeout_enabled: pref, updated_at: 't1' });

test('isIdleMonitored: solo agente con sesion y preferencia activa (ausente = true)', () => {
  const { ctx } = sesionSandbox({ acceso: agente(true) });
  assert.equal(ctx.isIdleMonitored(), true);
  const off = sesionSandbox({ acceso: agente(false) });
  assert.equal(off.ctx.isIdleMonitored(), false);
  const sinDato = sesionSandbox({ acceso: { role: 'agente', updated_at: 't1' } });
  assert.equal(sinDato.ctx.isIdleMonitored(), true, 'respuesta antigua sin la columna se trata como activa');
  const admin = sesionSandbox({ acceso: { role: 'admin', idle_timeout_enabled: true, updated_at: 't1' } });
  assert.equal(admin.ctx.isIdleMonitored(), false);
});

test('cierre por inactividad: con preferencia apagada a distancia se cancela sin cerrar sesion', async () => {
  const { ctx, spies } = sesionSandbox({ acceso: agente(true), respuestaServidor: { activo: true, idle_timeout_enabled: false } });
  await ctx.endAgentSessionForIdle();
  assert.equal(spies.closes.length, 0, 'no debe cerrar la sesion');
  assert.equal(spies.stopIdleTracking, 1, 'retira el monitoreo de la sesion actual');
  assert.equal(spies.hideIdleBanner, 1);
  assert.equal(spies.rpc.filter(n => n === 'end_agent_session').length, 0);
});

test('cierre por inactividad: error de red NO cierra, rearma una ventana nueva y reintenta', async () => {
  const { ctx, spies, store } = sesionSandbox({ acceso: agente(true), falloServidor: true });
  store.set(IDLE_KEY, '1');
  await ctx.endAgentSessionForIdle();
  assert.equal(spies.closes.length, 0, 'sin confirmacion no se cierra por inactividad');
  assert.ok(Number(store.get(IDLE_KEY)) > 1, 'la ventana de inactividad se reinicia para reintentar');
  assert.equal(spies.restartIdleTimers, 1);
  assert.equal(spies.rpc.filter(n => n === 'end_agent_session').length, 0);
});

test('cierre por inactividad: cuenta desactivada en el servidor cierra la sesion igual', async () => {
  // El monitoreo local esta activo (preferencia true), pero el servidor
  // reporta la cuenta inactiva: el cierre de sesion procede igual.
  const { ctx, spies } = sesionSandbox({ acceso: agente(true), respuestaServidor: { activo: false, idle_timeout_enabled: false } });
  await ctx.endAgentSessionForIdle();
  assert.equal(spies.closes.length, 1);
  assert.match(spies.closes[0], /desactivado/i);
});

test('cierre por inactividad: preferencia activa cierra como siempre', async () => {
  const { ctx, spies } = sesionSandbox({ acceso: agente(true), respuestaServidor: { activo: true, idle_timeout_enabled: true } });
  await ctx.endAgentSessionForIdle();
  assert.equal(spies.closes.length, 1);
  assert.match(spies.closes[0], /5 minutos/);
  assert.equal(spies.rpc.filter(n => n === 'end_agent_session').length, 1);
});

test('telemetria: la actividad sigue registrandose aunque el cierre automatico este apagado', () => {
  const { ctx, spies, store } = sesionSandbox({ acceso: agente(false) });
  ctx.markUserActivity();
  assert.ok(Number(store.get(IDLE_KEY)) > 0, 'guarda la marca de actividad');
  assert.equal(spies.touch, 1, 'el touch del reporte de actividad sigue');
  assert.equal(spies.restartIdleTimers, 1, 'restartIdleTimers es no-op interno con preferencia apagada');
});

// ---------------------------------------------------------------------------
// UI de Gestion de accesos
// ---------------------------------------------------------------------------

function renderUsuarios(lista) {
  const containers = new Map();
  const element = id => {
    if (!containers.has(id)) containers.set(id, { value: '', innerHTML: '' });
    return containers.get(id);
  };
  const ctx = vm.createContext({
    isAdmin: true,
    authorizedUsersList: lista,
    escapeHtml, escapeAttr,
    document: { getElementById: element, querySelectorAll: () => [] },
  });
  new vm.Script(extractFunction('renderAuthorizedUsers')).runInContext(ctx);
  ctx.renderAuthorizedUsers();
  return element('authorizedUsers').innerHTML;
}

test('UI: asesoras muestran Cierre automatico en subfila propia y la cuenta queda separada', () => {
  const html = renderUsuarios([
    { user_id: 'u1', nombre: 'Jessica', email: 'j@x.com', role: 'agente', activo: true, idle_timeout_enabled: true },
    { user_id: 'u2', nombre: 'Admin', email: 'a@x.com', role: 'admin', activo: true, idle_timeout_enabled: true },
  ]);
  assert.match(html, /Cierre automático/);
  assert.match(html, /setIdleTimeout\('u1', false\)/);
  assert.match(html, /Desactivar cierre/);
  assert.match(html, /users-row-idle/);
  assert.doesNotMatch(html, /setIdleTimeout\('u2'/, 'admin no lleva el control');
  // El toggle de cuenta mantiene su etiqueta propia, distinta del cierre:
  assert.match(html, /Desactivar cuenta/);
  assert.match(html, /setUserActive\('u1', false\)/);
});

test('UI: preferencia apagada muestra Desactivado con accion de reactivar', () => {
  const html = renderUsuarios([
    { user_id: 'u3', nombre: 'Loli', email: 'l@x.com', role: 'agente', activo: true, idle_timeout_enabled: false },
  ]);
  assert.match(html, /Desactivado/);
  assert.match(html, /setIdleTimeout\('u3', true\)/);
  assert.match(html, /Activar cierre/);
});

test('RPC del toggle usa la accion set_idle_timeout y el listado alimenta el render', () => {
  assert.match(script, /p_action: 'set_idle_timeout', p_user_id: userId, p_activo: enabled/);
  assert.match(script, /async function setIdleTimeout\(userId, enabled\)/);
  assert.match(script, /select\('user_id, email, nombre, role, activo, updated_at, idle_timeout_enabled'\)/);
  // Degradacion: si la columna no existe, reintenta sin ella y asume true.
  assert.match(script, /user_access sin idle_timeout_enabled/);
});

test('centro de ayuda documenta el control por asesora', () => {
  assert.match(helpSource, /cada asesora tiene su propio control "Cierre automático"/);
  assert.match(helpSource, /"Desactivar cuenta" sigue bloqueando el acceso en ambos casos/);
});

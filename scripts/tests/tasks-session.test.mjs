import assert from 'node:assert/strict';
import test from 'node:test';

test('una sesión recién iniciada carga las tareas sin visitar la pestaña Tareas', async () => {
  const calls = [];
  let deferRead = false;
  let resolveRead;
  const node = () => ({ classList: { add() {}, remove() {}, toggle() {} }, dataset: {} });
  const view = { ...node(), querySelectorAll: () => [] };
  const nodes = new Map([
    ['viewTareas', view], ['tasksList', { ...node(), querySelectorAll: () => [] }],
    ['tasksBellCount', node()], ['tasksAttentionBlock', node()],
  ]);
  globalThis.localStorage = { getItem: () => null };
  globalThis.document = {
    readyState: 'loading', addEventListener() {},
    getElementById: id => nodes.get(id) ?? null,
  };
  globalThis.window = {
    currentUser: { id: 'asesora-1' }, currentAccess: { activo: true, role: 'agente' },
    supabaseClient: {
      rpc: async name => { calls.push(name); return { data: name === 'list_crm_task_advisors' ? [] : 0 }; },
      from: () => ({ select: () => ({ order: () => {
        calls.push('crm_tasks');
        return deferRead ? new Promise(resolve => { resolveRead = resolve; }) : Promise.resolve({ data: [] });
      } }) }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
    },
  };
  const api = await import('../../src/tasks/index.js');
  try {
    window.tasksModuleApi.onSessionReady();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(calls.includes('crm_tasks'), 'debe cargar los recordatorios desde Inicio');
    deferRead = true;
    const pending = window.tasksModuleApi.refreshTasks();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof resolveRead, 'function');
    window.tasksModuleApi.onSessionCleared();
    const afterLogout = nodes.get('tasksList').innerHTML;
    resolveRead({ data: [{ id: 'otra-sesion', descripcion: 'dato de sesión anterior', assignee_id: 'asesora-1', status: 'asignada', scheduled_at: '2026-10-28T00:00:00Z' }] });
    await pending;
    assert.equal(nodes.get('tasksList').innerHTML, afterLogout, 'no debe repintar datos tras cerrar sesión');
  } finally {
    window.tasksModuleApi.onSessionCleared();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

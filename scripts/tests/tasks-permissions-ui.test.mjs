import assert from 'node:assert/strict';
import test from 'node:test';

test('admin ve Todas y Retirar; asesora ve solo propias y bandeja, con campanita de pendientes', async () => {
  let deferRead = false;
  let resolveRead;
  const node = () => ({ dataset: {}, classList: { add() {}, remove() {}, toggle(name, hide) { this.hidden = hide; } }, addEventListener() {} });
  const allButton = { ...node(), dataset: { scope: 'all' }, addEventListener: (_, handler) => { allButton.click = handler; } };
  const mineButton = { ...node(), dataset: { scope: 'mine' } };
  const scopes = [mineButton, allButton, ...['unassigned', 'completed'].map(scope => {
    const button = { ...node(), dataset: { scope } };
    button.addEventListener = (_, handler) => { button.click = handler; };
    return button;
  })];
  const list = { ...node(), querySelectorAll: () => [] };
  const view = { ...node(), querySelector: () => allButton, querySelectorAll: () => scopes };
  const bell = { ...node(), textContent: '' };
  const attention = { ...node(), innerHTML: '' };
  const nodes = new Map([['viewTareas', view], ['tasksList', list], ['tasksBellCount', bell], ['tasksAttentionBlock', attention]]);
  const tasks = [
    { id: 'propia', descripcion: 'Propia futura', assignee_id: 'asesora', status: 'asignada', scheduled_at: '2099-01-01' },
    { id: 'otra', descripcion: 'Otra futura', assignee_id: 'otra', status: 'asignada', scheduled_at: '2099-01-01' },
    { id: 'equipo', descripcion: 'Disponible equipo', assignee_id: 'otra', status: 'asignada', is_shared: true, scheduled_at: '2099-01-01' },
    { id: 'general', descripcion: 'General', assignee_id: null, status: 'sin_asignar', scheduled_at: '2099-01-01' },
    { id: 'terminada', descripcion: 'Terminada', assignee_id: 'asesora', status: 'completada', scheduled_at: '2099-01-01' },
    { id: 'retirada', descripcion: 'Retirada', assignee_id: 'asesora', status: 'cancelada', scheduled_at: '2099-01-01' },
  ];
  globalThis.localStorage = { getItem: () => null };
  globalThis.document = { readyState: 'loading', addEventListener() {}, getElementById: id => nodes.get(id) ?? null };
  globalThis.window = {
    currentUser: { id: 'admin' }, currentAccess: { activo: true, role: 'admin' },
    supabaseClient: {
      rpc: async name => ({ data: name === 'list_crm_task_advisors' ? [] : 0 }),
      from: () => ({ select: () => ({ order: () => deferRead
        ? new Promise(resolve => { resolveRead = resolve; })
        : Promise.resolve({ data: tasks }) }) }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    },
  };
  await import('../../src/tasks/index.js');
  try {
    window.tasksModuleApi.onSessionReady();
    await window.tasksModuleApi.refreshTasks();
    assert.doesNotMatch(allButton.className, /hidden/);
    allButton.click();
    assert.match(list.innerHTML, /Propia futura/);
    assert.match(list.innerHTML, /Otra futura/);
    assert.match(list.innerHTML, /Retirar/);
    assert.equal(bell.textContent, '2', 'admin cuenta la bandeja general y las compartidas');
    deferRead = true;
    const oldRequest = window.tasksModuleApi.refreshTasks();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof resolveRead, 'function');
    const resolveOldRead = resolveRead;
    deferRead = false;
    window.currentAccess = { activo: true, role: 'agente' };
    window.tasksModuleApi.onSessionReady();
    assert.match(allButton.className, /hidden/);
    assert.doesNotMatch(list.innerHTML, /Otra futura|Retirar/, 'degradar rol limpia la vista antes de la recarga');
    resolveOldRead({ data: tasks });
    await oldRequest;
    await window.tasksModuleApi.refreshTasks();
    assert.doesNotMatch(list.innerHTML, /Otra futura|Retirar/, 'la lectura antigua no restaura tareas ajenas');
    window.tasksModuleApi.onSessionCleared();
    window.currentUser = { id: 'asesora' };
    window.currentAccess = { activo: true, role: 'agente' };
    window.tasksModuleApi.onSessionReady();
    await window.tasksModuleApi.refreshTasks();
    assert.match(allButton.className, /hidden/);
    assert.match(list.innerHTML, /Propia futura/);
    assert.doesNotMatch(list.innerHTML, /Otra futura|Retirar/);
    assert.equal(bell.textContent, '3', 'cuenta propia futura, sin asignar y compartida, no completada ni retirada');
    assert.match(attention.innerHTML, /1 tuyas pendientes · 2 disponibles/);
    scopes.find(b => b.dataset.scope === 'unassigned').click();
    assert.match(list.innerHTML, /Disponible equipo/);
    assert.match(list.innerHTML, /data-task-claim="equipo"/);
    allButton.click();
    assert.doesNotMatch(list.innerHTML, /Otra futura|Retirar/, 'un click manual en Todas no amplía permisos');
    scopes.find(b => b.dataset.scope === 'completed').click();
    assert.match(list.innerHTML, /Terminada|Retirada/);
    assert.doesNotMatch(list.innerHTML, /Otra futura|data-task-cancel/);
    window.tasksModuleApi.onSessionCleared();
    window.currentUser = { id: 'asesora' };
    window.currentAccess = { activo: true, role: 'supervisor' };
    window.tasksModuleApi.onSessionReady();
    await window.tasksModuleApi.refreshTasks();
    assert.match(allButton.className, /hidden/);
    assert.doesNotMatch(list.innerHTML, /Retirar|Otra futura/);
    assert.equal(bell.textContent, '3');
    window.currentAccess = { activo: true, role: 'trafficker' };
    window.tasksModuleApi.onSessionReady();
    assert.doesNotMatch(list.innerHTML, /Propia futura|General|Retirar/);
    assert.equal(bell.classList.hidden, true);
  } finally {
    window.tasksModuleApi.onSessionCleared();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

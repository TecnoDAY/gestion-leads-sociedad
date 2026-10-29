import { TASK_ACTIVE_THRESHOLD_MS, isAdvisorActive, taskState, sortTasks, formatDateTime, filterTasks } from './tasks-service.js';

const TASKS = {
  cache: [],
  scope: 'mine',
  advisors: [],
  advisorsError: false,
  lastLeadResults: [],
  realtime: null,
  refreshTimer: null,
  notified: new Set(JSON.parse(localStorage.getItem('tasksNotified') || '[]')),
};

function getClient() { return window.supabaseClient; }
function getUser() { return window.currentUser; }
function getAccess() { return window.currentAccess; }

function canUse() {
  const a = getAccess();
  return !!getClient() && !!getUser() && !!a?.activo && a.role !== 'trafficker';
}

async function rpc(name, args) {
  const { data, error } = await getClient().rpc(name, args || {});
  if (error) throw error;
  return data;
}

async function loadAdvisors() {
  if (!canUse()) return;
  TASKS.advisorsError = false;
  try {
    const data = await rpc('list_crm_task_advisors');
    TASKS.advisors = Array.isArray(data) ? data : [];
  } catch (e) {
    TASKS.advisors = [];
    TASKS.advisorsError = true;
    console.warn('No se pudieron cargar asesoras:', e?.message || e);
  }
  renderAssigneeSelect();
  const retry = document.getElementById('taskRetryAdvisors');
  if (retry) {
    retry.classList.toggle('hidden', !TASKS.advisorsError);
    retry.onclick = () => loadAdvisors();
  }
}

function renderAssigneeSelect() {
  const sel = document.getElementById('taskAssignee');
  if (!sel) return;
  if (TASKS.advisorsError) {
    sel.innerHTML = '<option value="">No se pudieron cargar las asesoras · Reintentar</option>';
    sel.disabled = true;
    return;
  }
  const me = getUser()?.id;
  const ordered = [...TASKS.advisors].sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
  sel.disabled = false;
  sel.innerHTML = '<option value="">Sin asignar (bandeja general)</option>' +
    ordered.map(a => `<option value="${a.user_id}" ${a.user_id === me ? 'selected' : ''}>${escapeHtml(a.nombre || a.email || a.user_id)}${isAdvisorActive(a.last_activity_at) ? ' · en línea' : ''}</option>`).join('');
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

let refreshPromise = null;
async function refreshTasks() {
  if (!canUse()) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
  try { await rpc('refresh_crm_task_assignments'); } catch (_) {}
  const { data, error } = await getClient().from('crm_tasks').select('*').order('scheduled_at', { ascending: true });
  if (error) {
    console.warn('No se pudieron cargar tareas', error);
    const list = document.getElementById('tasksList');
    if (list) list.innerHTML = '<p class="text-sm text-rose-300 py-6 text-center">No se pudieron cargar las tareas. Reintenta.</p>';
    return;
  }
  TASKS.cache = Array.isArray(data) ? data : [];
  renderTasksView();
  updateBell();
  renderDashboardBlock();
  notifyDue();
  }).finally(() => { refreshPromise = null; });
}

function tasksForScope(scope) {
  return filterTasks(TASKS.cache, scope, getUser()?.id);
}

function renderTasksView() {
  const root = document.getElementById('viewTareas');
  if (!root) return;
  const list = document.getElementById('tasksList');
  if (!list) return;
  const items = sortTasks(tasksForScope(TASKS.scope));
  if (!items.length) {
    list.innerHTML = '<p class="px-4 py-8 text-center text-sm text-slate-500">No hay tareas en esta vista.</p>';
    return;
  }
  list.innerHTML = items.map(t => {
    const st = taskState(t);
    const lead = t.lead_id ? ` · Lead #${t.lead_id}` : '';
    const assignee = t.assignee_id === getUser()?.id ? 'Tuya' : (TASKS.advisors.find(a => a.user_id === t.assignee_id)?.nombre || (t.assignee_id ? 'Asignada' : 'Sin asignar'));
    const canClaim = t.status === 'sin_asignar';
    const canComplete = t.status !== 'completada' && t.status !== 'cancelada' && (t.assignee_id === getUser()?.id || getAccess()?.role === 'admin' || getAccess()?.role === 'supervisor');
    const stateClass = st === 'vencida' ? 'text-rose-300' : st === 'completada' ? 'text-emerald-300' : 'text-slate-400';
    const stateLabel = st === 'vencida' ? 'Vencida' : st === 'completada' ? 'Completada' : 'Pendiente';
    return `<article class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-wide ${stateClass}">${stateLabel}${lead}</p>
        <p class="mt-1 text-sm font-medium text-slate-900">${escapeHtml(t.descripcion)}</p>
        <p class="mt-1 text-xs text-slate-500">${formatDateTime(t.scheduled_at)} · ${escapeHtml(assignee)}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        ${t.lead_id ? `<button data-task-view="${t.lead_id}" class="rounded-lg bg-[#FCE8DE] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F5D5C5]">Ver ficha</button>` : ''}
        ${canClaim ? `<button data-task-claim="${t.id}" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">Tomar</button>` : ''}
        ${canComplete ? `<button data-task-complete="${t.id}" class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">Completar</button>` : ''}
        <button data-task-cancel="${t.id}" class="rounded-lg bg-[#FCE8DE] px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-[#F5D5C5]">Cancelar</button>
      </div>
    </article>`;
  }).join('');
  list.querySelectorAll('[data-task-claim]').forEach(b => b.addEventListener('click', () => claimTask(b.dataset.taskClaim)));
  list.querySelectorAll('[data-task-complete]').forEach(b => b.addEventListener('click', () => completeTask(b.dataset.taskComplete)));
  list.querySelectorAll('[data-task-cancel]').forEach(b => b.addEventListener('click', () => cancelTask(b.dataset.taskCancel)));
  list.querySelectorAll('[data-task-view]').forEach(b => b.addEventListener('click', () => {
    if (window.openViewLeadModal) window.openViewLeadModal(Number(b.dataset.taskView), 'tareas');
  }));
}

async function claimTask(id) {
  try { await rpc('claim_crm_task', { p_task_id: id }); await refreshTasks(); window.showToast?.('Tarea tomada', 'success'); }
  catch (e) { window.showToast?.(e?.message || 'No se pudo tomar la tarea', 'warning'); }
}
async function completeTask(id) {
  try { await rpc('complete_crm_task', { p_task_id: id }); await refreshTasks(); window.showToast?.('Tarea completada', 'success'); }
  catch (e) { window.showToast?.(e?.message || 'No se pudo completar', 'warning'); }
}
async function cancelTask(id) {
  if (!confirm('¿Cancelar esta tarea?')) return;
  try { await rpc('cancel_crm_task', { p_task_id: id }); await refreshTasks(); window.showToast?.('Tarea cancelada', 'info'); }
  catch (e) { window.showToast?.(e?.message || 'No se pudo cancelar', 'warning'); }
}

function updateBell() {
  const badge = document.getElementById('tasksBellCount');
  if (!badge) return;
  const mine = tasksForScope('mine').filter(t => taskState(t) === 'vencida').length;
  const unassigned = tasksForScope('unassigned').length;
  const total = mine + unassigned;
  badge.textContent = total > 9 ? '9+' : String(total);
  badge.classList.toggle('hidden', total === 0);
}

function renderDashboardBlock() {
  const block = document.getElementById('tasksAttentionBlock');
  if (!block) return;
  const mineDue = tasksForScope('mine').filter(t => taskState(t) === 'vencida').length;
  const unassigned = tasksForScope('unassigned').length;
  if (mineDue === 0 && unassigned === 0) { block.classList.add('hidden'); return; }
  block.classList.remove('hidden');
  block.innerHTML = `<div class="flex items-center justify-between gap-3">
    <div>
      <p class="text-sm font-semibold text-slate-100">Tareas que requieren atención</p>
      <p class="text-[11px] text-slate-400">${mineDue} tuyas vencidas · ${unassigned} sin asignar</p>
    </div>
    <button id="tasksGoBtn" class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white">Ver tareas</button>
  </div>`;
  document.getElementById('tasksGoBtn')?.addEventListener('click', () => window.switchTab?.('tareas'));
}

function notifyDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  const mineDue = TASKS.cache.filter(t => t.assignee_id === getUser()?.id && taskState(t, now) === 'vencida');
  let changed = false;
  for (const t of mineDue) {
    if (TASKS.notified.has(t.id)) continue;
    TASKS.notified.add(t.id);
    changed = true;
    try { new Notification('Tarea vencida', { body: t.descripcion, tag: 'task-' + t.id }); } catch (_) {}
  }
  if (changed) localStorage.setItem('tasksNotified', JSON.stringify([...TASKS.notified].slice(-200)));
}

function setTaskLead(lead) {
  const idInput = document.getElementById('taskLeadId');
  const ctx = document.getElementById('taskLeadContext');
  if (!lead) {
    if (idInput) idInput.value = '';
    if (ctx) { ctx.classList.add('hidden'); ctx.innerHTML = ''; }
    return;
  }
  if (idInput) idInput.value = String(lead.id);
  if (ctx) {
    ctx.classList.remove('hidden');
    ctx.innerHTML = `<div class="flex items-start justify-between gap-3">
      <div>
        <p class="font-semibold text-slate-900">${escapeHtml(lead.nombre || 'Lead #' + lead.id)}</p>
        <p class="text-xs text-rose-700">${escapeHtml(lead.telefono || '')}${lead.telefono && lead.interesadoEn ? ' · ' : ''}${escapeHtml(lead.interesadoEn ? 'Interés: ' + lead.interesadoEn : '')}</p>
      </div>
      <button type="button" id="taskLeadClear" class="text-xs text-indigo-600 hover:text-indigo-700">Cambiar</button>
    </div>`;
    document.getElementById('taskLeadClear')?.addEventListener('click', () => setTaskLead(null));
  }
}

function openCreateTaskModal(leadId = null, leadName = null, leadPhone = null, leadProgram = null) {
  const modal = document.getElementById('modalTask');
  if (!modal) return;
  document.getElementById('taskDescription').value = '';
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('taskScheduledAt').value = local;
  const search = document.getElementById('taskLeadSearch');
  if (search) search.value = '';
  const results = document.getElementById('taskLeadResults');
  if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
  setTaskLead(leadId ? { id: leadId, nombre: leadName, telefono: leadPhone, interesadoEn: leadProgram } : null);
  loadAdvisors();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCreateTaskModal() {
  const modal = document.getElementById('modalTask');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

let taskSaving = false;
async function saveTask() {
  if (taskSaving) return;
  if (!canUse()) { window.showToast?.('Inicia sesión primero', 'warning'); return; }
  const leadRaw = document.getElementById('taskLeadId').value;
  const leadId = leadRaw ? Number(leadRaw) : null;
  const desc = document.getElementById('taskDescription').value.trim();
  const scheduled = document.getElementById('taskScheduledAt').value;
  const assignee = document.getElementById('taskAssignee').value || null;
  if (TASKS.advisorsError) {
    window.showToast?.('No se pudieron cargar las asesoras. Reintenta.', 'warning');
    return;
  }
  if (!desc) { window.showToast?.('Describe la tarea', 'warning'); return; }
  if (!scheduled) { window.showToast?.('Indica fecha y hora', 'warning'); return; }
  const iso = new Date(scheduled).toISOString();
  taskSaving = true;
  const saveBtn = document.getElementById('taskSaveBtn');
  if (saveBtn) saveBtn.disabled = true;
  try {
    await rpc('create_crm_task', {
      p_lead_id: leadId,
      p_descripcion: desc,
      p_scheduled_at: iso,
      p_assignee: assignee,
    });
    closeCreateTaskModal();
    await refreshTasks();
    window.showToast?.('Tarea creada', 'success');
  } catch (e) {
    window.showToast?.(e?.message || 'No se pudo crear la tarea', 'error');
  } finally {
    taskSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

function initTasksView() {
  const root = document.getElementById('viewTareas');
  if (!root) return;
  if (!root.dataset.initialized) {
    root.dataset.initialized = '1';
    root.innerHTML = `<section class="rounded-2xl border border-[#E8C4AF] bg-[#FFFAF7] p-5 sm:p-6 space-y-5">
      <header class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-white">Tareas</h2>
          <p class="text-sm text-slate-400">Organiza tus gestiones y atiende las pendientes.</p>
        </div>
        <button id="tasksNewBtn" class="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">＋ Nueva tarea</button>
      </header>
      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Filtros de tareas">
        <button data-scope="mine" class="tasks-scope rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white">Mis tareas</button>
        <button data-scope="unassigned" class="tasks-scope rounded-full bg-[#FCE8DE] px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-[#F5D5C5]">Sin asignar</button>
        <button data-scope="completed" class="tasks-scope rounded-full bg-[#FCE8DE] px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-[#F5D5C5]">Completadas</button>
      </div>
      <div id="tasksList" class="divide-y divide-[#E8C4AF] overflow-hidden rounded-xl border border-[#E8C4AF] bg-white"></div>
    </section>`;
    document.getElementById('tasksNewBtn')?.addEventListener('click', () => openCreateTaskModal(null));
    root.querySelectorAll('.tasks-scope').forEach(b => b.addEventListener('click', () => {
      TASKS.scope = b.dataset.scope;
      root.querySelectorAll('.tasks-scope').forEach(x => {
        const active = x.dataset.scope === TASKS.scope;
        x.className = `tasks-scope rounded-full px-4 py-1.5 text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'bg-[#FCE8DE] text-slate-700 hover:bg-[#F5D5C5]'}`;
      });
      renderTasksView();
    }));
  }
  if (!canUse()) {
    const list = document.getElementById('tasksList');
    if (list) list.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">Inicia sesión para ver las tareas.</p>';
    return;
  }
  loadAdvisors();
  refreshTasks();
  if (!TASKS.realtime) {
    try {
      TASKS.realtime = getClient().channel('crm_tasks_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_tasks' }, () => refreshTasks())
        .subscribe();
    } catch (_) {}
  }
  if (!TASKS.refreshTimer) {
    TASKS.refreshTimer = setInterval(() => { if (canUse()) refreshTasks(); }, 60000);
  }
}

function initBell() {
  const btn = document.getElementById('tasksBell');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => window.switchTab?.('tareas'));
  }
}

export function initTasksModule() {
  initBell();
  // bind modal save
  // lead search inside the task modal
  const leadSearch = document.getElementById('taskLeadSearch');
  const leadResults = document.getElementById('taskLeadResults');
  if (leadSearch && !leadSearch.dataset.bound) {
    leadSearch.dataset.bound = '1';
    let timer = null;
    leadSearch.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = leadSearch.value.trim();
        const found = q && window.searchLeadsForTask ? window.searchLeadsForTask(q) : [];
        if (!q || !found.length) {
          if (leadResults) { leadResults.classList.add('hidden'); leadResults.innerHTML = ''; }
          return;
        }
        TASKS.lastLeadResults = found;
        if (leadResults) {
          leadResults.classList.remove('hidden');
          leadResults.innerHTML = found.map(l => `<button type="button" data-lead-pick="${l.id}" class="block w-full px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-700">${escapeHtml(l.nombre)}<span class="block text-xs text-slate-400">${escapeHtml(l.telefono || '')}${l.interesadoEn ? ' · ' + escapeHtml(l.interesadoEn) : ''}</span></button>`).join('');
          leadResults.querySelectorAll('[data-lead-pick]').forEach(b => b.addEventListener('click', () => {
            const picked = (TASKS.lastLeadResults || []).find(x => String(x.id) === String(b.dataset.leadPick));
            if (picked) setTaskLead(picked);
            if (leadResults) { leadResults.classList.add('hidden'); leadResults.innerHTML = ''; }
            if (leadSearch) leadSearch.value = '';
          }));
        }
      }, 150);
    });
  }
  document.getElementById('btnCreateTaskFromLead')?.addEventListener('click', () => {
    const leadId = document.getElementById('editLeadId')?.value;
    const name = document.getElementById('editNombre')?.value?.trim();
    const phone = document.getElementById('editTelefono')?.value?.trim();
    const program = document.getElementById('editInteresadoEn')?.value?.trim();
    window.tasksModuleApi?.openCreateTaskModal(leadId ? Number(leadId) : null, name || null, phone || null, program || null);
  });
  document.getElementById('taskSaveBtn')?.addEventListener('click', saveTask);
  document.getElementById('taskCancelBtn')?.addEventListener('click', closeCreateTaskModal);
  document.getElementById('taskCancelBtn2')?.addEventListener('click', closeCreateTaskModal);

  // close on backdrop
  const modal = document.getElementById('modalTask');
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeCreateTaskModal(); });
}

function onSessionCleared() {
  if (TASKS.refreshTimer) { clearInterval(TASKS.refreshTimer); TASKS.refreshTimer = null; }
  if (TASKS.realtime) { try { getClient()?.removeChannel?.(TASKS.realtime); } catch (_) {} TASKS.realtime = null; }
  TASKS.cache = [];
  TASKS.advisors = [];
  TASKS.advisorsError = false;
  renderTasksView();
  updateBell();
  renderDashboardBlock();
}

function onSessionReady() {
  if (!canUse()) return;
  const root = document.getElementById('viewTareas');
  if (root?.dataset.initialized) {
    loadAdvisors();
    refreshTasks();
  }
  updateBell();
  renderDashboardBlock();
}

window.tasksModuleApi = {
  initTasksView,
  initTasksModule,
  openCreateTaskModal,
  refreshTasks,
  updateBell,
  renderDashboardBlock,
  onSessionReady,
  onSessionCleared,
};

// auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { try { initTasksModule(); } catch (_) {} });
} else {
  try { initTasksModule(); } catch (_) {}
}

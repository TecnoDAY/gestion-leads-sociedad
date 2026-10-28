// Servicio puro de tareas CRM (sin dependencias de DOM).
export const TASK_ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

export function isAdvisorActive(lastActivityAt, now = Date.now(), thresholdMs = TASK_ACTIVE_THRESHOLD_MS) {
  if (!lastActivityAt) return false;
  const ts = typeof lastActivityAt === 'number' ? lastActivityAt : Date.parse(lastActivityAt);
  if (!Number.isFinite(ts)) return false;
  return now - ts <= thresholdMs;
}

export function taskState(task, now = Date.now()) {
  if (!task) return 'pendiente';
  if (task.status === 'completada') return 'completada';
  if (task.status === 'cancelada') return 'cancelada';
  const due = Date.parse(task.scheduled_at);
  if (Number.isFinite(due) && due <= now) return 'vencida';
  return 'pendiente';
}

export function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    const da = Date.parse(a?.scheduled_at || 0) || 0;
    const db = Date.parse(b?.scheduled_at || 0) || 0;
    return da - db;
  });
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

export function filterTasks(tasks, scope, userId) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (scope === 'mine') return list.filter(t => t.assignee_id === userId && t.status !== 'completada' && t.status !== 'cancelada');
  if (scope === 'unassigned') return list.filter(t => t.status === 'sin_asignar');
  if (scope === 'completed') return list.filter(t => t.status === 'completada' || t.status === 'cancelada');
  return list;
}

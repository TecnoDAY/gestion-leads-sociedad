// Modulo Kanban integrado en el CRM. Se inicializa al entrar a la vista.
import '/src/kanban/kanban.css';
import { filtrarIngreso, validarRangoIngreso, mesActualMiami } from './periodo.js';
import { escapeAttr, escapeHtml } from '../legacy/helpers.js';

let initialized = false;
let draggedLeadId = null;
let loading = false;
let errorState = null;
let currentBase = [];
let requestGeneration = 0;
let rangeInitialized = false;
let consulta = null;
let moreAvailable = false;

const STATUS_COLORS = {
  'INFORMACIÓN': { hex: '#3b82f6', accent: 'text-blue-400', badge: 'bg-blue-500/10' },
  'INFORMACION': { hex: '#3b82f6', accent: 'text-blue-400', badge: 'bg-blue-500/10' },
  'AGENDADO': { hex: '#f59e0b', accent: 'text-amber-400', badge: 'bg-amber-500/10' },
  'NO CONTESTA': { hex: '#f43f5e', accent: 'text-rose-400', badge: 'bg-rose-500/10' },
  'INSCRITO': { hex: '#10b981', accent: 'text-emerald-400', badge: 'bg-emerald-500/10' },
};
const OTHER_COLORS = ['#2563eb', '#b45309', '#be123c', '#047857', '#7c3aed', '#0e7490', '#c2410c', '#a21caf'];
function colorFor(id) {
  if (STATUS_COLORS[id]) return STATUS_COLORS[id];
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
  return { hex: OTHER_COLORS[hash % OTHER_COLORS.length], accent: 'text-slate-400', badge: 'bg-slate-500/10' };
}

function supabase() { return (window.crmSupabase ? window.crmSupabase() : null); }
function isAdmin() { return (window.crmIsAdmin ? window.crmIsAdmin() : false); }
function gf(lead, key) { return (window.getField ? window.getField(lead, key) : (lead?.[key] ?? '')); }
function gestion(lead) { return String(gf(lead, 'GESTION') || '').trim().toUpperCase(); }
function container() { return document.getElementById('kanbanBoard'); }

function updatePeriodNotice() {
  const notice = document.getElementById('kanbanPeriodNotice');
  if (!notice) return;
  if (consulta) {
    const { p_origen, p_desde, p_hasta, p_busqueda } = consulta;
    const scope = p_desde ? `del ${p_desde} al ${p_hasta}` : 'sin límite de fechas';
    notice.textContent = `${p_origen === 'historico' ? 'Históricos (solo lectura)' : 'Actuales'} · ${scope}${p_busqueda ? ` · Búsqueda: ${p_busqueda}` : ''} · ${currentBase.length} resultados cargados${moreAvailable ? ' (hay más)' : ''}.`;
    return;
  }
  const desde = document.getElementById('kanbanDesde')?.value;
  const hasta = document.getElementById('kanbanHasta')?.value;
  const format = value => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  notice.textContent = `${desde && hasta ? `Período: del ${format(desde)} al ${format(hasta)}` : 'Todos los períodos'} · Resultados entre los últimos 2.000 leads cargados.`;
}

const collationEs = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function columns() {
  const vals = (window.crmCatalogGestion ? window.crmCatalogGestion() : []);
  return (vals || [])
    .map(v => {
      const id = String(v).trim().toUpperCase();
      const c = colorFor(id);
      return { id, title: v, hex: c.hex, accent: c.accent, badge: c.badge };
    })
    .sort((a, b) => collationEs.compare(a.title, b.title));
}

async function loadBase(generation = requestGeneration) {
  const desde = document.getElementById('kanbanDesde')?.value || '';
  const hasta = document.getElementById('kanbanHasta')?.value || '';
  errorState = null;
  try {
    validarRangoIngreso(desde, hasta);
    if (!window.crmLoadKanbanLeads) throw new Error('No se pudo consultar el CRM.');
    const leads = await window.crmLoadKanbanLeads();
    return filtrarIngreso(leads, desde, hasta);
  } catch (e) {
    if (generation === requestGeneration) errorState = e?.message || 'No se pudieron cargar los leads.';
    return [];
  }
}

// --- Controles de desplazamiento: arrastre del fondo + barra flotante -----
let scrollControlsReady = false;
let suppressClick = false;

function boardMetrics() {
  const board = document.getElementById('kanbanBoard');
  if (!board) return null;
  return {
    board,
    max: Math.max(0, board.scrollWidth - board.clientWidth),
    left: board.scrollLeft,
  };
}

function updateFloatScroll() {
  const track = document.getElementById('kanbanFloatScroll');
  const thumb = document.getElementById('kanbanFloatThumb');
  if (!track || !thumb) return;
  const m = boardMetrics();
  if (!m) return;
  const view = document.getElementById('viewKanban');
  // La barra flotante solo existe mientras la vista Kanban esta activa.
  if (view && view.classList.contains('hidden')) {
    track.classList.remove('is-visible');
    return;
  }
  const visible = m.board.clientWidth;
  const total = m.board.scrollWidth;
  const overflow = total - visible;
  if (overflow <= 4) {
    track.classList.remove('is-visible');
    track.setAttribute('aria-valuenow', '0');
    return;
  }
  track.classList.add('is-visible');
  const ratio = Math.min(1, visible / total);
  const thumbW = Math.max(48, Math.round(track.clientWidth * ratio));
  const maxThumbLeft = Math.max(0, track.clientWidth - thumbW);
  const progress = overflow > 0 ? m.left / overflow : 0;
  thumb.style.width = thumbW + 'px';
  thumb.style.left = Math.round(progress * maxThumbLeft) + 'px';
  track.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
}

function setupScrollControls() {
  const board = document.getElementById('kanbanBoard');
  const shell = document.getElementById('kanbanScrollShell');
  const track = document.getElementById('kanbanFloatScroll');
  const thumb = document.getElementById('kanbanFloatThumb');
  const btnL = document.getElementById('kanbanScrollLeft');
  const btnR = document.getElementById('kanbanScrollRight');
  if (!board) return;

  if (!scrollControlsReady) {
    scrollControlsReady = true;

    // Sincroniza la barra flotante con el tablero (y al redimensionar).
    board.addEventListener('scroll', updateFloatScroll, { passive: true });
    window.addEventListener('resize', updateFloatScroll);
    const observer = new MutationObserver(() => updateFloatScroll());
    observer.observe(board, { childList: true, subtree: true });
    const view = document.getElementById('viewKanban');
    if (view) {
      const viewObserver = new MutationObserver(() => updateFloatScroll());
      viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
    }

    // Arrastre del fondo con el mouse (pointer events + captura).
    let isDown = false, dragging = false, startX = 0, startLeft = 0, pointerId = null;
    shell?.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-lead]')) return;          // tarjetas
      if (e.target.closest('#kanbanFloatScroll')) return;   // barra flotante
      if (e.target.closest('#kanbanScrollLeft, #kanbanScrollRight')) return;
      isDown = true; dragging = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startLeft = board.scrollLeft;
    });
    shell?.addEventListener('pointermove', (e) => {
      if (!isDown || e.pointerId !== pointerId) return;
      const walk = e.clientX - startX;
      if (!dragging && Math.abs(walk) < 4) return;
      if (!dragging) {
        dragging = true;
        board.classList.add('is-dragging');
        try { shell.setPointerCapture(pointerId); } catch (_) { /* no critico */ }
      }
      board.scrollLeft = startLeft - walk;
    });
    const endDrag = (e) => {
      if (!isDown) return;
      isDown = false;
      board.classList.remove('is-dragging');
      if (pointerId !== null) {
        try { shell?.releasePointerCapture(pointerId); } catch (_) { /* no critico */ }
      }
      pointerId = null;
      if (dragging) {
        dragging = false;
        // Marca para no disparar un clic accidental al terminar el arrastre.
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 120);
      }
    };
    shell?.addEventListener('pointerup', endDrag);
    shell?.addEventListener('pointercancel', endDrag);
    shell?.addEventListener('lostpointercapture', endDrag);
    window.addEventListener('blur', endDrag);

    // Rueda del raton: solo el desplazamiento horizontal explicito mueve el
    // tablero. La rueda vertical se conserva para bajar dentro de la columna
    // o de la pagina; el gesto horizontal del touchpad sigue funcionando.
    shell?.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical: nativo
      const m = boardMetrics();
      if (!m || m.max <= 0) return;
      board.scrollLeft += e.deltaX;
      e.preventDefault();
    }, { passive: false });

    // Barra flotante: clic en la pista y arrastre del pulgar.
    const scrollToRatio = (clientX) => {
      const m = boardMetrics();
      if (!m || m.max <= 0) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      board.scrollTo({ left: ratio * m.max, behavior: 'auto' });
    };
    track?.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      scrollToRatio(e.clientX);
    });
    let thumbDrag = null;
    thumb?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      thumbDrag = { startX: e.clientX, startLeft: board.scrollLeft };
      try { thumb.setPointerCapture(e.pointerId); } catch (_) { /* no critico */ }
      thumb.style.cursor = 'grabbing';
    });
    thumb?.addEventListener('pointermove', (e) => {
      if (!thumbDrag) return;
      const m = boardMetrics();
      if (!m || m.max <= 0) return;
      const rect = track.getBoundingClientRect();
      const thumbW = thumb.offsetWidth;
      const maxThumbLeft = Math.max(1, rect.width - thumbW);
      const deltaRatio = (e.clientX - thumbDrag.startX) / maxThumbLeft;
      board.scrollLeft = thumbDrag.startLeft + deltaRatio * m.max;
    });
    const endThumb = () => {
      thumbDrag = null;
      if (thumb) thumb.style.cursor = 'grab';
    };
    thumb?.addEventListener('pointerup', endThumb);
    thumb?.addEventListener('pointercancel', endThumb);
    thumb?.addEventListener('lostpointercapture', endThumb);

    // Teclado sobre la barra flotante.
    track?.addEventListener('keydown', (e) => {
      const m = boardMetrics();
      if (!m) return;
      const step = Math.max(120, Math.round(m.board.clientWidth * 0.6));
      if (e.key === 'ArrowRight') { board.scrollBy({ left: step, behavior: 'smooth' }); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { board.scrollBy({ left: -step, behavior: 'smooth' }); e.preventDefault(); }
      else if (e.key === 'Home') { board.scrollTo({ left: 0, behavior: 'smooth' }); e.preventDefault(); }
      else if (e.key === 'End') { board.scrollTo({ left: m.max, behavior: 'smooth' }); e.preventDefault(); }
    });

    btnL?.addEventListener('click', () => board.scrollBy({ left: -300, behavior: 'smooth' }));
    btnR?.addEventListener('click', () => board.scrollBy({ left: 300, behavior: 'smooth' }));
  }
  updateFloatScroll();
}

function renderBoard() {
  const board = container();
  if (!board) return;
  setupScrollControls();
  const q = (document.getElementById('kanbanSearch')?.value || '').toLowerCase().trim();

  if (loading) {
    board.innerHTML = '<p class="text-sm kanban-text-muted p-4">Cargando…</p>';
    return;
  }
  if (errorState) {
    board.innerHTML = `<p class="text-sm text-rose-400 p-4">${escapeHtml(errorState)}</p>`;
    updateStats([]);
    return;
  }
  if (!currentBase.length) {
    board.innerHTML = `<p class="text-sm kanban-text-muted p-4">${consulta ? 'No hay coincidencias para esta consulta.' : 'No hay leads de este período entre los registros cargados.'}</p>`;
    updateStats([]);
    return;
  }

  const cols = columns();
  const visibleLeads = currentBase.filter(lead => !q
    || (gf(lead, 'Nombre') + ' ' + gf(lead, 'Apellido')).toLowerCase().includes(q)
    || String(gf(lead, 'Telefono')).toLowerCase().includes(q));
  if (!visibleLeads.length) {
    board.innerHTML = `<p class="text-sm kanban-text-muted p-4">${consulta ? 'No hay coincidencias entre los resultados cargados.' : 'No hay leads de este período entre los registros cargados.'}</p>`;
    updateStats([]);
    return;
  }
  board.innerHTML = '';
  cols.forEach(col => {
    const colLeads = visibleLeads.filter(l => gestion(l) === col.id);
    const colEl = document.createElement('div');
    colEl.className = 'flex flex-col kanban-column rounded-xl w-72 min-w-[280px] max-h-full overflow-hidden';
    colEl.innerHTML = `
      <div class="p-3 border-b flex items-center justify-between kanban-column-header">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color:${col.hex}"></span>
          <h2 class="font-semibold text-xs tracking-wide uppercase kanban-text">${escapeHtml(col.title)}</h2>
        </div>
        <span class="text-[11px] font-mono px-2 py-0.5 rounded-full kanban-counter">${colLeads.length}</span>
      </div>
      <div class="kanban-dropzone flex-1 overflow-y-auto p-2.5 space-y-2 min-h-[120px]" data-col="${escapeAttr(col.id)}">
        ${colLeads.map(l => cardHtml(l, col)).join('')}
      </div>`;
    board.appendChild(colEl);
  });
  const known = new Set(cols.map(c => c.id));
  const unknown = visibleLeads.filter(l => !known.has(gestion(l)));
  if (unknown.length) {
    const colEl = document.createElement('div');
    colEl.className = 'flex flex-col kanban-column rounded-xl w-72 min-w-[280px] max-h-full overflow-hidden';
    colEl.innerHTML = `
      <div class="p-3 border-b flex items-center justify-between kanban-column-header">
        <div class="flex items-center space-x-2">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color:#94a3b8"></span>
          <h2 class="font-semibold text-xs tracking-wide uppercase kanban-text">Sin columna asignada</h2>
        </div>
        <span class="text-[11px] font-mono px-2 py-0.5 rounded-full kanban-counter">${unknown.length}</span>
      </div>
      <div class="kanban-dropzone flex-1 overflow-y-auto p-2.5 space-y-2 min-h-[120px]" data-col="">
        ${unknown.map(l => cardHtml(l, { title: 'Sin columna', badge: 'bg-slate-500/10', accent: 'text-slate-400', dot: 'bg-slate-400' })).join('')}
      </div>`;
    board.appendChild(colEl);
  }
  board.querySelectorAll('.kanban-dropzone').forEach(zone => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('column-drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('column-drag-over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('column-drag-over'); window.kanbanDrop(e, zone.dataset.col); });
  });
  board.querySelectorAll('[data-lead]').forEach(card => {
    card.addEventListener('dragstart', (e) => window.kanbanDragStart(e, card.dataset.lead));
    card.addEventListener('dragend', window.kanbanDragEnd);
    card.addEventListener('click', () => {
      if (suppressClick) return;
      window.kanbanOpenLead(card.dataset.lead);
    });
  });
  if (window.lucide) window.lucide.createIcons();
  updateStats(visibleLeads);
}

function cardHtml(lead, col) {
  const name = (gf(lead,'Nombre') + ' ' + gf(lead,'Apellido')).trim() || 'Sin nombre';
  const phone = gf(lead,'Telefono');
  const mes = gf(lead,'Mes');
  return `
    <div id="kcard-${escapeAttr(lead.id)}" draggable="${consulta?.p_origen === 'historico' ? 'false' : 'true'}" data-lead="${escapeAttr(lead.id)}"
         class="kanban-card rounded-2xl p-3 shadow-sm transition-all duration-150 cursor-grab active:cursor-grabbing group">
      <div class="flex items-start justify-between gap-2 mb-1.5">
        <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.badge} ${col.accent}">${escapeHtml(mes || '-')}</span>
      </div>
      <h3 class="text-xs font-semibold mb-1 kanban-text leading-snug">${escapeHtml(name)}</h3>
      ${phone ? `<div class="flex items-center gap-1.5 text-[11px] kanban-text-muted"><i data-lucide="phone" class="w-3 h-3"></i><span>${escapeHtml(phone)}</span></div>` : ''}
      <div class="flex items-center justify-between text-[10px] pt-1.5 border-t kanban-text-muted mt-1.5" style="border-color:var(--kb-card-border)">
        <span>#${escapeHtml(String(lead.id))}</span>
      </div>
    </div>`;
}

function updateStats(base) {
  const el = (id) => document.getElementById(id);
  if (el('kanbanStatTotal')) el('kanbanStatTotal').textContent = base.length;
  if (el('kanbanStatInscritos')) el('kanbanStatInscritos').textContent = base.filter(l => gestion(l).startsWith('INSCRIT')).length;
  if (el('kanbanStatNoContesta')) el('kanbanStatNoContesta').textContent = base.filter(l => gestion(l) === 'NO CONTESTA').length;
}

async function updateStatus(lead, newStatus) {
  const sb = supabase();
  if (!sb) { window.showToast?.('Sin conexión', 'error'); return false; }
  const fields = { GESTION: newStatus };
  let error;
  if (isAdmin()) {
    ({ error } = await sb.rpc('update_lead_full', { p_id: lead.id, p_lead: fields }));
  } else {
    ({ error } = await sb.rpc('update_lead_followup', { p_id: lead.id, p_fields: fields }));
  }
  if (error) { window.showToast?.('No se pudo actualizar: ' + (error.message || ''), 'error'); return false; }
  lead.GESTION = newStatus;
  if (lead['GESTION']) lead['GESTION'] = newStatus;
  return true;
}

window.kanbanDragStart = (e, id) => { if (consulta?.p_origen === 'historico') { e.preventDefault(); return; } draggedLeadId = id; e.dataTransfer.setData('text/plain', id); setTimeout(() => { const c = document.getElementById('kcard-' + id); if (c) c.classList.add('card-ghost'); }, 0); };
window.kanbanDragEnd = (e) => { const c = document.getElementById('kcard-' + draggedLeadId); if (c) c.classList.remove('card-ghost'); draggedLeadId = null; document.querySelectorAll('.kanban-dropzone').forEach(z => z.classList.remove('column-drag-over')); };
window.kanbanDrop = async (e, targetStatus) => {
  e.preventDefault(); e.currentTarget.classList.remove('column-drag-over');
  if (consulta?.p_origen === 'historico') return;
  if (!targetStatus || !draggedLeadId) return;
  const lead = currentBase.find(l => String(l.id) === String(draggedLeadId));
  if (!lead) return;
  if (targetStatus === 'AGENDADO' && gestion(lead) !== 'AGENDADO') {
    if (typeof window.crmOpenEditLead === 'function') window.crmOpenEditLead('actual', lead.id);
    return;
  }
  const ok = await updateStatus(lead, targetStatus);
  if (ok) {
    if (typeof window.crmApplyFilters === 'function') window.crmApplyFilters({ preservePage: true });
    if (consulta) renderBoard(); else await refresh();
  }
};
window.kanbanOpenLead = (id) => {
  const origin = consulta?.p_origen || 'actual';
  if (typeof window.crmOpenViewLead === 'function') window.crmOpenViewLead(origin, id);
  else if (origin === 'actual' && typeof window.crmOpenEditLead === 'function') window.crmOpenEditLead(origin, id);
};
window.crmFindKanbanLead = (id, origin = 'actual') => (consulta?.p_origen || 'actual') === origin
  ? currentBase.find(lead => String(lead.id) === String(id)) : undefined;
window.crmResetKanban = () => {
  requestGeneration++;
  currentBase = [];
  loading = false;
  errorState = null;
  rangeInitialized = false;
  consulta = null;
  moreAvailable = false;
  const feedback = document.getElementById('kanbanQueryError');
  if (feedback) feedback.textContent = '';
  document.getElementById('kanbanMore')?.classList.add('hidden');
  document.getElementById('kanbanQueryPanel')?.classList.add('hidden');
  const notice = document.getElementById('kanbanPeriodNotice');
  if (notice) notice.textContent = '';
  container()?.replaceChildren();
  updateStats([]);
};

async function runQuery(append = false) {
  const el = id => document.getElementById(id);
  const feedback = el('kanbanQueryError');
  if (feedback) feedback.textContent = '';
  let params;
  let generation;
  try {
    if (append) {
      if (!consulta || !moreAvailable || !currentBase.length) return;
      params = { ...consulta, p_antes_id: currentBase.at(-1).id };
    } else {
      const from = el('kanbanQueryDesde')?.value || '';
      const to = el('kanbanQueryHasta')?.value || '';
      const term = el('kanbanQueryText')?.value.trim() || '';
      validarRangoIngreso(from, to);
      if ((!from && !term) || (term && (term.length < 3 || term.length > 80))) throw new Error('Indica fechas completas o busca al menos 3 caracteres (máximo 80).');
      params = { p_origen: el('kanbanQueryOrigin')?.value, p_desde: from || null, p_hasta: to || null, p_busqueda: term || null };
      if (!['actual', 'historico'].includes(params.p_origen)) throw new Error('Origen inválido.');
    }
    generation = ++requestGeneration;
    el('kanbanRunQuery').disabled = true;
    el('kanbanMore').disabled = true;
    const rows = await window.crmQueryKanban({ ...params, p_limite: 100 });
    if (generation !== requestGeneration) return;
    moreAvailable = rows.length > 100;
    currentBase = append ? [...currentBase, ...rows.slice(0, 100)] : rows.slice(0, 100);
    consulta = { ...params, p_antes_id: null };
    if (!append && el('kanbanSearch')) el('kanbanSearch').value = '';
    el('kanbanMore')?.classList.toggle('hidden', !moreAvailable);
    errorState = null;
    updatePeriodNotice();
    renderBoard();
  } catch (error) {
    if (feedback && (generation === undefined || generation === requestGeneration)) feedback.textContent = error?.message || 'No se pudo consultar el Tablero.';
  } finally {
    if (generation === undefined || generation === requestGeneration) {
      if (el('kanbanRunQuery')) el('kanbanRunQuery').disabled = false;
      if (el('kanbanMore')) el('kanbanMore').disabled = false;
    }
  }
}

function backToQuick() {
  requestGeneration++;
  consulta = null;
  moreAvailable = false;
  document.getElementById('kanbanQueryError').textContent = '';
  document.getElementById('kanbanMore')?.classList.add('hidden');
  if (document.getElementById('kanbanRunQuery')) document.getElementById('kanbanRunQuery').disabled = false;
  if (document.getElementById('kanbanMore')) document.getElementById('kanbanMore').disabled = false;
  refresh();
}

async function refresh() {
  const generation = ++requestGeneration;
  const board = container();
  const horizontal = board?.scrollLeft ?? 0;
  const vertical = new Map(Array.from(board?.querySelectorAll('.kanban-dropzone') || [],
    zone => [zone.dataset.col, zone.scrollTop]));
  loading = true; errorState = null;
  if (!currentBase.length) renderBoard();
  let shouldRender = true;
  try {
    const next = await loadBase(generation);
    if (generation !== requestGeneration) { shouldRender = false; return; }
    if (errorState && currentBase.length) {
      window.showToast?.(errorState, 'error');
      errorState = null;
      shouldRender = false;
      return;
    }
    currentBase = next;
    updatePeriodNotice();
  } finally {
    if (generation === requestGeneration) {
      loading = false;
      if (shouldRender) renderBoard();
      if (board && shouldRender) {
        board.scrollLeft = horizontal;
        board.querySelectorAll('.kanban-dropzone').forEach(zone => {
          zone.scrollTop = vertical.get(zone.dataset.col) ?? 0;
        });
      }
    }
  }
}

export function initKanban() {
  if (!rangeInitialized) {
    const [from, to] = mesActualMiami();
    const desde = document.getElementById('kanbanDesde');
    const hasta = document.getElementById('kanbanHasta');
    if (desde && hasta) {
      desde.value = from;
      hasta.value = to;
      rangeInitialized = true;
    }
  }
  if (!initialized) {
    const board = document.getElementById('kanbanBoard');
    if (board) {
      const search = document.getElementById('kanbanSearch');
      const desde = document.getElementById('kanbanDesde');
      const hasta = document.getElementById('kanbanHasta');
      if (search) search.addEventListener('input', renderBoard);
      if (desde) desde.addEventListener('change', () => { if (consulta) backToQuick(); else refresh(); });
      if (hasta) hasta.addEventListener('change', () => { if (consulta) backToQuick(); else refresh(); });
      document.getElementById('kanbanToggleQuery')?.addEventListener('click', () => document.getElementById('kanbanQueryPanel')?.classList.toggle('hidden'));
      document.getElementById('kanbanRunQuery')?.addEventListener('click', () => runQuery());
      document.getElementById('kanbanMore')?.addEventListener('click', () => runQuery(true));
      document.getElementById('kanbanBackQuick')?.addEventListener('click', backToQuick);
      initialized = true;
    }
  }
  if (consulta) renderBoard(); else refresh();
}

window.initKanban = initKanban;
window.renderKanban = renderBoard;

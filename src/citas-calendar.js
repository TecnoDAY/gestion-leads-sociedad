/**
 * Módulo de calendario para la vista Citas.
 * Carga FullCalendar v6 bajo demanda y expone una API mínima para
 * crear/reutilizar una instancia por contenedor.
 * Las funciones puras se exportan para tests futuros; la API pública
 * se registra en window.citasCalendarApi para el script clásico.
 */

let calendarInstance = null;

/**
 * Crea la configuración base del calendario.
 * @param {object} opts - Opciones adicionales (se mezclan con la base).
 * @returns {object} Configuración completa para new Calendar().
 */
export function createCalendarConfig(opts = {}) {
  return {
    plugins: [], // se rellena en ensureCalendar tras importar plugins
    initialView: 'timeGridWeek',
    headerToolbar: false,
    locale: 'es',
    height: 'auto',
    nowIndicator: false,
    events: [],
    slotMinTime: '07:00:00',
    slotMaxTime: '22:00:00',
    allDaySlot: false,
    businessHours: {
      daysOfWeek: [1, 2, 3, 4, 5], // lunes a viernes
      startTime: '09:00',
      endTime: '19:00',
    },
    ...opts,
  };
}

/**
 * Convierte un timestamp ISO (timestamptz) a string naive 'YYYY-MM-DDTHH:mm'
 * en zona America/New_York (Miami) usando Intl.DateTimeFormat con formatToParts.
 * No hace parsing manual de offsets; usa el formateador nativo.
 * @param {string} isoUtc - Timestamp ISO con zona (ej. '2026-07-15T16:00:00Z')
 * @returns {string|null} String naive en Miami o null si entrada inválida.
 */
export function miamiNaive(isoUtc) {
  if (!isoUtc || typeof isoUtc !== 'string') return null;
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Convierte un instante (ISO string o Date) al DÍA Miami 'YYYY-MM-DD'
 * (sin componente hora). Un <input type="date"> rechaza valores con hora
 * y los sanea a cadena vacía, lo que dejaba citasDesde/citasHasta en ''
 * y bloqueaba loadCitas ("Rango de fechas no válido"); ver test de
 * regresión en scripts/tests/citas-calendar.test.mjs.
 * @param {string|Date} value - ISO timestamptz o Date.
 * @returns {string} 'YYYY-MM-DD' o '' si la entrada es inválida.
 */
export function toMiamiDay(value) {
  const iso = value instanceof Date ? value.toISOString() : value;
  const naive = miamiNaive(iso);
  return naive ? naive.slice(0, 10) : '';
}

/**
 * Añade minutos a un string naive 'YYYY-MM-DDTHH:mm' usando aritmética UTC pura.
 * Normaliza el día (maneja rollover de medianoche) sin re-parsear en zona del navegador.
 * @param {string} naiveStr - String naive 'YYYY-MM-DDTHH:mm'
 * @param {number} minutes - Minutos a sumar (default 60)
 * @returns {string} Nuevo string naive 'YYYY-MM-DDTHH:mm'
 */
export function addMinutesNaive(naiveStr, minutes = 60) {
  if (!naiveStr || typeof naiveStr !== 'string') return '';
  const m = naiveStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return '';
  const [, y, mo, d, h, mi] = m.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi) + minutes * 60000;
  const nd = new Date(ms);
  const ny = nd.getUTCFullYear();
  const nmo = String(nd.getUTCMonth() + 1).padStart(2, '0');
  const nday = String(nd.getUTCDate()).padStart(2, '0');
  const nh = String(nd.getUTCHours()).padStart(2, '0');
  const nmi = String(nd.getUTCMinutes()).padStart(2, '0');
  return `${ny}-${nmo}-${nday}T${nh}:${nmi}`;
}

/**
 * Genera un color estable a partir de una clave usando hash djb2 sobre
 * una paleta fija de ~10 colores con contraste garantizado en claro y oscuro.
 * Misma entrada => mismo color siempre.
 * @param {string|number} key - Clave (ej. advisor_user_id o advisor_name)
 * @returns {string} Color hexadecimal (ej. '#2563eb')
 */
export function advisorColor(key) {
  const str = String(key ?? '');
  // djb2 hash
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
  }
  // Paleta fija de 10 colores con buen contraste en ambos temas
  const palette = [
    '#2563eb', // blue-600
    '#dc2626', // red-600
    '#059669', // emerald-600
    '#d97706', // amber-600
    '#7c3aed', // violet-600
    '#0891b2', // cyan-600
    '#db2777', // pink-600
    '#65a30d', // lime-600
    '#ea580c', // orange-600
    '#4f46e5', // indigo-600
  ];
  const idx = Math.abs(hash) % palette.length;
  return palette[idx];
}

/**
 * Asegura que exista una instancia de Calendar en el contenedor dado.
 * Si ya existe, la devuelve; si no, importa FullCalendar dinámicamente,
 * crea la instancia, la renderiza y la cachea.
 * @param {string} containerId - ID del elemento contenedor (p.ej. 'citasCalendar').
 * @param {object} [opts={}] - Opciones extra para la configuración.
 *   - events: EventSourceInput[]
 *   - onRangeChange: (range: {start:string, end:string}) => void, ambos días 'YYYY-MM-DD'
 *   - onEventClick: (info: {event: EventApi}) => void
 * @returns {Promise<import('@fullcalendar/core').Calendar>} Instancia de Calendar.
 */
export async function ensureCalendar(containerId, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Contenedor #${containerId} no encontrado`);
  }

  // Si ya hay una instancia en este contenedor, devuélvela
  if (calendarInstance && calendarInstance.el === container) {
    // Actualizar opciones si se pasan (p.ej. events)
    if (opts.events) {
      calendarInstance.removeAllEvents();
      calendarInstance.addEventSource(opts.events);
    }
    return calendarInstance;
  }

  // Importar FullCalendar bajo demanda. OJO: Calendar es export CON NOMBRE en
  // @fullcalendar/core (no existe default; ver test de contrato en
  // scripts/tests/citas-calendar.test.mjs). Los plugins sí exponen default.
  const [{ Calendar }, { default: dayGridPlugin }, { default: timeGridPlugin }] = await Promise.all([
    import('@fullcalendar/core'),
    import('@fullcalendar/daygrid'),
    import('@fullcalendar/timegrid'),
  ]);

  // Preparar callbacks
  const config = createCalendarConfig(opts);
  config.plugins = [dayGridPlugin, timeGridPlugin];

  // datesSet: notificar rango visible del grid (días 'YYYY-MM-DD', sin hora)
  if (typeof opts.onRangeChange === 'function') {
    config.datesSet = (info) => {
      const view = calendarInstance.view;
      const start = toMiamiDay(view.currentStart);
      // end exclusive: currentEnd es el día siguiente al último visible
      const endExclusive = new Date(view.currentEnd.getTime() - 86400000);
      const end = toMiamiDay(endExclusive);
      if (start && end) {
        opts.onRangeChange({ start, end });
      }
    };
  }

  // eventClick: delegar al handler con extendedProps
  if (typeof opts.onEventClick === 'function') {
    config.eventClick = (info) => {
      opts.onEventClick(info.event.extendedProps);
    };
  }

  calendarInstance = new Calendar(container, config);
  calendarInstance.render();
  return calendarInstance;
}

/**
 * Destruye la instancia cacheada (útil al cambiar de vista o limpiar).
 */
export function destroyCalendar() {
  if (calendarInstance) {
    calendarInstance.destroy();
    calendarInstance = null;
  }
}

/**
 * Navega la vista del calendario.
 * @param {'prev'|'next'|'today'} action
 */
export function navigateCalendar(action) {
  if (!calendarInstance) return;
  switch (action) {
    case 'prev':
      calendarInstance.prev();
      break;
    case 'next':
      calendarInstance.next();
      break;
    case 'today':
      calendarInstance.today();
      break;
  }
}

/**
 * Cambia la vista del calendario.
 * @param {'timeGridDay'|'timeGridWeek'|'dayGridMonth'} viewName
 */
export function setView(viewName) {
  if (!calendarInstance) return;
  calendarInstance.changeView(viewName);
}

/**
 * Obtiene el título del período visible.
 * @returns {string}
 */
export function getCalendarTitle() {
  if (!calendarInstance) return '';
  return calendarInstance.view.title;
}

/**
 * Obtiene el rango visible del grid (start inclusive, end inclusive),
 * ambos como días Miami 'YYYY-MM-DD' (sin componente hora).
 * @returns {{start:string, end:string}|null}
 */
export function getViewRange() {
  if (!calendarInstance) return null;
  const view = calendarInstance.view;
  const start = toMiamiDay(view.currentStart);
  const endExclusive = new Date(view.currentEnd.getTime() - 86400000);
  const end = toMiamiDay(endExclusive);
  if (start && end) return { start, end };
  return null;
}

/**
 * Actualiza los eventos del calendario.
 * @param {Array} events - Array de eventos FullCalendar
 */
export function updateEvents(events) {
  if (!calendarInstance) return;
  calendarInstance.removeAllEvents();
  calendarInstance.addEventSource(events);
}

// Registrar API pública en window para el script clásico (solo en navegador)
if (typeof window !== 'undefined') {
  window.citasCalendarApi = {
    ensureCalendar,
    destroyCalendar,
    navigateCalendar,
    getCalendarTitle,
    setView,
    getViewRange,
    updateEvents,
    // Exportar funciones puras para uso desde script clásico
    miamiNaive,
    addMinutesNaive,
    advisorColor,
  };
}
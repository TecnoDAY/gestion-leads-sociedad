/**
 * Capa 2 del patron strangler: Centro de ayuda (seccion 10b del monolito).
 * Contenido estatico, buscable, sin red. El markup del modal y los botones
 * con onclick siguen en index.html; las llamadas inline resuelven via window.
 * Bloque movido con script (sin reescribirlo a mano) para no alterar entidades.
 */

import { escapeHtml, escapeAttr } from './helpers.js';

// -------------------------------------------------------------
// 10b. CENTRO DE AYUDA (contenido estatico, buscable, sin red)
// -------------------------------------------------------------
const HELP_SECTIONS = [
  {
    id: 'ayuda-nuevo-lead',
    icon: 'user-plus',
    title: 'Crear un lead',
    summary: 'Registrar un contacto nuevo y, si se agenda, su cita en la misma operación.',
    steps: [
      'Pulsa "+ Nuevo Lead" en la cabecera para abrir el formulario de alta.',
      'Rellena Nombre Completo y Teléfono / WhatsApp: son los únicos campos obligatorios. El teléfono se formatea solo al salir del campo.',
      'Indica la Fecha de llegada del lead: aparece hoy (Miami) por defecto y admite cualquier fecha pasada, útil cuando el contacto llegó de noche o a la madrugada y se registra al día siguiente. No admite fechas futuras.',
      'El Mes se calcula solo a partir de la Fecha de llegada y se muestra como referencia: no se elige a mano, así nunca queda inconsistente con la fecha.',
      'Si el teléfono ya está en la base verás un aviso ámbar con cuántas oportunidades existen. Es informativo: puedes guardar igualmente porque el mismo contacto puede llegar por otra campaña.',
      'Escribe la Campaña; el Medio se elige del desplegable con los valores del catálogo Medio (Whatsapp, Instagram, Referido, CogniTalking…).',
      'Elige la Gestión Inicial. Con Información el lead entra como contacto nuevo, sin cita.',
      'Al elegir Agendado o AGENDADO DATADURA aparece el bloque de cita: la Fecha y hora es obligatoria y la cita se crea junto al lead en la misma operación. Si algo falla, no se guarda ni el lead ni la cita.',
      'En ese bloque eliges la sede de la cita (Doral o Weston) y puedes añadir, si los tienes, el nombre del estudiante, un correo de contacto y su edad: los tres últimos son opcionales y también se pueden corregir después.',
      'Como administrador puedes elegir el asesor de la cita; como agente se asigna automáticamente tu nombre de agente.',
      'Añade Ciudad / Zona y Observaciones Iniciales si ayudan al seguimiento y pulsa "Guardar en Supabase".'
    ],
    notes: [
      'Guardar el lead ya cuenta como trabajo del día: aparece en Creados hoy y en Gestionados hoy del Reporte Diario, aunque la Fecha de llegada sea de ayer.',
      'Los leads del mes de su Fecha de llegada muestran una etiqueta verde "Nuevo" junto al nombre; desaparece sola al cambiar de mes.',
      'No se crea ninguna cita si la gestión no es Agendado o AGENDADO DATADURA: en ese caso el bloque de cita no se muestra.',
      'El Mes es el mes de llegada del lead y no cambia aunque la cita sea de otro mes.',
      'La campaña con la que llegó el lead no se modifica al cambiar la sede de la cita: un contacto puede llegar por una campaña de Weston y ser agendado en Doral.'
    ]
  },
  {
    id: 'ayuda-gestionar-lead',
    icon: 'clipboard-check',
    title: 'Gestionar un lead existente',
    summary: 'Cambiar la gestión comercial conservando el historial y las citas.',
    steps: [
      'Abre la ficha del lead y pulsa "Editar este Lead", o ve a la pestaña Leads y pulsa el lápiz de edición de la fila. En Inicio, el bloque Acceso rápido a leads lleva a esa misma pestaña.',
      'En "Actualizar Seguimiento" elige el nuevo Estatus de Gestión y pulsa "Actualizar en Supabase".',
      'De Información a Agendado: elige Agendado, rellena la Fecha y hora de la cita y guarda. El lead y su cita se escriben en la misma operación.',
      'Verifica la cita recién creada en el bloque Citas de la ficha y comprueba que en Historial de Gestiones aparece "Información → Agendado", con su fecha, su canal y su asesor.',
      'De Agendado a Inscrito: elige INSCRITO y guarda. La cita ya creada no se borra y sigue visible en la ficha.',
      'De Agendado a AGENDADO DATADURA: elige esa gestión y guarda; el lead pasa a Data Dura y conserva su Mes de origen.',
      'De Agendado a Información: al guardar, la cita se conserva y sigue apareciendo en el historial del lead.',
      'El campo Teléfono / WhatsApp es editable: si lo corriges, el número se revalida (7 a 15 dígitos) y la coincidencia con otros leads se recalcula.',
      'En "Tipo de Última Gestión" eliges cómo se gestionó el contacto: Llamada, Llamada Data Dura, WhatsApp, Llamada WhatsApp, Instagram o Visita Conservatorio. Esa elección decide cómo suma en el Reporte Diario.'
    ],
    notes: [
      'Si el lead ya estaba agendado, el modal avisa y las citas adicionales se gestionan desde la ficha, no desde el formulario de edición.',
      'Historial de Gestiones es un registro que solo añade: ninguna línea anterior se borra ni se reescribe.',
      'Solo el administrador puede modificar los datos principales del lead (Nombre, Mes, Fecha, Campaña, Medio, Ciudad, Agente, Odoo, Landing).',
      'En la ficha, el botón "Editar datos" de una cita permite corregir o borrar el nombre del estudiante, el correo y la edad sin tocar la fecha ni el estado.'
    ]
  },
  {
    id: 'ayuda-citas',
    icon: 'calendar-days',
    title: 'Citas',
    summary: 'Crear, marcar el resultado y reprogramar citas de un lead agendado.',
    steps: [
      'La pestaña Citas abre en vista Semana con el calendario del equipo; con la barra superior cambias a Lista (tabla con los datos de cada visita), Día o Mes. Mes sirve para ver la carga de cada día.',
      'Solo un lead con gestión Agendado o AGENDADO DATADURA puede tener citas. Con cualquier otra gestión el formulario aparece oculto y el servidor también lo rechaza.',
      'Todas las asesoras ven el calendario completo de citas del equipo: sirve para saber quién atiende a quién. Lo que cambia por asesora es la gestión.',
      'Solo la asesora asignada a la cita (o un administrador) puede modificarla: el resto ve la información en solo lectura, sin botones de edición.',
      'Todas las horas de citas se escriben y se muestran en la zona horaria de Miami (Doral/Weston), aunque la asesora esté en otro país.',
      'En la ficha del lead, sección Citas, elige Fecha y hora, añade una nota opcional, el nombre del estudiante, un correo de contacto y su edad, la sede (Doral o Weston) y, si eres administrador, el asesor. Pulsa "Crear cita" y confirma los datos en el aviso antes de guardarla.',
      'Marca el resultado con los botones "Asistió", "No asistió" y "Cancelada". Cada cambio queda registrado en el historial de la cita.',
      'Para reprogramar, escribe la nueva Fecha y hora y pulsa "Reprogramar": la cita anterior queda como REPROGRAMADA y se crea una cita nueva enlazada a ella, sin sobrescribirla. La nueva cita conserva la marca Data Dura y los datos del estudiante.',
      'Un lead puede tener varias citas, cada una con su propio estado; todas se listan ordenadas en la ficha.',
      'Al cambiar la gestión del lead, las citas ya creadas se conservan aunque el lead deje de estar agendado.'
    ],
    notes: [
      'No se crea ninguna cita al lead si su gestión no es Agendado o AGENDADO DATADURA.',
      'Los estados posibles de una cita son PROGRAMADA, ASISTIO, NO_ASISTIO, CANCELADA y REPROGRAMADA.',
      'El resultado se puede marcar solo mientras la cita está PROGRAMADA.',
      'La sede se eligió al crear la cita; para corregirla después usa el botón "Sede" (asesor asignado o admin) sin tocar el estado ni la fecha.',
      'Si el lead ya estaba agendado, el formulario Actualizar Seguimiento también muestra la sede de su cita vigente: puedes elegir Doral o Weston allí sin crear una cita nueva.',
      'Nombre del estudiante, correo de contacto y edad son opcionales: si no los tienes al agendar, el botón "Editar datos" los completa más tarde.',
      'La tabla de la pestaña Citas no muestra la columna Medio para dejar espacio a Estudiante, Correo, Edad y Sede, pero los filtros por Medio y Sede siguen disponibles.',
      'Las citas creadas antes de que existiera la sede aparecen como "Sin sede"; no se asignó una sede retroactiva para no inventar información.',
      'El Reporte Diario separa las citas creadas por sede (Doral / Weston, normales y Data Dura). Cuenta el día en que se creó cada cita, aunque la visita sea otro día.'
    ]
  },
  {
    id: 'ayuda-reporte-diario',
    icon: 'calendar-range',
    title: 'Reporte diario',
    summary: 'Hoja de trabajo del día con un bloque por asesora, datos automáticos y notas guardadas.',
    steps: [
      'Abre la pestaña Reporte de la barra superior.',
      'Elige la Fecha del reporte: se muestra un bloque por cada asesora del día, con su total gestionados.',
      'Los bloques por canal real de cada gestión y los indicadores de citas creadas, resultados registrados e inscritos se rellenan solos.',
      'Registrar un lead también cuenta como gestión: cada alta manual suma una vez en Leads gestionados del día en que la creaste.',
      'En cada bloque, Problemas o bloqueos y Observaciones adicionales se guardan por asesora y fecha (zona horaria de Miami) con los botones Guardar y Eliminar.',
      'Como agente solo puedes editar tu propio bloque del día actual; en fechas anteriores tu vista es de solo lectura.',
      'Como administrador puedes editar y borrar cualquier bloque en cualquier fecha.',
      'Pulsa "Descargar CSV" para exportar el día: resumen por asesora, total y comentarios.'
    ],
    notes: [
      'Citas nuevas cuenta la fecha de creación en Miami y excluye las creadas por reprogramación; estas se muestran por separado. El calendario muestra la fecha de la visita.',
      'El agendamiento se atribuye a quien creó la cita; la asesora asignada para atenderla aparece en el calendario.',
      'Citas reprogramadas hoy cuenta las nuevas fechas registradas hoy; Reprogramadas indica cuándo se marcó la cita anterior con ese resultado. Visitas, No asistieron y Canceladas cuentan el día en que se registró el resultado.',
      'Llamada WhatsApp cuenta una sola vez, dentro del total de llamadas, y es una categoría distinta de Llamada.',
      'Los Inscritos Data Dura son los leads inscritos cuyo Mes de origen es distinto del mes actual.',
      'Al guardar en un bloque ajeno, administración escribe en nombre de la asesora y el bloque sigue siendo de ella.'
    ]
  },
  {
    id: 'ayuda-filtros-reportes',
    icon: 'filter',
    title: 'Filtros y reportes',
    summary: 'Panel Citas, tasa de asistencia y datos históricos de 2025.',
    steps: [
      'En la pestaña Citas, el rango Desde / Hasta filtra por la fecha de la cita, no por el mes del lead.',
      'Filtra por Resultado, Campaña y Medio. El filtro Asesor aparece para administradores y supervisores.',
      'Arriba se ven cuatro indicadores: Total citas, Programadas, Asistieron y Tasa asistencia. Se recalculan con los filtros aplicados; la tasa divide Asistieron entre Asistieron + No asistieron.',
      'Abre "Ver desglose por estado y sede" debajo de la tabla para ver los ocho indicadores restantes: No asistieron, Canceladas, Reprogramadas, Doral, Doral Data Dura, Weston, Weston Data Dura y Sin sede (históricas).',
      'La columna Mes origen muestra el mes del lead, mientras que la cita se cuenta por su propia fecha: una cita de septiembre de un lead de agosto cuenta en septiembre.',
      'Todas las asesoras ven las citas de todo el equipo; la columna Asesor permite saber a quién pertenece cada una.',
      'Los datos históricos de 2025 son de solo lectura: se consultan en Gráficos Históricos y en la ficha, pero no se editan.'
    ],
    notes: [
      'Si un rango es inválido, los resultados y las métricas se vacían para no mostrar datos de otra fecha.',
      'La tabla incluye un enlace "Ver ficha" para abrir el lead de cada cita.'
    ]
  },
  {
    id: 'ayuda-catalogos',
    icon: 'list-checks',
    title: 'Catálogos',
    summary: 'Valores de Mes, Campaña, Medio, Gestión y Agente que alimentan formularios y filtros.',
    steps: [
      'Solo el administrador ve el botón Catálogos en la cabecera.',
      'Elige el tipo de catálogo (Mes, Campaña, Medio, Gestión o Agente), escribe el valor y pulsa Añadir.',
      'Con el lápiz renombras un valor: el nuevo texto se usará en formularios y filtros.',
      'Con la X desactivas un valor: deja de ofrecerse en formularios y filtros, y se puede reactivar con el icono de check.',
      'Desactivar o renombrar un valor no modifica los leads ya guardados: siguen mostrando el texto con el que se crearon.',
      'Un catálogo no es una cuenta de usuario. Para dar de alta o desactivar a una persona que entra al sistema usa el botón Usuarios.'
    ],
    notes: [
      'Si un catálogo está vacío, los filtros usan directamente los valores presentes en los datos.'
    ]
  },
  {
    id: 'ayuda-data-dura',
    icon: 'graduation-cap',
    title: 'Estados Data Dura',
    summary: 'Como se contabilizan INSCRITO DATADURA y AGENDADO DATADURA.',
    steps: [
      'INSCRITO DATADURA y AGENDADO DATADURA son los estados Data Dura del catálogo Gestión.',
      'Un lead Data Dura conserva su Mes de origen: no se reasigna al mes en el que se cierra la gestión.',
      'Sus citas se reportan por la fecha de la cita, no por el mes de origen del lead.',
      'AGENDADO DATADURA sigue siendo una gestión agendada, así que permite crear y marcar citas con normalidad.',
      'En Reporte diario, los Inscritos Data Dura son los leads con estado INSCRIT* cuyo Mes de origen es distinto del mes actual.',
      'En los filtros, usa el desplegable Gestión y selecciona el valor que contiene DATADURA para quedarte solo con esos leads.'
    ]
  },
  {
    id: 'ayuda-campanas',
    icon: 'megaphone',
    title: 'Campañas',
    summary: 'Resultados por campaña, comparación mensual y exportación a CSV.',
    steps: [
      'Abre la pestaña Campañas para ver el rendimiento de cada campaña con su alcance, gasto y resultados.',
      'Los resultados de Meta (Leads Nuevos, Agendados, Asistieron, Inscritos) se leen de la fuente de la campaña y los contadores del CRM se añaden a la misma fila.',
      'Agendados Meses Ant. son los leads agendados de meses anteriores que todavía no se han inscrito: indica cuántos quedan pendientes de cerrar.',
      'La comparación mensual permite ver los totales por mes y el coste por resultado (gasto dividido entre leads nuevos).',
      'El botón de CSV descarga la tabla actual con los mismos datos que ves en pantalla.',
      'Solo quien tiene permiso de campañas puede editar sus datos; el resto ve la sección en solo lectura.'
    ],
    notes: [
      'Un lead cuenta una sola vez por campaña aunque haya cambiado de gestión varias veces.',
      'Si una campaña todavía no tiene datos, aparece con los contadores en cero para no confundir con un fallo de carga.'
    ]
  },
  {
    id: 'ayuda-seguridad-roles',
    icon: 'shield-check',
    title: 'Seguridad y roles',
    summary: 'Qué puede ver y hacer un administrador y un agente.',
    steps: [
      'El administrador ve todos los leads, puede filtrar por asesor, editar los datos principales, gestionar Catálogos y abrir el botón Usuarios.',
      'Las asesoras ven la información compartida del equipo: los leads del CRM y el calendario completo de citas.',
      'El supervisor es una asesora con permisos ampliados: ve el CRM como el resto y además el filtro Asesor y la edición de Campañas.',
      'El trafficker (campañas) solo entra a la sección Campañas: no ve los leads, las citas ni los reportes.',
      'Lo que sí es individual es la gestión: una asesora solo puede editar datos, marcar resultados o reprogramar las citas que tiene asignadas; las demás las ven en solo lectura.',
      'El filtro Asesor del panel de Citas y del Reporte aparece para administradores y supervisores.',
      'La protección real está en Supabase (RLS y funciones de la base de datos), no solo en la interfaz: ocultar un botón no es la medida de seguridad.',
      'Las cuentas se controlan desde Usuarios: activa, desactiva y asigna el rol de admin, agente, supervisor o trafficker.',
      'Las asesoras ven un aviso a los 4 minutos sin actividad y su sesión se cierra a los 5 minutos; el botón "Continuar sesión" del aviso la mantiene abierta. La actividad se comparte entre las pestañas del mismo equipo, así que trabajar en una mantiene viva la sesión.',
      'En Usuarios, cada asesora tiene su propio control "Cierre automático" en una línea aparte: "Desactivar cierre" quita el cierre por inactividad de esa asesora sin desactivar su cuenta; "Desactivar cuenta" sigue bloqueando el acceso en ambos casos.',
      'Una cuenta desactivada pierde el acceso: la sesión se cierra y la pantalla vuelve al inicio de sesión.',
      'El cierre por inactividad solo aplica a asesoras: administrador, supervisores y trafficker no se desconectan por dejar la pantalla quieta.',
      'El cierre por inactividad afecta solo al equipo donde se quedó inactivo: el móvil y las demás sesiones siguen abiertas.',
      'Los registros históricos de 2025 no admiten cambios desde la aplicación.'
    ]
  }
];

// helpReturnFocus vive en window (no en let local): clearSessionState()
// del monolito lo limpia al cerrar sesion y el modulo lo lee/escribe aqui.

// Buscamos sobre texto sin diacríticos: "catálogo" y "catalogo" (o "gestión" y
// "gestion") deben encontrar exactamente las mismas secciones.
function normalizeHelpText(value) {
  return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Resalta el termino buscado sin romper el escapado ni el texto: se compara
// sobre una copia NFD en minusculas (para que "catalogo" encuentre
// "catálogo", escrito con caracter precompuesto) guardando, para cada
// caracter normalizado, su indice en el texto ORIGINAL. El marcado se arma
// cortando el original: no se alteran los caracteres ni se escapa dos veces.
function helpHighlight(value, term) {
  const chars = [...String(value == null ? '' : value)];
  if (!term) return escapeHtml(chars.join(''));
  const flat = [], indice = [];
  chars.forEach((char, position) => {
    // NFD + sin marcas combinantes: igual que normalizeHelpText, para que el
    // termino ("catalogo") y el texto ("catálogo") comparen por el mismo camino.
    for (const part of char.normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g, '')) { flat.push(part); indice.push(position); }
  });
  const haystack = flat.join('');
  const needle = String(term).normalize('NFD').toLowerCase().replace(/[\u0300-\u036f]/g, '');
  const html = [];
  let cursor = 0;
  if (!needle) return escapeHtml(chars.join(''));
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + Math.max(1, needle.length))) {
    const desde = indice[at], hasta = indice[at + needle.length - 1] + 1;
    html.push(escapeHtml(chars.slice(cursor, desde).join('')));
    html.push(`<mark class="help-hit">${escapeHtml(chars.slice(desde, hasta).join(''))}</mark>`);
    cursor = hasta;
  }
  html.push(escapeHtml(chars.slice(cursor).join('')));
  return html.join('');
}

function focusHelpSection(sectionId) {
  const target = document.getElementById(`helpSection-${sectionId}`);
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}

function scrollHelpToTop() {
  const body = document.getElementById('helpBody');
  if (body) body.scrollTop = 0;
}

// El indice solo muestra las guías visibles con el filtro actual: al buscar,
// salta directamente a lo que coincide en lugar de repetir toda la lista.
function renderHelpIndex(sections) {
  const nav = document.getElementById('helpIndex');
  if (!nav) return;
  nav.innerHTML = sections.length > 1
    ? `<span class="help-index-label">Índice</span>${sections.map(section => `<button type="button" class="help-index-btn" data-ev="click:focusHelpSection('${escapeAttr(section.id)}')">${escapeHtml(section.title)}</button>`).join('')}`
    : '';
}

function renderHelpContent(query) {
  const container = document.getElementById('helpContent');
  if (!container) return;
  const raw = query === undefined ? (document.getElementById('helpSearch')?.value || '') : query;
  const term = normalizeHelpText(raw).trim();
  const visibles = [];
  const html = HELP_SECTIONS.map(section => {
    const title = normalizeHelpText(section.title);
    const summary = normalizeHelpText(section.summary);
    const titleHit = !!term && title.indexOf(term) !== -1;
    // Guardamos el indice original para no renumerar los pasos filtrados.
    const steps = (section.steps || [])
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => !term || titleHit || normalizeHelpText(step).indexOf(term) !== -1);
    const notes = (section.notes || []).filter(note => !term || titleHit || normalizeHelpText(note).indexOf(term) !== -1);
    if (term && !titleHit && !summary.includes(term) && !steps.length && !notes.length) return '';
    visibles.push(section);
    const listHtml = steps.length
      ? `<ol class="space-y-2">${steps.map(({ step, index }) => `<li class="flex gap-2"><span class="help-step-num">${index + 1}</span><span class="help-step-text">${helpHighlight(step, term)}</span></li>`).join('')}</ol>`
      : '<p class="help-note-text">Ningún paso contiene ese término; revisa el resumen de la guía.</p>';
    const notesHtml = notes.length
      ? `<div class="help-notes"><p class="help-block-label">Importante</p><ul class="space-y-1.5">${notes.map(note => `<li class="help-note-text">${helpHighlight(note, term)}</li>`).join('')}</ul></div>`
      : '';
    return `<section id="helpSection-${escapeAttr(section.id)}" tabindex="-1" class="help-card space-y-3 focus:outline-none">
          <header class="help-card-header">
            <span class="help-card-icon" aria-hidden="true"><i data-lucide="${escapeAttr(section.icon || 'book-open')}"></i></span>
            <h4 class="font-bold text-sm">${helpHighlight(section.title, term)}</h4>
          </header>
          <p>${helpHighlight(section.summary, term)}</p>
          <div class="help-block">
            <p class="help-block-label">Cómo hacerlo</p>
            ${listHtml}
          </div>
          ${notesHtml}
        </section>`;
  }).join('');
  container.innerHTML = html || '<div class="help-empty"><p class="text-sm font-semibold">No encontramos resultados para esa búsqueda.</p><p class="mt-1 text-xs">Prueba con otra palabra o vuelve a ver todas las guías.</p><button type="button" data-ev="click:clearHelpSearch()">Ver todas las guías</button></div>';
  renderHelpIndex(visibles);
  const meta = document.getElementById('helpMeta');
  if (meta) meta.textContent = `${HELP_SECTIONS.length} guías`;
  const results = document.getElementById('helpResults');
  if (results) results.textContent = term
    ? `${visibles.length} de ${HELP_SECTIONS.length} guías coinciden con "${raw.trim()}"`
    : `${HELP_SECTIONS.length} guías disponibles · la ayuda funciona sin conexión`;
  if (window.lucide) lucide.createIcons();
}

function clearHelpSearch() {
  const search = document.getElementById('helpSearch');
  if (search) search.value = '';
  renderHelpContent('');
  search?.focus();
}

function openHelpModal(sectionId) {
  const modal = document.getElementById('modalHelp');
  if (!modal) return;
  window.helpReturnFocus = document.activeElement;
  const search = document.getElementById('helpSearch');
  if (search) search.value = '';
  renderHelpContent('');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  const target = HELP_SECTIONS.some(section => section.id === sectionId)
    ? document.getElementById(`helpSection-${sectionId}`)
    : null;
  const body = document.getElementById('helpBody');
  if (body) body.scrollTop = 0;
  if (target) {
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  } else {
    search?.focus();
  }
  if (window.lucide) lucide.createIcons();
}

function closeHelpModal() {
  const modal = document.getElementById('modalHelp');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  const restore = window.helpReturnFocus;
  window.helpReturnFocus = null;
  if (restore && document.contains(restore) && typeof restore.focus === 'function') restore.focus();
}

// Escape cierra y Tab queda atrapado dentro del modal: sin esto el foco se
// escapa al documento por detras del overlay y el teclado pierde el contexto.
if (typeof document !== 'undefined') document.addEventListener('keydown', event => {
  const modal = document.getElementById('modalHelp');
  if (!modal || modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') { closeHelpModal(); return; }
  if (event.key !== 'Tab') return;
  const focusables = [...modal.querySelectorAll('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.getClientRects().length > 0);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  const inside = modal.contains(document.activeElement);
  if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); return; }
  if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
});

// Llamadas inline del monolito (onclick/oninput) resuelven via window, igual
// que el resto de la capa 2 del strangler.
if (typeof window !== 'undefined') {
  window.openHelpModal = openHelpModal;
  window.closeHelpModal = closeHelpModal;
  window.clearHelpSearch = clearHelpSearch;
  window.renderHelpContent = renderHelpContent;
  window.focusHelpSection = focusHelpSection;
  // Fase 15: el boton Volver arriba llama scrollHelpToTop via data-ev;
  // faltaba registrarla y quedaba muerta desde la extraccion a help.js.
  window.scrollHelpToTop = scrollHelpToTop;
}

export { HELP_SECTIONS, normalizeHelpText, helpHighlight, focusHelpSection, scrollHelpToTop, renderHelpIndex, renderHelpContent, clearHelpSearch, openHelpModal, closeHelpModal };

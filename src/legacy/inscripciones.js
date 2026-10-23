/**
 * Inscripciones por programa y nivel: reglas puras, sin DOM ni red.
 *
 * Modelo de datos (ver supabase/migrations/202610200001_lead_program_enrollments.sql):
 * una persona puede estar en Teatro Musical, en Actuacion o en los dos. Un
 * unico nivel vigente por programa. La fecha de inscripcion la declara la
 * asesora y puede quedar vacia (pendiente de completar).
 */
import { csvReporteField, MONTH_CHRONO, periodoValidDate } from './reportes.js';

/** Programas y niveles validos. El id es el valor que viaja al servidor. */
export const PROGRAMAS_INSCRIPCION = [
  { id: 'TEATRO_MUSICAL', label: 'Teatro Musical', marca: 'TM', chip: 'bg-emerald-500/15 text-emerald-300', check: 'accent-emerald-500', activa: 'activa-emerald', tag: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', niveles: ['MT Piojitos', 'MT Teens', 'MT Advance'] },
  { id: 'ACTUACION', label: 'Actuación', marca: 'AC', chip: 'bg-indigo-500/15 text-indigo-300', check: 'accent-indigo-500', activa: 'activa-indigo', tag: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300', niveles: ['Acting Piojitos', 'Acting Teens', 'Acting 101 (Teens)', 'Acting Advance'] },
];

/**
 * Programas (campañas del catálogo) donde el detalle de nivel NO aplica:
 * son de adultos y no tienen niveles que elegir.
 */
export const PROGRAMAS_SIN_DETALLE = ['actuacion adultos', 'taller camara'];

/** Clave de comparación: minúsculas, sin tildes y sin espacios extra. */
const clavePrograma = value => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * ¿El programa de inscripción lleva el detalle de nivel (Teatro Musical /
 * Actuación)? Actuación Adultos y Taller de cámara no lo llevan; sin
 * programa elegido se muestra el detalle (como antes).
 * @param {string|null|undefined} programa
 * @returns {boolean}
 */
export function programaRequiereDetalle(programa) {
  const clave = clavePrograma(programa);
  if (!clave) return true;
  return !PROGRAMAS_SIN_DETALLE.includes(clave);
}

/**
 * Programa por id (para etiquetas y estilos).
 * @param {string|null|undefined} programa
 * @returns {object|null}
 */
export function programaPorId(programa) {
  const id = String(programa || '').trim().toUpperCase();
  return PROGRAMAS_INSCRIPCION.find(p => p.id === id) || null;
}

/**
 * Etiqueta legible de un programa.
 * @param {string|null|undefined} programa
 * @returns {string}
 */
export function programaEtiqueta(programa) {
  const id = String(programa || '').trim().toUpperCase();
  const p = PROGRAMAS_INSCRIPCION.find(x => x.id === id);
  return p ? p.label : String(programa || '');
}

/**
 * ¿El estado de gestion corresponde a una persona inscrita?
 * Vale para INSCRITO e INSCRITO DATADURA (el catalogo lo escribe asi).
 * @param {string|null|undefined} value - Estado de gestion.
 * @returns {boolean}
 */
export function esInscritoGestion(value) {
  return String(value || '').trim().toUpperCase().startsWith('INSCRIT');
}

/** Mes/anio explicitos -> limites inclusivos, sin depender de la zona del navegador. */
export function inscripcionMesRange(mes, anio) {
  const indice = MONTH_CHRONO.indexOf(String(mes || '').trim().toUpperCase());
  const year = String(anio || '').trim();
  if (indice < 0 || !/^\d{4}$/.test(year) || Number(year) < 1900) throw new Error('Elige un mes y año de inscripción válidos.');
  const dias = new Date(Date.UTC(Number(year), indice + 1, 0)).getUTCDate();
  const base = `${year}-${String(indice + 1).padStart(2, '0')}`;
  return [`${base}-01`, `${base}-${dias}`];
}

/** Clase legible de una inscripcion segun la regla de fechas. */
export function claseInscripcionEtiqueta(clase) {
  const valor = String(clase || '').trim().toUpperCase();
  if (valor === 'NORMAL') return 'Inscrito';
  if (valor === 'DATA_DURA') return 'Inscrito Data Dura';
  if (valor === 'PENDIENTE') return 'Sin clase (falta fecha de ingreso válida)';
  if (valor === 'INCONSISTENTE') return 'Sin clase (ingreso posterior a la inscripción)';
  return 'Sin clase';
}

/** Valida el agregado historico; no confunde personas con programas o eventos. */
export function validateInscritosHistorial(data, desde, hasta) {
  const count = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
  const fail = () => { throw new Error('El conteo de inscritos del historial es inválido. Actualiza e inténtalo nuevamente.'); };
  if (!data || !periodoValidDate(desde) || !periodoValidDate(hasta) || desde > hasta
      || data.desde !== desde || data.hasta !== hasta
      || !['personas_inscritas', 'normales', 'data_dura', 'revision', 'pendientes_fecha'].every(k => count(data[k]))
      || data.normales + data.data_dura + data.revision !== data.personas_inscritas
      || !Array.isArray(data.por_campana)
      || data.por_campana.some(r => !r || typeof r.campana !== 'string' || !count(r.personas) || !count(r.normales) || !count(r.data_dura) || !count(r.revision) || r.normales + r.data_dura + r.revision !== r.personas)
      || data.por_campana.reduce((total, r) => total + r.personas, 0) !== data.personas_inscritas
      || data.por_campana.reduce((total, r) => total + r.normales, 0) !== data.normales
      || data.por_campana.reduce((total, r) => total + r.data_dura, 0) !== data.data_dura
      || data.por_campana.reduce((total, r) => total + r.revision, 0) !== data.revision) {
    fail();
  }
  return data;
}

/** Detalle y resumen deben representar las mismas personas y clases del rango. */
export function validateInscritosDetalle(filas, resumen) {
  const fail = () => { throw new Error('El conteo cambió o el detalle es inválido. Actualiza el reporte antes de continuar.'); };
  if (!Array.isArray(filas) || filas.length !== resumen.personas_inscritas) fail();
  const ids = new Set(), clases = { NORMAL: 0, DATA_DURA: 0, PENDIENTE: 0, INCONSISTENTE: 0 };
  for (const f of filas) {
    if (!f || !/^\d+$/.test(String(f.id ?? '')) || ids.has(String(f.id))
        || !periodoValidDate(f.fecha_inscripcion) || f.fecha_inscripcion < resumen.desde || f.fecha_inscripcion > resumen.hasta
        || !Object.hasOwn(clases, f.clase)) fail();
    ids.add(String(f.id));
    clases[f.clase]++;
  }
  if (clases.NORMAL !== resumen.normales || clases.DATA_DURA !== resumen.data_dura
      || clases.PENDIENTE + clases.INCONSISTENTE !== resumen.revision) fail();
  return filas;
}

/** Detalle historico: una persona por rango, con el mismo evento del contador. */
export function inscritosHistorialCsvLines(filas, desde, hasta, generado) {
  const lines = [], row = values => lines.push(values.map(csvReporteField).join(','));
  row(['Personas inscritas según historial']);
  row(['Desde (inclusive)', desde, 'Hasta (inclusive)', hasta]);
  row(['Generado (Miami)', generado]);
  row(['Una persona por rango; última entrada registrada dentro del rango. Una baja posterior no elimina su inscripción.']);
  row(['Inscrito ingresó en el mismo mes de su inscripción; Inscrito Data Dura ingresó en un mes anterior.']);
  row(['ID', 'Nombre', 'Teléfono', 'Fecha de inscripción', 'Clase', 'Estado al inscribirse', 'Campaña', 'Programa actual', 'Estado actual']);
  for (const f of filas || []) row([f.id, f.nombre || '', f.telefono ? "'" + f.telefono : '', f.fecha_inscripcion, claseInscripcionEtiqueta(f.clase), f.estado_inscripcion, f.campana || 'Sin campaña', f.programa || '', f.estado_actual || '']);
  return lines;
}

/**
 * Niveles de un programa (copia defensiva).
 * @param {string|null|undefined} programa - Id del programa.
 * @returns {string[]} Niveles; vacio si el programa no existe.
 */
export function nivelesDePrograma(programa) {
  const id = String(programa || '').trim().toUpperCase();
  const p = PROGRAMAS_INSCRIPCION.find(x => x.id === id);
  return p ? [...p.niveles] : [];
}

/**
 * Normaliza una fecha de inscripcion: '' -> null (pendiente), 'YYYY-MM-DD'
 * valida. No inventa ni corrige fechas.
 * @param {string|null|undefined} value
 * @returns {{ok: boolean, fecha: string|null, error: string}}
 */
export function normalizaFechaInscripcion(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, fecha: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, fecha: null, error: 'fecha_invalida' };
  const [y, m, d] = raw.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  if (fecha.getUTCFullYear() !== y || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) {
    return { ok: false, fecha: null, error: 'fecha_invalida' };
  }
  return { ok: true, fecha: raw };
}

/**
 * Valida la seleccion de programas del formulario y arma el payload de la RPC.
 * Cada item: {programa, nivel, fecha_inscripcion}. Un programa repetido o un
 * nivel que no corresponde a su programa invalidan la operacion.
 * @param {Array<{programa?: string, nivel?: string, fecha_inscripcion?: string}>} seleccion
 * @returns {{ok: boolean, payload: Array<object>, error: string}}
 */
export function inscripcionPayload(seleccion) {
  const items = (seleccion || []).filter(s => s && String(s.programa || '').trim());
  const payload = [];
  const vistos = new Set();
  for (const item of items) {
    const programa = String(item.programa || '').trim().toUpperCase();
    if (!nivelesDePrograma(programa).length) return { ok: false, payload: [], error: 'programa_invalido' };
    if (vistos.has(programa)) return { ok: false, payload: [], error: 'programa_duplicado' };
    vistos.add(programa);
    const nivel = String(item.nivel || '').trim();
    if (!nivelesDePrograma(programa).includes(nivel)) return { ok: false, payload: [], error: 'nivel_invalido' };
    const fecha = normalizaFechaInscripcion(item.fecha_inscripcion);
    if (!fecha.ok) return { ok: false, payload: [], error: fecha.error };
    payload.push({ programa, nivel, fecha_inscripcion: fecha.fecha });
  }
  return { ok: true, payload, error: '' };
}

/**
 * Filas de la base (activas) -> seleccion del formulario.
 * @param {Array<object>} filas - Filas de lead_program_enrollments.
 * @returns {Array<{programa: string, nivel: string, fecha_inscripcion: string}>}
 */
export function inscripcionDesdeFilas(filas) {
  return (filas || [])
    .filter(f => f && f.activa !== false)
    .map(f => ({
      programa: String(f.programa || '').trim().toUpperCase(),
      nivel: String(f.nivel || '').trim(),
      fecha_inscripcion: f.fecha_inscripcion ? String(f.fecha_inscripcion).slice(0, 10) : '',
    }))
    .filter(f => f.programa && f.nivel);
}

/**
 * Hay inscripciones sin fecha (pendientes de completar).
 * @param {Array<object>} filas
 * @returns {boolean}
 */
export function inscripcionTienePendientes(filas) {
  return (filas || []).some(f => f && f.activa !== false && !f.fecha_inscripcion);
}

/**
 * Valida el reporte de inscripciones (RPC lead_enrollments_report): rango
 * coherente, conteos enteros no negativos y desgloses con formaKnown.
 * @param {object} data
 * @param {string} desde
 * @param {string} hasta
 * @returns {object} El mismo data si es valido.
 */
export function validateInscripcionesReport(data, desde, hasta) {
  const fail = () => { throw new Error('El reporte de inscripciones devolvió una respuesta inválida. Actualiza e inténtalo nuevamente.'); };
  const count = n => Number.isSafeInteger(Number(n)) && Number(n) >= 0;
  if (!data || data.desde !== desde || data.hasta !== hasta) fail();
  for (const key of ['personas_inscritas', 'inscripciones', 'pendientes_fecha', 'altas_periodo', 'bajas_periodo', 'cambios_nivel_periodo']) {
    if (!count(data[key])) fail();
  }
  for (const key of ['por_programa_nivel', 'por_mes']) {
    if (!Array.isArray(data[key])) fail();
    if (data[key].some(r => !r || !count(r.personas))) fail();
  }
  if (Number(data.inscripciones) < Number(data.personas_inscritas)) fail();
  return data;
}

/**
 * Lineas CSV de las inscripciones (una fila por inscripcion vigente).
 * @param {Array<object>} filas - Filas de lead_enrollments_detail.
 * @param {string} generado - Fecha Miami del momento.
 * @returns {string[]} Lineas de texto (unir con \\n para downloadCSV).
 */
export function inscripcionesCsvLines(filas, generado) {
  const lines = [], row = values => lines.push(values.map(csvReporteField).join(','));
  row(['Inscripciones por programa y nivel']);
  row(['Generado (Miami)', generado]);
  row([]);
  row(['Nombre', 'Teléfono', 'Programa', 'Nivel', 'Fecha de inscripción', 'Estado de la fecha', 'Registrado por']);
  for (const f of filas || []) {
    const fecha = f?.fecha_inscripcion ? String(f.fecha_inscripcion).slice(0, 10) : '';
    row([
      f?.nombre || '',
      // Prefijo apostrofe: Excel conserva el telefono como texto.
      f?.telefono ? "'" + f.telefono : '',
      programaEtiqueta(f?.programa),
      f?.nivel || '',
      fecha,
      fecha ? 'En periodo' : 'Pendiente de completar',
      f?.registrado_por || '',
    ]);
  }
  return lines;
}

if (typeof window !== 'undefined') {
  window.PROGRAMAS_INSCRIPCION = PROGRAMAS_INSCRIPCION;
  window.programaPorId = programaPorId;
  window.programaEtiqueta = programaEtiqueta;
  window.esInscritoGestion = esInscritoGestion;
  window.inscripcionMesRange = inscripcionMesRange;
  window.validateInscritosHistorial = validateInscritosHistorial;
  window.validateInscritosDetalle = validateInscritosDetalle;
  window.claseInscripcionEtiqueta = claseInscripcionEtiqueta;
  window.inscritosHistorialCsvLines = inscritosHistorialCsvLines;
  window.nivelesDePrograma = nivelesDePrograma;
  window.normalizaFechaInscripcion = normalizaFechaInscripcion;
  window.inscripcionPayload = inscripcionPayload;
  window.inscripcionDesdeFilas = inscripcionDesdeFilas;
  window.inscripcionTienePendientes = inscripcionTienePendientes;
  window.validateInscripcionesReport = validateInscripcionesReport;
  window.inscripcionesCsvLines = inscripcionesCsvLines;
  window.PROGRAMAS_SIN_DETALLE = PROGRAMAS_SIN_DETALLE;
  window.programaRequiereDetalle = programaRequiereDetalle;
}

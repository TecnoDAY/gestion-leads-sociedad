/**
 * Inscripciones por programa y nivel: reglas puras, sin DOM ni red.
 *
 * Modelo de datos (ver supabase/migrations/202610200001_lead_program_enrollments.sql):
 * una persona puede estar en Teatro Musical, en Actuacion o en los dos. Un
 * unico nivel vigente por programa. La fecha de inscripcion la declara la
 * asesora y puede quedar vacia (pendiente de completar).
 */
import { csvReporteField } from './reportes.js';

/** Programas y niveles validos. El id es el valor que viaja al servidor. */
export const PROGRAMAS_INSCRIPCION = [
  { id: 'TEATRO_MUSICAL', label: 'Teatro Musical', niveles: ['MT Piojitos', 'MT Teens', 'MT Advance'] },
  { id: 'ACTUACION', label: 'Actuación', niveles: ['Acting Piojitos', 'Acting Teens', 'Acting 101 (Teens)', 'Acting Advance'] },
];

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
  window.programaEtiqueta = programaEtiqueta;
  window.esInscritoGestion = esInscritoGestion;
  window.nivelesDePrograma = nivelesDePrograma;
  window.normalizaFechaInscripcion = normalizaFechaInscripcion;
  window.inscripcionPayload = inscripcionPayload;
  window.inscripcionDesdeFilas = inscripcionDesdeFilas;
  window.inscripcionTienePendientes = inscripcionTienePendientes;
  window.validateInscripcionesReport = validateInscripcionesReport;
  window.inscripcionesCsvLines = inscripcionesCsvLines;
}

/** Calculos del catalogo, sin DOM ni estado de sesion. */
import { sortAlphaEs, getField, catalogLabel } from './helpers.js';
import { sortMonthCatalog } from './leads.js';

export function activeCatalogValues(rows, kind) {
  return (rows[kind] || []).filter(row => row.active).map(row => row.value);
}

/**
 * Ventana móvil de 12 meses para el filtro Mes: 9 anteriores, el actual y
 * 2 posteriores. El año se escribe solo al cambiar de año dentro de la lista.
 * @param {string} today - Fecha base YYYY-MM-DD.
 * @param {Array<string>} [dataValues] - Valores presentes en los datos.
 * @returns {Array<string>}
 */
export function mesesVentanaActual(today, dataValues = []) {
  const [y, m] = String(today).split('-').map(Number);
  const out = []; let prev = null;
  for (let i = -9; i <= 2; i++) {
    const d = new Date(Date.UTC(y, (m - 1) + i, 1));
    const year = d.getUTCFullYear();
    const name = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'][d.getUTCMonth()];
    out.push(prev !== null && year !== prev ? `${name} ${year}` : name);
    prev = year;
  }
  if (dataValues.some(v => String(v ?? '').trim().toUpperCase() === 'OTRO')) out.push('OTRO');
  return [...new Set(out)];
}

export function catalogOptions(rows, kind, dataValues) {
  const known = new Set((rows[kind] || []).map(row => row.value));
  // Las entradas repetidas de varios leads/citas no crean opciones nuevas.
  const extra = (dataValues || []).filter(value => !known.has(value));
  const all = [...new Set([...activeCatalogValues(rows, kind), ...extra])];
  return kind === 'mes' ? sortMonthCatalog(all) : sortAlphaEs(all);
}

/**
 * Programas que se pueden elegir (interesado en, programa de inscripcion):
 * campanas ACTIVAS del catalogo. 'Sin definir' es el marcador de la campana de
 * origen, no un programa: queda fuera de las opciones.
 * @param {{campana?: Array<{value?: string, active?: boolean}>}|null|undefined} rows
 * @returns {string[]}
 */
export function programasDisponibles(rows) {
  const clave = value => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const campanas = (rows && rows.campana) || [];
  const valores = campanas
    .filter(row => row && row.active)
    .map(row => String(row.value ?? '').trim())
    .filter(Boolean)
    .filter(value => clave(value) !== 'sin definir');
  return [...new Set(valores)].sort(sortAlphaEs);
}

/**
 * Valores unicos de un campo en los leads (era el closure getUniqueValues de
 * populateFilterOptions): recorta, descarta vacios y 'SN' exactos, deduplica
 * y ordena con Array.from(set).sort() del monolito. El golden de HEAD muestra
 * que los empates de sortAlphaEs despues dependen de este orden de entrada
 * ('alvaro' antes que 'Álvaro', 'Ana' antes que 'ana'), asi que se conserva
 * el sort por defecto (codigo UTF-16) y no se sustituye por sortAlphaEs.
 * @param {Array<object>|null|undefined} leads - Leads visibles por parametro.
 * @param {string} key - Campo tal cual lo usa getField ('Agente ' incluido).
 * @returns {Array<string>}
 */
export function uniqueFieldValues(leads, key) {
  const set = new Set();
  (leads || []).forEach(item => {
    const val = getField(item, key).trim();
    if (val && val !== 'SN') set.add(val);
  });
  return Array.from(set).sort();
}

/**
 * Declaracion de los cinco filtros de la tabla (literales exactos del
 * monolito): id del <select>, kind del catalogo y campo del lead. Ojo:
 * 'Campaña' y 'Agente ' con espacio final conservan el literal original.
 */
export const FILTROS_CATALOGO = [
  { id: 'filterMes', kind: 'mes', campo: 'Mes' },
  { id: 'filterCampana', kind: 'campana', campo: 'Campaña' },
  { id: 'filterMedio', kind: 'medio', campo: 'Medio' },
  { id: 'filterGestion', kind: 'gestion', campo: 'GESTION' },
  { id: 'filterAsesora', kind: 'agente', campo: 'Agente ' },
];

/**
 * Opciones de populateSelect como datos (era innerText + selected inline):
 * etiqueta via catalogLabel y seleccion por coincidencia EXACTA con
 * currentValue, sin canonicalizar.
 * @param {Array<string>|null|undefined} values
 * @param {string} currentValue - select.value leido antes de limpiar el DOM.
 * @returns {Array<{value: string, label: string, selected: boolean}>}
 */
export function opcionesSelectData(values, currentValue) {
  return (values || []).map(v => ({ value: v, label: catalogLabel(v), selected: v === currentValue }));
}

/**
 * Opciones de fillSelectFromCatalog como datos: la clave canonicalizada
 * String(v == null ? '' : v).trim().toLocaleLowerCase('es') unifica formas
 * ('SEPTIEMBRE' vs 'Septiembre') y la seleccion recae en la primera forma
 * canonica del catalogo; sin canonico, currentValue se anade al final.
 * Contrato 'no tocar': el guard `!values.length` vive en el wrapper (igual
 * que en HEAD, junto al guard del select ausente), asi que aqui values se
 * asume no vacio; con values vacio el resultado seria engañoso.
 * @param {Array<string>} values
 * @param {string} currentValue - select.value leido antes de limpiar el DOM.
 * @returns {Array<{value: string, label: string, selected: boolean}>}
 */
export function opcionesCatalogoData(values, currentValue) {
  const key = v => String(v == null ? '' : v).trim().toLocaleLowerCase('es');
  const canonical = currentValue ? values.find(v => key(v) === key(currentValue)) : undefined;
  const selectedValue = canonical !== undefined ? canonical : currentValue;
  const all = currentValue && canonical === undefined ? [...values, currentValue] : values;
  return all.map(v => ({ value: v, label: catalogLabel(v), selected: v === selectedValue }));
}

if (typeof window !== 'undefined') window.catalogosApi = { activeCatalogValues, catalogOptions, uniqueFieldValues, FILTROS_CATALOGO, opcionesSelectData, opcionesCatalogoData, programasDisponibles, mesesVentanaActual };

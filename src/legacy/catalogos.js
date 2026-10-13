/** Calculos del catalogo, sin DOM ni estado de sesion. */
import { sortAlphaEs } from './helpers.js';
import { sortMonthCatalog } from './leads.js';

export function activeCatalogValues(rows, kind) {
  return (rows[kind] || []).filter(row => row.active).map(row => row.value);
}

export function catalogOptions(rows, kind, dataValues) {
  const known = new Set((rows[kind] || []).map(row => row.value));
  // Las entradas repetidas de varios leads/citas no crean opciones nuevas.
  const extra = (dataValues || []).filter(value => !known.has(value));
  const all = [...new Set([...activeCatalogValues(rows, kind), ...extra])];
  return kind === 'mes' ? sortMonthCatalog(all) : sortAlphaEs(all);
}

if (typeof window !== 'undefined') window.catalogosApi = { activeCatalogValues, catalogOptions };

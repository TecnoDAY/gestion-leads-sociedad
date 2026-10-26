/**
 * Capa 1 del patron strangler: logica pura compartida extraida del monolito index.html.
 * Estas 8 funciones no tienen dependencias de DOM ni estado global; son candidatas
 * ideales para salir primero porque su extraccion no rompe orden de carga ni
 * comportamiento observable. El script clasico sigue resolviendolas via window.*
 * (registradas al final de este modulo dentro de `if (typeof window !== 'undefined')`).
 */

// --- escapeHtml / escapeAttr -------------------------------------------------
/**
 * Escapa caracteres HTML especiales a entidades.
 * @param {string|null|undefined|number} str - Valor a escapar.
 * @returns {string} String con &, <, >, ", ' reemplazados por sus entidades; '' si falsy.
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Identica a escapeHtml: escapa para uso en atributos HTML.
 * @param {string|null|undefined|number} str - Valor a escapar.
 * @returns {string} String escapado o '' si falsy.
 */
export function escapeAttr(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- getField ----------------------------------------------------------------
/**
 * Helper para acceder a campos de un lead con posibles espacios al final en el nombre de la clave.
 * Intenta: clave exacta, clave sin espacios finales, clave con espacio final, y busqueda case-insensitive.
 * @param {object|null|undefined} lead - Objeto lead (puede ser null/undefined).
 * @param {string} key - Nombre del campo a buscar.
 * @returns {string} Valor como string o '' si no encontrado.
 */
export function getField(lead, key) {
  if (!lead) return "";
  if (lead[key] !== undefined && lead[key] !== null) return String(lead[key]);
  const trimmed = key.trim();
  if (lead[trimmed] !== undefined && lead[trimmed] !== null) return String(lead[trimmed]);
  if (lead[key + " "] !== undefined && lead[key + " "] !== null) return String(lead[key + " "]);
  const normalizedKey = trimmed.toLowerCase();
  const matchingKey = Object.keys(lead).find(candidate => candidate.trim().toLowerCase() === normalizedKey);
  if (matchingKey && lead[matchingKey] !== undefined && lead[matchingKey] !== null) return String(lead[matchingKey]);
  return "";
}

// --- catalogLabel ------------------------------------------------------------
/**
 * Etiqueta visible de una opcion de catalogo (Mes, Campana, Medio, Gestion, Agente):
 * primera letra en mayuscula y resto en minusculas. Es SOLO presentacion; el valor
 * interno (`option.value`) se mantiene crudo, asi que filtros, guardados y catalogos
 * siguen coincidiendo con los datos.
 * @param {string|number|null|undefined} v - Valor bruto.
 * @returns {string} Etiqueta formateada o '' si vacio.
 */
export function catalogLabel(v) {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

// --- compareAlphaEs / sortAlphaEs -------------------------------------------
/**
 * Comparador alfabetico canonico para espanol: ignora mayusculas y acentos (sensitivity: 'base'),
 * y trata numeros como valores numericos ('15' < '20').
 * @param {string|number|null|undefined} a - Primer valor.
 * @param {string|number|null|undefined} b - Segundo valor.
 * @returns {number} -1, 0, 1 segun orden.
 */
export function compareAlphaEs(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { sensitivity: "base", numeric: true });
}

/**
 * Ordena un array usando compareAlphaEs sin mutar el original.
 * @param {Array<string|number>|null|undefined} values - Array a ordenar.
 * @returns {Array<string|number>} Nuevo array ordenado.
 */
export function sortAlphaEs(values) { return [...(values || [])].sort(compareAlphaEs); }

// --- miamiToday / miamiDayBounds --------------------------------------------
/**
 * Devuelve "hoy" en zona horaria America/New_York (Miami) como 'YYYY-MM-DD'.
 * El navegador no decide "hoy", lo hace Intl con la zona del reporte.
 * @returns {string} Fecha en formato YYYY-MM-DD.
 */
export function miamiToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); }

/**
 * Rango [startISO, endISO] del dia Miami de una fecha: inicio = 00:00 Miami,
 * fin = 00:00 Miami del dia siguiente. Sondea offsets -05:00/-04:00 y
 * verifica con Intl la hora Miami de cada instante; [null, null] si ninguna cuadra.
 * @param {string} fecha - Fecha en formato 'YYYY-MM-DD'.
 * @returns {[string|null, string|null]} Tupla [startISO, endISO] en UTC o [null, null] si invalida.
 */
export function miamiDayBounds(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return [null, null];
  const horaMiami = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/New_York" });
  const resolver = (base, hora) => {
    for (const off of ["-05:00", "-04:00"]) {
      const instant = new Date(`${base}T${hora}:00${off}`);
      if (!Number.isNaN(instant.getTime()) && horaMiami.format(instant) === hora) return instant.toISOString();
    }
    return null;
  };
  const [y, m, d] = fecha.split("-").map(Number);
  const startISO = resolver(fecha, "00:00");
  if (!startISO) return [null, null];
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextFecha = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const endISO = resolver(nextFecha, "00:00");
  return endISO ? [startISO, endISO] : [null, null];
}

/**
 * Orden descendente por id de lead (numerico si ambos lo son, textual si no).
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareLeadIdsDescending(a, b) {
  const numericA = Number(a.id);
  const numericB = Number(b.id);
  if (Number.isFinite(numericA) && Number.isFinite(numericB)) return numericB - numericA;
  return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
}

/**
 * Deduplica leads por id (el ultimo registro del mismo id pisa los campos
 * anteriores) y los ordena por id descendente. Lanza si falta el id.
 * @param {Array<object>} leads
 * @returns {Array<object>}
 */
export function consolidateLeadsById(leads) {
  const leadsById = new Map();
  leads.forEach(lead => {
    if (!lead || lead.id === undefined || lead.id === null) {
      throw new Error("Supabase devolvió un lead sin id");
    }
    const key = String(lead.id);
    leadsById.set(key, { ...(leadsById.get(key) || {}), ...lead });
  });
  return Array.from(leadsById.values()).sort(compareLeadIdsDescending);
}

// --- Registro en window para el script clasico (solo en navegador) ----------
if (typeof window !== "undefined") {
  window.escapeHtml = escapeHtml;
  window.escapeAttr = escapeAttr;
  window.getField = getField;
  window.catalogLabel = catalogLabel;
  window.compareAlphaEs = compareAlphaEs;
  window.sortAlphaEs = sortAlphaEs;
  window.miamiToday = miamiToday;
  window.miamiDayBounds = miamiDayBounds;
  window.compareLeadIdsDescending = compareLeadIdsDescending;
  window.consolidateLeadsById = consolidateLeadsById;
  window.diasDesdeUltimaGestion = diasDesdeUltimaGestion;
  window.estadoSeguimiento = estadoSeguimiento;
}

/**
 * Clasifica un seguimiento confirmado segun su fecha respecto a hoy.
 * @param {string|null|undefined} fechaSeguimiento - Fecha YYYY-MM-DD del seguimiento.
 * @param {string} [hoy] - Fecha de referencia YYYY-MM-DD (por defecto hoy Miami).
 * @returns {'vencido'|'hoy'|'futuro'|null} null si no hay fecha valida.
 */
export function estadoSeguimiento(fechaSeguimiento, hoy) {
  const ref = (typeof hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) ? hoy : miamiToday();
  if (!fechaSeguimiento) return null;
  const limpio = String(fechaSeguimiento).trim().split('T')[0].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null;
  if (limpio < ref) return 'vencido';
  if (limpio === ref) return 'hoy';
  return 'futuro';
}

/**
 * Calcula los días transcurridos desde la última gestión de un lead.
 * Acepta fechas en formato DD/MM/YYYY o YYYY-MM-DD (con o sin hora).
 * Devuelve null si no hay fecha válida o si la gestión es futura.
 * @param {object|null|undefined} lead - Objeto lead.
 * @param {string} [hoy] - Fecha de referencia YYYY-MM-DD (por defecto hoy Miami).
 * @returns {number|null} Días de inactividad (0 = hoy) o null.
 */
export function diasDesdeUltimaGestion(lead, hoy) {
  const ref = (typeof hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hoy)) ? hoy : miamiToday();
  const raw = getField(lead, 'Fecha Última Gestión');
  if (!raw) return null;
  const limpio = String(raw).trim().split('T')[0].trim();
  if (!limpio) return null;
  let d;
  if (limpio.includes('/')) {
    const partes = limpio.split('/');
    if (partes.length !== 3) return null;
    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const anio = parseInt(partes[2], 10);
    if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio)) return null;
    d = new Date(anio, mes, dia);
  } else if (limpio.includes('-')) {
    const partes = limpio.split('-');
    if (partes.length !== 3) return null;
    const anio = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const dia = parseInt(partes[2], 10);
    if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio)) return null;
    d = new Date(anio, mes, dia);
  } else {
    d = new Date(limpio);
  }
  if (isNaN(d.getTime())) return null;
  const [y, m, dd] = ref.split('-').map(Number);
  const hoyDate = new Date(y, m - 1, dd);
  const diff = Math.floor((hoyDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return null;
  return diff;
}

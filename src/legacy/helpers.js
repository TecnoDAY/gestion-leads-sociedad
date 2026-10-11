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
}

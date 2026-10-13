// Utilidad de CSP de la fase 15: calcula los hashes SHA-256 de los bloques
// <script>/<style> inline de un HTML final y genera el valor de la politica
// estricta (sin 'unsafe-inline') y el <meta> correspondiente. La usan
// inline-dist.mjs (escritura del artefacto) y los tests de caracterizacion.
// Notas de spec: el hash se calcula sobre el contenido RAW del bloque (en la
// serializacion del documento, sin decodificar entidades) y el meta CSP debe
// aparecer ANTES del primer script inline para cubrirlo.

import { createHash } from 'node:crypto';

const HASH = v => `'sha256-${createHash('sha256').update(v).digest('base64')}'`;

/**
 * Extrae los bloques inline de un HTML final: <script> sin src y <style>.
 * @param {string} html
 * @returns {{scripts: string[], styles: string[]}}
 */
export function bloquesInline(html) {
  const scripts = [], styles = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    scripts.push(m[2]);
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.push(m[1]);
  return { scripts, styles };
}

const CDNS = 'https://cdn.jsdelivr.net https://unpkg.com';
const SUPABASE = 'https://hkkuyomlcqyxtzblowle.supabase.co';

/**
 * Genera el valor de la politicia estricta para un HTML final dado.
 * frame-ancestors NO va en el meta (la spec lo ignora alli): vive en la
 * cabecera HTTP de vercel.json.
 * @returns {string}
 */
export function cspHtml(html) {
  const { scripts, styles } = bloquesInline(html);
  if (!scripts.length || !styles.length) throw new Error('csp: faltan bloques inline que hashear');
  const hashScripts = [...new Set(scripts.map(HASH))].join(' ');
  const hashStyles = [...new Set(styles.map(HASH))].join(' ');
  return `default-src 'self'; script-src 'self' ${CDNS} ${hashScripts}; style-src 'self' ${hashStyles}; img-src 'self' data: ${SUPABASE}; font-src 'self' data:; connect-src 'self' ${SUPABASE} wss://hkkuyomlcqyxtzblowle.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'`;
}

/** Meta CSP completo tal como debe quedar en el artefacto. */
export function metaCsp(html) {
  return `<meta http-equiv="Content-Security-Policy" content="${cspHtml(html)}">`;
}

/**
 * Inserta el meta CSP justo despues de <head> (siempre antes del primer
 * script inline). Idempotente: si ya existe, lo sustituye.
 */
export function insertarMetaCsp(html) {
  const meta = metaCsp(html);
  if (/<meta\s+http-equiv="Content-Security-Policy"/i.test(html)) {
    return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i, meta);
  }
  const m = /<head\b[^>]*>/i.exec(html);
  if (!m) throw new Error('csp: no encuentro <head>');
  return html.slice(0, m.index + m[0].length) + '\n  ' + meta + html.slice(m.index + m[0].length);
}

/**
 * Guardia de un HTML ya llevado al build: el meta existente debe coincidir
 * con la politica recalculada de los bloques actuales (hashes exactos), no
 * debe haber atributos on*= ni 'unsafe-inline'.
 * @returns {string[]} Lista de problemas; vacia si esta limpio.
 */
export function problemasCsp(html) {
  const issues = [];
  if (/\s(?:on(?:click|change|input|submit|focus|blur|pointerenter|pointerleave|pointerdown|keydown))\s*=/i.test(html)) issues.push('atributos on*= presentes (la CSP estricta los bloquea)');
  if (/unsafe-inline/.test(html)) issues.push('unsafe-inline dentro del HTML');
  const esperada = cspHtml(html);
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)">/i.exec(html);
  if (!m) issues.push('meta CSP ausente');
  else if (m[1] !== esperada) {
    if (m[1] === esperada.replace(/'unsafe-inline' /g, '')) issues.push('la meta CSP contiene unsafe-inline');
    else issues.push('la meta CSP no coincide con los bloques inline actuales (hash desincronizado)');
  }
  return issues;
}

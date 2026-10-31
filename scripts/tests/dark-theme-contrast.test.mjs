// Contraste del modo oscuro (specs S1-S2 de odd/tasks/contraste-modo-oscuro.md).
// Lee las reglas reales de src/index.css: el tema oscuro debe declarar colores
// legibles (WCAG AA) y el tema claro no puede quedar reescrito sin su prefijo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
// Los comentarios se quitan antes de separar reglas: si no, quedan pegados al selector.
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
  sel: m[1].replace(/\s+/g, ' ').trim(),
  body: m[2],
}));

/** Declaracion `prop` de la regla cuyo selector termina exactamente en `selector`. */
function darkDecl(selector, prop) {
  const busca = `[data-theme="dark"] ${selector}`;
  let valor = null;
  for (const { sel, body } of rules) {
    if (!sel.includes('[data-theme="dark"]')) continue;
    if (!sel.split(',').some(parte => parte.replace(/\s+/g, ' ').trim() === busca)) continue;
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(body);
    if (m) valor = m[1].trim();
  }
  return valor;
}

const hex = (valor, contexto) => {
  const m = /#([0-9a-fA-F]{6})\b/.exec(valor || '');
  assert.ok(m, `${contexto}: se esperaba un color hex en «${valor}»`);
  return m[1];
};
const luminancia = ([r, g, b]) => {
  const canal = v => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};
const triplete = color => color.match(/../g);
const contraste = (a, b) => {
  const [claro, oscuro] = [luminancia(triplete(a)), luminancia(triplete(b))].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
};
const ratio = (texto, fondo, contexto) => contraste(hex(texto, contexto), hex(fondo, contexto));

const SUPERFICIE = '#1e293b';
const BLANCO = '#ffffff';

test('el fondo de pagina oscuro es oscuro y su texto principal contrasta', () => {
  const fondo = darkDecl('body', 'background-color');
  const texto = darkDecl('body', 'color');
  assert.ok(fondo, 'falta [data-theme="dark"] body con background-color');
  assert.ok(texto, 'falta [data-theme="dark"] body con color');
  assert.ok(ratio(texto, fondo, 'body oscuro') >= 7, 'texto principal del body bajo 7:1');
});

test('texto secundario slate-500..800 legible sobre superficies oscuras', () => {
  for (const utilidad of ['500', '600', '700', '800']) {
    const color = darkDecl(`.text-slate-${utilidad}`, 'color');
    assert.ok(color, `falta la regla oscura para .text-slate-${utilidad}`);
    const r = ratio(color, SUPERFICIE, `text-slate-${utilidad}`);
    assert.ok(r >= 4.5, `.text-slate-${utilidad} con ${color} da ${r.toFixed(2)}:1 (< 4.5)`);
  }
});

test('la seccion de Reportes sigue el tema oscuro en lugar de quedar como bloque blanco', () => {
  const fondo = darkDecl('#reporteDiario', 'background-color');
  assert.ok(fondo, 'falta la superficie oscura de #reporteDiario');
  assert.match(fondo, /!important/, '#reporteDiario necesita !important: la regla base fuerza blanco');
  assert.ok(luminancia(triplete(hex(fondo, '#reporteDiario'))) < 0.06, '#reporteDiario sigue claro');
  const texto = darkDecl('#reporteDiario', 'color');
  assert.ok(texto, 'falta el color de texto oscuro de #reporteDiario');
  assert.ok(ratio(texto, fondo, 'reporte') >= 4.5, '#reporteDiario no alcanza AA');

  const barra = darkDecl('.report-viewbar', 'background-color');
  assert.ok(barra && luminancia(triplete(hex(barra, '.report-viewbar'))) < 0.06, 'el encabezado de Reportes debe ser oscuro');

  const titulo = darkDecl('#reporteDiario .text-indigo-900', 'color');
  assert.ok(titulo, 'faltan los titulos indigo claros del reporte');
  assert.ok(ratio(titulo, fondo, 'titulo reporte') >= 4.5, 'los titulos del reporte no alcanzan AA');
});

test('tarjetas y tablas del reporte usan superficies oscuras legibles', () => {
  const tarjeta = darkDecl('#reporteAuto .daily-metric', 'background-color');
  assert.ok(tarjeta && luminancia(triplete(hex(tarjeta, 'daily-metric'))) < 0.06, '.daily-metric debe ser oscura');
  const detalle = darkDecl('#reporteAuto .daily-detail-card', 'background-color') || darkDecl('#reporteAuto .daily-detail-card', 'background');
  assert.ok(detalle && luminancia(triplete(hex(detalle, 'daily-detail-card'))) < 0.06, '.daily-detail-card debe ser oscura');
  const periodo = darkDecl('#reportePeriodo .period-card', 'background-color');
  assert.ok(periodo && luminancia(triplete(hex(periodo, 'period-card'))) < 0.06, '.period-card debe ser oscura');
  const thFondo = darkDecl('#reportePeriodo .period-table thead th', 'background-color');
  const thTexto = darkDecl('#reportePeriodo .period-table thead th', 'color');
  assert.ok(thFondo && thTexto, 'falta el encabezado oscuro de las tablas del periodo');
  assert.ok(ratio(thTexto, thFondo, 'thead periodo') >= 4.5, 'encabezado de tabla del periodo sin AA');
});

test('tarjeta de Inscritos: fondo oscuro con texto claro (sin texto oscuro sobre verde)', () => {
  const fondo = darkDecl('#reporteAuto .daily-metric:nth-child(6)', 'background-color')
    || darkDecl('#reporteAuto .daily-metric:nth-child(6)', 'background');
  assert.ok(fondo, 'falta el fondo de la tarjeta Inscritos');
  const etiqueta = darkDecl('#reporteAuto .daily-metric:nth-child(6)', 'color');
  assert.ok(etiqueta, 'la tarjeta Inscritos necesita color de etiqueta');
  assert.ok(ratio(etiqueta, fondo, 'tarjeta inscritos') >= 4.5, 'la etiqueta de Inscritos no alcanza AA sobre su fondo');
  const valor = darkDecl('#reporteAuto .daily-metric:nth-child(6) strong', 'color');
  assert.ok(valor && ratio(valor, fondo, 'valor inscritos') >= 4.5, 'el valor de Inscritos no alcanza AA');
});

test('fila de filtros ámbar de Leads: superficie oscura y etiquetas legibles', () => {
  const fondo = darkDecl('.dashboard-filter-extra', 'background-color');
  assert.ok(fondo, 'falta la superficie oscura de .dashboard-filter-extra');
  assert.ok(ratio('#f1f5f9', fondo, 'filtros amber') >= 4.5, 'la superficie ámbar oscura no admite texto claro');
  for (const etiqueta of ['.text-amber-900', '.text-amber-800']) {
    const color = darkDecl(`.dashboard-filter-extra ${etiqueta}`, 'color');
    assert.ok(color, `falta el color oscuro de ${etiqueta} en la fila de filtros`);
    const r = ratio(color, fondo, `filtros amber ${etiqueta}`);
    assert.ok(r >= 4.5, `${etiqueta} en filtros da ${r.toFixed(2)}:1 (< 4.5)`);
  }
});

test('pestañas de Tareas: texto y hover legibles en oscuro', () => {
  const texto = darkDecl('.tasks-scope', 'color');
  assert.ok(texto, 'falta el color oscuro de .tasks-scope');
  assert.ok(ratio(texto, SUPERFICIE, 'tasks-scope') >= 4.5, '.tasks-scope no alcanza AA en oscuro');
  const hover = rules.find(({ sel }) => /\[data-theme="dark"\][^{]*hover\\:bg-\\\[\\#F5D5C5\\\]:hover/.test(sel));
  assert.ok(hover, 'falta el hover oscuro de los botones/pestañas de Tareas');
});

test('calendario de Citas oscuro por variables de FullCalendar', () => {
  for (const variable of ['--fc-page-bg-color', '--fc-neutral-bg-color', '--fc-border-color', '--fc-today-bg-color']) {
    const valor = rules
      .filter(({ sel }) => sel.includes('[data-theme="dark"]'))
      .map(({ body }) => new RegExp(`(?:^|;)\\s*${variable}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim())
      .find(Boolean);
    assert.ok(valor, `falta ${variable} en el tema oscuro`);
  }
});

test('Tablero y tablas: superficies oscuras con texto claro', () => {
  for (const selector of ['.kanban-column', '.kanban-card']) {
    const fondo = darkDecl(selector, 'background-color') || darkDecl(selector, 'background');
    assert.ok(fondo, `falta la superficie oscura de ${selector}`);
    assert.ok(luminancia(triplete(hex(fondo, selector))) < 0.1, `${selector} no es una superficie oscura`);
  }
  const input = darkDecl('.kanban-input', 'color');
  assert.ok(input, 'falta el color oscuro de .kanban-input');
  assert.ok(ratio(input, '#111e32', 'kanban input') >= 4.5, '.kanban-input no alcanza AA');
  const th = darkDecl('th', 'color') || darkDecl('.dashboard-table th', 'color');
  assert.ok(th, 'falta un color de encabezado de tabla para el tema oscuro');
});

test('el tema claro no se reescribe: ninguna regla base nueva para estas utilidades', () => {
  for (const utilidad of ['.text-slate-500', '.text-slate-600', '.text-slate-700', '.text-slate-800']) {
    const base = rules.filter(({ sel, body }) => sel.split(',').some(parte => parte.replace(/\s+/g, ' ').trim() === utilidad)
      && /(?:^|;)\s*color\s*:/.test(body));
    assert.deepEqual(base.map(r => r.sel), [], `${utilidad} no debe declararse sin prefijo de tema`);
  }
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Importar las funciones puras desde el módulo usando import dinámico
const mod = await import('../../src/legacy/helpers.js');

const {
  escapeHtml,
  escapeAttr,
  getField,
  catalogLabel,
  compareAlphaEs,
  sortAlphaEs,
  miamiToday,
  miamiDayBounds,
  diasDesdeUltimaGestion,
  estadoSeguimiento,
} = mod;

describe('legacy helpers - escapeHtml / escapeAttr', () => {
  test('escapeHtml escapa entidades basicas', () => {
    assert.equal(escapeHtml('<div>'), '&lt;div&gt;');
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
    assert.equal(escapeHtml('"quote"'), '&quot;quote&quot;');
    assert.equal(escapeHtml("'single'"), '&#039;single&#039;');
  });

  test('escapeHtml vacio o null devuelve string vacio', () => {
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('escapeHtml numero lo convierte a string (pero 0 es falsy en JS y devuelve vacio)', () => {
    assert.equal(escapeHtml(42), '42');
    // 0 es falsy en JS, la implementación original devuelve '' para 0
    assert.equal(escapeHtml(0), '');
  });

  test('escapeAttr idéntico a escapeHtml', () => {
    const inputs = ['<div>', 'a&b', '"quote"', "'single'", '', null, undefined, 42];
    for (const input of inputs) {
      assert.equal(escapeAttr(input), escapeHtml(input), `escapeAttr !== escapeHtml para ${JSON.stringify(input)}`);
    }
  });
});

describe('legacy helpers - getField', () => {
  test('clave exacta devuelve valor', () => {
    const lead = { Nombre: 'Juan' };
    assert.equal(getField(lead, 'Nombre'), 'Juan');
  });

  test('clave con espacios finales en el objeto (lead["Nombre "])', () => {
    const lead = { 'Nombre ': 'Juan' };
    assert.equal(getField(lead, 'Nombre'), 'Juan');
  });

  test('fallback case-insensitive', () => {
    const lead = { nombre: 'Juan' };
    assert.equal(getField(lead, 'Nombre'), 'Juan');
  });

  test('lead null devuelve string vacio', () => {
    assert.equal(getField(null, 'Nombre'), '');
    assert.equal(getField(undefined, 'Nombre'), '');
  });

  test('clave inexistente devuelve string vacio', () => {
    const lead = { Nombre: 'Juan' };
    assert.equal(getField(lead, 'Apellido'), '');
  });
});

describe('legacy helpers - catalogLabel', () => {
  test('WHATSAPP -> Whatsapp', () => {
    assert.equal(catalogLabel('WHATSAPP'), 'Whatsapp');
  });

  test('WHATSAPP NUEVO -> Whatsapp nuevo', () => {
    assert.equal(catalogLabel('WHATSAPP NUEVO'), 'Whatsapp nuevo');
  });

  test('string vacio devuelve vacio', () => {
    assert.equal(catalogLabel(''), '');
    assert.equal(catalogLabel(null), '');
    assert.equal(catalogLabel(undefined), '');
  });

  test('recorta espacios y normaliza multiples', () => {
    assert.equal(catalogLabel('  WHATSAPP  NUEVO  '), 'Whatsapp nuevo');
  });
});

describe('legacy helpers - compareAlphaEs / sortAlphaEs', () => {
  test('sensibilidad base ignora acentos y mayusculas', () => {
    assert.equal(compareAlphaEs('á', 'a'), 0);
    assert.equal(compareAlphaEs('Á', 'a'), 0);
    assert.equal(compareAlphaEs('z', 'á'), 1); // z > a
  });

  test('orden numerico: 15 < 20', () => {
    assert.equal(compareAlphaEs('15', '20'), -1);
    assert.equal(compareAlphaEs('20', '15'), 1);
    assert.equal(compareAlphaEs('2', '10'), -1); // 2 < 10 numericamente
  });

  test('sortAlphaEs no muta el array original', () => {
    const original = ['z', 'a', 'm'];
    const sorted = sortAlphaEs(original);
    assert.deepEqual(original, ['z', 'a', 'm'], 'original mutado');
    assert.deepEqual(sorted, ['a', 'm', 'z']);
  });

  test('sortAlphaEs maneja null/undefined', () => {
    assert.deepEqual(sortAlphaEs(null), []);
    assert.deepEqual(sortAlphaEs(undefined), []);
    assert.deepEqual(sortAlphaEs([]), []);
  });
});

describe('legacy helpers - miamiToday', () => {
  test('formato YYYY-MM-DD', () => {
    const today = miamiToday();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('legacy helpers - miamiDayBounds', () => {
  test('fecha valida devuelve par no nulo con 24h entre extremos en UTC', () => {
    const [start, end] = miamiDayBounds('2026-07-15');
    assert.ok(start !== null && end !== null, 'start o end es null');
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    assert.equal(endMs - startMs, 24 * 60 * 60 * 1000, 'no son 24h exactas en UTC');
  });

  test('dia del inicio coincide con la fecha pedida (en zona Miami)', () => {
    const [start] = miamiDayBounds('2026-07-15');
    const dayInMiami = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(start));
    assert.equal(dayInMiami, '2026-07-15');
  });

  test('fecha invalida devuelve [null, null]', () => {
    assert.deepEqual(miamiDayBounds('fecha-bad'), [null, null]);
    assert.deepEqual(miamiDayBounds('2026-13-01'), [null, null]);
    assert.deepEqual(miamiDayBounds(''), [null, null]);
    assert.deepEqual(miamiDayBounds(null), [null, null]);
  });
});

describe('diasDesdeUltimaGestion', () => {
  test('sin fecha devuelve null', () => {
    assert.equal(diasDesdeUltimaGestion(null), null);
    assert.equal(diasDesdeUltimaGestion({}), null);
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': '' }), null);
  });
  test('fecha de hoy devuelve 0', () => {
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': '2026-10-23' }, '2026-10-23'), 0);
  });
  test('fecha anterior devuelve dias', () => {
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': '2026-10-20' }, '2026-10-23'), 3);
  });
  test('acepta formato DD/MM/YYYY', () => {
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': '20/10/2026' }, '2026-10-23'), 3);
  });
  test('gestion futura devuelve null', () => {
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': '2026-10-30' }, '2026-10-23'), null);
  });
  test('fecha invalida devuelve null', () => {
    assert.equal(diasDesdeUltimaGestion({ 'Fecha Última Gestión ': 'no-es-fecha' }, '2026-10-23'), null);
  });
});

describe('estadoSeguimiento', () => {
  test('sin fecha devuelve null', () => {
    assert.equal(estadoSeguimiento(null, '2026-10-23'), null);
    assert.equal(estadoSeguimiento('', '2026-10-23'), null);
  });
  test('fecha anterior es vencido', () => {
    assert.equal(estadoSeguimiento('2026-10-20', '2026-10-23'), 'vencido');
  });
  test('fecha igual es hoy', () => {
    assert.equal(estadoSeguimiento('2026-10-23', '2026-10-23'), 'hoy');
  });
  test('fecha posterior es futuro', () => {
    assert.equal(estadoSeguimiento('2026-10-30', '2026-10-23'), 'futuro');
  });
  test('fecha invalida devuelve null', () => {
    assert.equal(estadoSeguimiento('no-es-fecha', '2026-10-23'), null);
  });
});
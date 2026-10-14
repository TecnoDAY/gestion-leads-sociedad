import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helpers puros del area Leads extraidos del monolito (capa 2 del strangler)
const mod = await import('../../src/legacy/leads.js');
const helpersMod = await import('../../src/legacy/helpers.js');
// compareLeadIdsDescending vive ahora en helpers.js (base generica de ids)
const { sortMonthCatalog, normalizePhone, isNuevoEsteMes, nuevoBadge, formatPhone,
  withOrigin, getLeadOrigin, haveSameLeadIds, isAgendadoGestion } = mod;
const { compareLeadIdsDescending } = helpersMod;

describe('leads - sortMonthCatalog', () => {
  test('orden cronologico con OTRO al final y dedupe por norma (valor original preservado)', () => {
    const out = sortMonthCatalog(['MARZO', 'enero', '  OTRO ', 'MARZO', 'ABRIL', 'RARO']);
    // La funcion canonica agrupa por norma pero emite el PRIMER valor original:
    // 'enero' norma ENERO entra en la posicion cronologica sin renombrarse.
    assert.deepEqual(out, ['enero', 'MARZO', 'ABRIL', 'RARO', '  OTRO ']);
  });

  test('no muta la entrada', () => {
    const input = ['MARZO', 'ENERO'];
    sortMonthCatalog(input);
    assert.deepEqual(input, ['MARZO', 'ENERO']);
  });

  test('entrada vacia devuelve vacia', () => {
    assert.deepEqual(sortMonthCatalog([]), []);
    assert.deepEqual(sortMonthCatalog(null), []);
  });
});

describe('leads - telefonos', () => {
  test('normalizePhone deja solo digitos', () => {
    assert.equal(normalizePhone('+1 (305) 123-4567'), '13051234567');
    assert.equal(normalizePhone(null), '');
  });

  test('formatPhone US de 10 digitos', () => {
    assert.equal(formatPhone('3051234567'), '1 (305) 123-4567');
  });

  test('formatPhone US de 11 digitos con 1 inicial', () => {
    assert.equal(formatPhone('13051234567'), '1 (305) 123-4567');
  });

  test('formatPhone internacional o atipico se conserva', () => {
    assert.equal(formatPhone('+34 600 123 456'), '+34 600 123 456');
    assert.equal(formatPhone(''), '');
    assert.equal(formatPhone(null), '');
  });
});

describe('leads - isNuevoEsteMes / nuevoBadge', () => {
  test('mismo mes y ano Miami es nuevo', () => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [, mm, dd] = hoy.split('-');
    const fecha = `${Number(dd)}/${Number(mm)}/${hoy.slice(0, 4)}`;
    assert.equal(isNuevoEsteMes(fecha), true);
  });

  test('mes o ano distinto no es nuevo; formato raro tampoco', () => {
    assert.equal(isNuevoEsteMes('1/1/2000'), false);
    assert.equal(isNuevoEsteMes('ayer'), false);
    assert.equal(isNuevoEsteMes(''), false);
    assert.equal(isNuevoEsteMes(null), false);
  });

  test('nuevoBadge devuelve chip Nuevo o cadena vacia', () => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [, mm, dd] = hoy.split('-');
    const lead = { Fecha: `${Number(dd)}/${Number(mm)}/${hoy.slice(0, 4)}` };
    assert.match(nuevoBadge(lead), /Nuevo/);
    assert.equal(nuevoBadge({ Fecha: '1/1/2000' }), '');
  });
});

describe('leads - compareLeadIdsDescending', () => {
  test('ids numericos: mayor primero', () => {
    assert.equal(compareLeadIdsDescending({ id: 10 }, { id: 2 }), -8);
    assert.equal(compareLeadIdsDescending({ id: 2 }, { id: 10 }), 8);
  });

  test('ids no numericos: comparacion textual numerica', () => {
    assert.equal(compareLeadIdsDescending({ id: 'b' }, { id: 'a' }), -1);
  });
});

describe('leads - withOrigin / getLeadOrigin', () => {
  test('origen historico y por defecto actual', () => {
    const lead = { id: 1 };
    withOrigin(lead, 'historico');
    assert.equal(getLeadOrigin(lead), 'historico');
    assert.equal(getLeadOrigin({ id: 2 }), 'actual');
  });

  test('__origin no enumerable (no aparece en JSON/export)', () => {
    const lead = withOrigin({ id: 3, Nombre: 'X' }, 'historico');
    assert.equal(JSON.stringify(lead).includes('historico'), false);
    assert.deepEqual(Object.keys(lead).includes('__origin'), false);
  });

  test('valores no objeto se devuelven tal cual', () => {
    assert.equal(withOrigin(null, 'historico'), null);
    assert.equal(withOrigin(undefined, 'historico'), undefined);
    assert.equal(getLeadOrigin(null), 'actual');
  });
});

describe('leads - haveSameLeadIds / isAgendadoGestion', () => {
  test('mismos ids en orden', () => {
    assert.equal(haveSameLeadIds([{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 2 }]), true);
    assert.equal(haveSameLeadIds([{ id: 1 }], [{ id: 2 }]), false);
    assert.equal(haveSameLeadIds([{ id: 1 }], []), false);
  });

  test('AGENDAD en cualquier variante', () => {
    assert.equal(isAgendadoGestion('agendado 12/09'), true);
    assert.equal(isAgendadoGestion('  AGENDADO DATA DURA '), true);
    assert.equal(isAgendadoGestion('INSCRITO'), false);
    assert.equal(isAgendadoGestion(''), false);
  });
});

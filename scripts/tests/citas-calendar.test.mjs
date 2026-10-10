import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Importar las funciones puras desde el módulo
// Usamos import() dinámico porque el módulo usa export
const mod = await import('../../src/citas-calendar.js');

const { miamiNaive, addMinutesNaive, advisorColor, toMiamiDay } = mod;

describe('citas-calendar pure functions', () => {
  test('miamiNaive convierte ISO UTC a naive Miami', () => {
    // 2026-07-15T16:00:00Z en Miami (EDT, UTC-4) = 2026-07-15T12:00
    const result = miamiNaive('2026-07-15T16:00:00Z');
    assert.equal(result, '2026-07-15T12:00');
  });

  test('miamiNaive devuelve null para entrada inválida', () => {
    assert.equal(miamiNaive(''), null);
    assert.equal(miamiNaive(null), null);
    assert.equal(miamiNaive(undefined), null);
    assert.equal(miamiNaive('not-a-date'), null);
  });

  test('addMinutesNaive suma 60 minutos caso normal', () => {
    const result = addMinutesNaive('2026-07-15T10:30', 60);
    assert.equal(result, '2026-07-15T11:30');
  });

  test('addMinutesNaive rollover de medianoche', () => {
    // 23:30 + 60 min = 00:30 día siguiente
    const result = addMinutesNaive('2026-07-15T23:30', 60);
    assert.equal(result, '2026-07-16T00:30');
  });

  test('addMinutesNaive rollover de fin de mes', () => {
    // 31 julio 23:30 + 60 min = 1 agosto 00:30
    const result = addMinutesNaive('2026-07-31T23:30', 60);
    assert.equal(result, '2026-08-01T00:30');
  });

  test('addMinutesNaive rollover de fin de año', () => {
    // 31 dic 23:30 + 60 min = 1 ene 00:30
    const result = addMinutesNaive('2026-12-31T23:30', 60);
    assert.equal(result, '2027-01-01T00:30');
  });

  test('addMinutesNaive minutos personalizados', () => {
    const result = addMinutesNaive('2026-07-15T10:00', 30);
    assert.equal(result, '2026-07-15T10:30');
  });

  test('addMinutesNaive devuelve string vacío para entrada inválida', () => {
    assert.equal(addMinutesNaive(''), '');
    assert.equal(addMinutesNaive('invalid'), '');
    assert.equal(addMinutesNaive(null), '');
  });

  test('advisorColor es estable para la misma clave', () => {
    const color1 = advisorColor('asesor-1');
    const color2 = advisorColor('asesor-1');
    assert.equal(color1, color2);
  });

  test('advisorColor genera colores distintos para claves variadas', () => {
    const colors = new Set();
    for (let i = 0; i < 20; i++) {
      colors.add(advisorColor(`asesor-${i}`));
    }
    // Con 20 claves y paleta de 10, debería haber al menos 5-10 colores distintos
    assert.ok(colors.size >= 5, `Se esperaban al menos 5 colores distintos, got ${colors.size}`);
  });

  test('advisorColor maneja números y strings por igual', () => {
    const colorNum = advisorColor(123);
    const colorStr = advisorColor('123');
    assert.equal(colorNum, colorStr);
  });

  test('advisorColor devuelve colores de la paleta esperada', () => {
    const palette = [
      '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
      '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'
    ];
    const color = advisorColor('test-key');
    assert.ok(palette.includes(color), `Color ${color} no está en la paleta esperada`);
  });
});

// Contrato de imports de FullCalendar: Calendar es export CON NOMBRE en
// @fullcalendar/core (no existe default) y los plugins sí exponen default.
// Sin este test, un cambio de destructuring equivocado (bug del default)
// solo explotaría en runtime del navegador (tsc no chequea .js sin checkJs).
describe('contrato de imports de FullCalendar', () => {
  test('Calendar es export nombrado de @fullcalendar/core, no default', async () => {
    const core = await import('@fullcalendar/core');
    assert.equal(typeof core.Calendar, 'function', 'Calendar debe ser export nombrado');
    assert.equal(core.default, undefined, 'core no debe tener default (usar { Calendar })');
  });

  test('daygrid y timegrid exponen el plugin como default', async () => {
    const [daygrid, timegrid] = await Promise.all([
      import('@fullcalendar/daygrid'),
      import('@fullcalendar/timegrid'),
    ]);
    assert.ok(daygrid.default, 'daygrid.default debe existir');
    assert.ok(timegrid.default, 'timegrid.default debe existir');
  });
});

// Regresión: el rango visible emitido por datesSet/getViewRange debe ser
// día 'YYYY-MM-DD' SIN componente hora. Un <input type="date"> sanea a ''
// cualquier valor con hora, lo que dejaba citasDesde vacío, disparaba el
// toast "Rango de fechas no válido" y bloqueaba la carga de citas (sin
// eventos ni leyenda de asesores).
describe('toMiamiDay (contrato de rango del calendario)', () => {
  test('devuelve solo YYYY-MM-DD sin hora', () => {
    // 2026-10-10T12:00:00Z = 2026-10-10 08:00 Miami (EDT, UTC-4)
    assert.equal(toMiamiDay('2026-10-10T12:00:00Z'), '2026-10-10');
    // 2026-10-10T00:00:00Z = 2026-10-09 20:00 Miami -> día anterior
    assert.equal(toMiamiDay('2026-10-10T00:00:00Z'), '2026-10-09');
  });

  test('acepta Date y cruces de medianoche UTC->Miami', () => {
    // 2026-10-10T04:00:00Z = 2026-10-10 00:00 Miami (EDT, UTC-4)
    assert.equal(toMiamiDay(new Date('2026-10-10T04:00:00Z')), '2026-10-10');
    // 2026-10-10T03:59:00Z = 2026-10-09 23:59 Miami -> día anterior
    assert.equal(toMiamiDay('2026-10-10T03:59:00Z'), '2026-10-09');
  });

  test('entrada inválida devuelve cadena vacía', () => {
    assert.equal(toMiamiDay(''), '');
    assert.equal(toMiamiDay(null), '');
    assert.equal(toMiamiDay(undefined), '');
    assert.equal(toMiamiDay('not-a-date'), '');
  });
});
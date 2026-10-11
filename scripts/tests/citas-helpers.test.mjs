import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Funciones puras del area Citas extraidas del monolito (capa 2 del strangler)
const mod = await import('../../src/legacy/citas.js');
const { appointmentDate, appointmentInputISO, appointmentLocal, appointmentBadge, citasDateDefaults, citasEventsFromRows } = mod;

describe('citas helpers - appointmentDate', () => {
  test('ISO valido devuelve Date', () => {
    const d = appointmentDate('2026-07-15T16:00:00Z');
    assert.ok(d instanceof Date);
    assert.equal(d.getTime(), Date.UTC(2026, 6, 15, 16, 0));
  });

  test('valor invalido devuelve null', () => {
    assert.equal(appointmentDate('no-es-fecha'), null);
    assert.equal(appointmentDate(''), null);
  });
});

describe('citas helpers - appointmentInputISO (DST Miami)', () => {
  test('invierno EST (UTC-5)', () => {
    assert.equal(appointmentInputISO('2026-01-15T10:00'), '2026-01-15T15:00:00.000Z');
  });

  test('verano EDT (UTC-4)', () => {
    assert.equal(appointmentInputISO('2026-07-15T10:00'), '2026-07-15T14:00:00.000Z');
  });

  test('hora inexistente por inicio DST se rechaza', () => {
    assert.equal(appointmentInputISO('2026-03-08T02:30'), null);
  });

  test('hora ambigua por fin DST se rechaza', () => {
    assert.equal(appointmentInputISO('2026-11-01T01:30'), null);
  });

  test('formato invalido devuelve null', () => {
    assert.equal(appointmentInputISO('2026-07-15'), null);
    assert.equal(appointmentInputISO(''), null);
    assert.equal(appointmentInputISO('2026-13-40T99:99'), null);
  });
});

describe('citas helpers - appointmentLocal', () => {
  test('muestra hora Miami (EDT) en formato es-ES', () => {
    // 2026-07-15T14:00Z = 10:00 Miami (EDT)
    assert.match(appointmentLocal('2026-07-15T14:00:00.000Z'), /10:00/);
    assert.match(appointmentLocal('2026-07-15T14:00:00.000Z'), /15\/7\/(?:2026|26)/);
  });

  test('muestra hora Miami (EST) en invierno', () => {
    // 2026-01-15T15:00Z = 10:00 Miami (EST)
    assert.match(appointmentLocal('2026-01-15T15:00:00.000Z'), /10:00/);
  });

  test('valor invalido devuelve guion', () => {
    assert.equal(appointmentLocal('fecha-bad'), '-');
  });
});

describe('citas helpers - appointmentBadge', () => {
  test('estado escapado dentro del badge', () => {
    assert.match(appointmentBadge('ASISTIO'), /ASISTIO/);
  });

  test('inyeccion queda escapada', () => {
    const html = appointmentBadge('<img src=x>');
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('<img') || html.includes(String.fromCharCode(38) + 'lt;img'));
  });

  test('vacio muestra guion', () => {
    assert.match(appointmentBadge(''), />-</);
  });
});

describe('citas helpers - citasDateDefaults', () => {
  test('devuelve [primer dia del mes Miami, hoy Miami]', () => {
    const [desde, hasta] = citasDateDefaults();
    assert.match(desde, /^\d{4}-\d{2}-01$/);
    assert.match(hasta, /^\d{4}-\d{2}-\d{2}$/);
    // mismo mes
    assert.equal(desde.slice(0, 7), hasta.slice(0, 7));
  });
});

describe('citas helpers - citasEventsFromRows', () => {
  const lead = { id: 7, 'Nombre': 'Ana <Test>' };

  test('fila valida produce evento naive Miami con color y duracion 60m', () => {
    const rows = [{
      id: 3, scheduled_at: '2026-07-15T16:00:00Z', created_at: '2026-07-01T12:00:00Z',
      advisor_name: 'Ana', advisor_user_id: 'uuid-1', status: 'PROGRAMADA', campus: 'DORAL',
      lead,
    }];
    const events = citasEventsFromRows(rows);
    assert.equal(events.length, 1);
    assert.equal(events[0].start, '2026-07-15T12:00');
    assert.equal(events[0].end, '2026-07-15T13:00');
    assert.equal(events[0].id, '3');
    assert.ok(events[0].backgroundColor);
    assert.equal(events[0].extendedProps.leadId, 7);
    // titulo escapado: '<' nunca aparece crudo
    assert.ok(!events[0].title.includes('<'));
  });

  test('fila sin scheduled_at valida se filtra', () => {
    const events = citasEventsFromRows([{ id: 1, scheduled_at: 'bad', lead }]);
    assert.equal(events.length, 0);
  });

  test('color estable por asesora: misma clave, mismo color', () => {
    const rows = [
      { id: 1, scheduled_at: '2026-07-15T16:00:00Z', advisor_user_id: 'uuid-1', lead },
      { id: 2, scheduled_at: '2026-07-15T17:00:00Z', advisor_user_id: 'uuid-1', lead },
      { id: 3, scheduled_at: '2026-07-15T16:00:00Z', advisor_name: 'Sin uuid', lead },
    ];
    const [a, b, c] = citasEventsFromRows(rows);
    assert.equal(a.backgroundColor, b.backgroundColor);
    // fallback por nombre cuando no hay advisor_user_id
    assert.ok(c.backgroundColor);
  });
});

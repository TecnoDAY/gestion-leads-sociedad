import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Helpers puros de Reportes/Historico/Campanas extraidos del monolito (capa 2)
const mod = await import('../../src/legacy/reportes.js');
const { MONTH_CHRONO, GESTION_STATE_GROUPS, parseFechaLead, normalizeLeadMonth, leadReportDate,
  isInscritoDataDura, histMonthKey, histMonthLabel, sortHistMonthKeys, normalizeGestion, groupGestionEstado,
  periodoPresetRange, periodoValidDate, periodoPct, csvReporteField, campaignCosteResultado, campaignTotals,
  totalCanalesVisibles } = mod;

describe('reportes - MONTH_CHRONO', () => {
  test('12 meses en orden cronologico', () => {
    assert.equal(MONTH_CHRONO.length, 12);
    assert.equal(MONTH_CHRONO[0], 'ENERO');
    assert.equal(MONTH_CHRONO[11], 'DICIEMBRE');
  });
});

describe('reportes - parseFechaLead', () => {
  test('formatos admitidos d/m/aaaa, d-m-aaaa, d/m/aa, aaaa-mm-dd', () => {
    assert.equal(parseFechaLead({ Fecha: '15/7/2026' }), Date.UTC(2026, 6, 15));
    assert.equal(parseFechaLead({ Fecha: '15-7-2026' }), Date.UTC(2026, 6, 15));
    assert.equal(parseFechaLead({ Fecha: '15/7/26' }), Date.UTC(2026, 6, 15));
    assert.equal(parseFechaLead({ Fecha: '2026-07-15' }), Date.UTC(2026, 6, 15));
  });

  test('fechas invalidas devuelven null', () => {
    assert.equal(parseFechaLead({ Fecha: '31/2/2026' }), null); // feb no tiene 31
    assert.equal(parseFechaLead({ Fecha: '15/13/2026' }), null);
    assert.equal(parseFechaLead({ Fecha: 'abc' }), null);
    assert.equal(parseFechaLead({}), null);
    assert.equal(parseFechaLead({ Fecha: '1999/1/1' }), null); // fuera de rango 2000-2100
  });
});

describe('reportes - normalizeLeadMonth / leadReportDate', () => {
  test('Mes canonico manda sobre Fecha', () => {
    assert.equal(normalizeLeadMonth({ Mes: 'JULIO ', Fecha: '1/1/2026' }), 'JULIO');
  });

  test('respaldo en Fecha cuando Mes desconocido', () => {
    assert.equal(normalizeLeadMonth({ Mes: 'RARO', Fecha: '15/7/2026' }), 'JULIO');
  });

  test('OTRO si nada cuadra', () => {
    assert.equal(normalizeLeadMonth({}), 'OTRO');
  });

  test('leadReportDate devuelve anio y mesIdx UTC', () => {
    assert.deepEqual(leadReportDate({ Fecha: '15/7/2026' }), { anio: 2026, mesIdx: 6 });
    assert.equal(leadReportDate({}), null);
  });
});

describe('reportes - isInscritoDataDura', () => {
  test('mes distinto del reporte es data dura', () => {
    // lead de JUNIO inscrito en reporte de julio 2026
    assert.equal(isInscritoDataDura({ Mes: 'JUNIO' }, '2026-07-15'), true);
  });

  test('mismo mes y mismo ano no es data dura', () => {
    assert.equal(isInscritoDataDura({ Mes: 'JULIO', Fecha: '5/7/2026' }, '2026-07-15'), false);
  });

  test('mismo mes con ano anterior es data dura', () => {
    assert.equal(isInscritoDataDura({ Mes: 'JULIO', Fecha: '5/7/2025' }, '2026-07-15'), true);
  });
});

describe('reportes - histMonthKey / histMonthLabel / sortHistMonthKeys', () => {
  test('clave ano-mes', () => {
    assert.equal(histMonthKey({ Mes: 'JULIO', Fecha: '15/7/2026' }), '2026-07');
  });

  test('sin fecha usa SIN-FECHA·mes; OTRO sin mes', () => {
    assert.equal(histMonthKey({ Mes: 'JULIO' }), 'SIN-FECHA·JULIO');
    assert.equal(histMonthKey({}), 'OTRO');
  });

  test('etiqueta legible', () => {
    assert.equal(histMonthLabel('2026-07'), 'JULIO 2026');
    assert.equal(histMonthLabel('SIN-FECHA·JULIO'), 'JULIO (sin fecha)');
    assert.equal(histMonthLabel('OTRO'), 'OTRO');
  });

  test('orden cronologico con SIN-FECHA y OTRO al final', () => {
    const sorted = sortHistMonthKeys(['OTRO', 'SIN-FECHA·JULIO', '2026-01', '2025-12']);
    assert.deepEqual(sorted, ['2025-12', '2026-01', 'SIN-FECHA·JULIO', 'OTRO']);
  });
});

describe('reportes - normalizeGestion / groupGestionEstado', () => {
  test('trim, espacios y mayusculas', () => {
    assert.equal(normalizeGestion({ GESTION: '  inscrito   doble ' }), 'INSCRITO DOBLE');
  });

  test('agrupa prefijos conocidos', () => {
    assert.equal(groupGestionEstado('AGENDADO 12/09'), 'AGENDADO');
    assert.equal(groupGestionEstado('AGENDADO DATA DURA 3'), 'AGENDADO DATA DURA');
    assert.equal(groupGestionEstado('AGENDADO DATADURA'), 'AGENDADO DATA DURA');
    assert.equal(groupGestionEstado('NO CONTESTO'), 'NO CONTESTA');
  });

  test('sin estado devuelve SIN ESTADO', () => {
    assert.equal(groupGestionEstado(''), 'SIN ESTADO');
  });

  test('GESTION_STATE_GROUPS exportada con 8 grupos', () => {
    assert.equal(GESTION_STATE_GROUPS.length, 8);
  });
});

describe('reportes - periodoPresetRange', () => {
  test('mes: desde el dia 1 hasta hoy', () => {
    const [desde, hasta] = periodoPresetRange('mes');
    assert.match(desde, /-01$/);
    assert.ok(desde <= hasta);
  });

  test('7d y 30d: rangos de 7 y 30 dias', () => {
    const [d7, h7] = periodoPresetRange('7d');
    assert.equal(Math.round((Date.parse(h7) - Date.parse(d7)) / 86400000), 6);
    const [d30, h30] = periodoPresetRange('30d');
    assert.equal(Math.round((Date.parse(h30) - Date.parse(d30)) / 86400000), 29);
  });

  test('semana: lunes a domingo', () => {
    const [desde, hasta] = periodoPresetRange('semana');
    const diaDesde = new Date(`${desde}T12:00:00Z`).getUTCDay();
    assert.equal(diaDesde, 1); // lunes
    assert.equal(Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000), 6);
  });

  test('preset desconocido devuelve null', () => {
    assert.equal(periodoPresetRange('anual'), null);
  });
});

describe('reportes - periodoValidDate / periodoPct', () => {
  test('fechas validas e invalidas', () => {
    assert.equal(periodoValidDate('2026-07-15'), true);
    assert.equal(periodoValidDate('2026-02-30'), false);
    assert.equal(periodoValidDate('15/07/2026'), false);
    assert.equal(periodoValidDate(''), false);
  });

  test('porcentaje con 2 decimales; 0% sin total', () => {
    assert.equal(periodoPct(1, 4), '25.00%');
    assert.equal(periodoPct(0, 0), '0.00%');
  });
});

describe('reportes - csvReporteField', () => {
  test('dobra comillas internas y envuelve en comillas', () => {
    const AMP = String.fromCharCode(38);
    const quot = AMP + 'quot;';
    const out = csvReporteField('dijo "hola"');
    assert.ok(out.includes('""'));
    assert.ok(out.startsWith(quot) || out.startsWith('"'));
  });

  test('neutraliza prefijos peligrosos =, +, -, @', () => {
    for (const pref of ['=', '+', '-', '@']) {
      const out = csvReporteField(pref + 'cmd');
      // apóstrofe antepuesto dentro de las comillas
      assert.ok(out.includes(`'${pref}cmd`), `prefijo ${pref} no neutralizado: ${out}`);
    }
  });
});

describe('reportes - campanas', () => {
  test('coste/resultado con 2 decimales o guion largo', () => {
    assert.equal(campaignCosteResultado(100, 4), '25.00');
    assert.equal(campaignCosteResultado(100, 0), '—');
  });

  test('campaignTotals suma metricas ignorando no numericos', () => {
    const totals = campaignTotals([
      { gasto: 10, resultados: 2, leads_nuevos: 'x' },
      { gasto: 15, resultados: 3, leads_nuevos: 5 },
    ]);
    assert.equal(totals.gasto, 25);
    assert.equal(totals.resultados, 5);
    assert.equal(totals.leads_nuevos, 5);
  });

  test('totalCanalesVisibles suma solo categorias mostradas', () => {
    assert.equal(totalCanalesVisibles({ llamada: 2, whatsapp: 3, instagram: 1, extra: 9 }), 6);
    assert.equal(totalCanalesVisibles(null), 0);
  });
});

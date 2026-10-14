import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvReporteField, historicalSummaryCsv } from '../../src/legacy/reportes.js';

// Vision beta: quita las comillas exteriores que csvReporteField SIEMPRE
// pone, para comparar las celdas legibles. Cada campo CSV va entre comillas,
// por lo que el split por comas es valido mientras el fixture no contenga
// comas dentro de los valores.
const cells = row => row.split(',').map(c => c.replace(/^"(.*)"$/, '$1'));

const lead = (over = {}) => ({
  Mes: 'FEBRERO',
  Fecha: '10/2/2026',
  GESTION: 'INSCRITO',
  'Campaña': 'Kids',
  'Agente ': 'Ana',
  ...over,
});

test('fila tipica: totales, % conversion, % del total, top campana y top agente', () => {
  const data = [lead(), lead({ 'Campaña': 'Zeta', 'Agente ': 'Beto' })];
  const summary = historicalSummaryCsv(data);
  assert.equal(summary.months, 1);
  const lines = summary.csv.split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(
    cells(lines[0]),
    ['Mes', 'Total Leads', 'Agendados', 'No Contesta', 'Inscritos', '% Conversión', '% del Total', 'Campaña Más Fuerte', 'Asesor con Más Cierres'],
  );
  // 2 inscritos de 2 -> 100.0%; un solo mes activo -> 100.0% del total;
  // empate de recuentos conserva el primero (Kids/Ana preceden a Zeta/Beto
  // en el orden de insercion de los contadores del agregado).
  assert.deepEqual(
    cells(lines[1]),
    ['FEBRERO 2026', '2', '0', '0', '2', '100.0%', '100.0%', 'Kids', 'Ana'],
  );
});

test('top por recuento estricto, no el orden alfabetico', () => {
  const data = [lead({ 'Campaña': 'Zeta', 'Agente ': 'Beto', GESTION: 'AGENDADO' }), lead(), lead()];
  const summary = historicalSummaryCsv(data);
  assert.equal(summary.months, 1);
  const row = cells(summary.csv.split('\n')[1]);
  // Kids/Ana tienen 2 vs 1 de Zeta/Beto: ganan por recuento.
  assert.equal(row[1], '3');
  assert.equal(row[4], '2');
  assert.equal(row[2], '1');
  assert.equal(row[7], 'Kids');
  assert.equal(row[8], 'Ana');
});

test('mes OTRO de gestion informacion entra con su etiqueta', () => {
  const data = [lead({ Mes: 'OTRO', Fecha: 'sin fecha', GESTION: 'INFORMACIÓN' })];
  const summary = historicalSummaryCsv(data);
  assert.equal(summary.months, 1);
  assert.equal(cells(summary.csv.split('\n')[1])[0], 'OTRO');
});

test('escape CSV: comillas dobladas y neutralizacion de formula en top', () => {
  const summary = historicalSummaryCsv([lead({ 'Campaña': '=SUM(A1)' }), lead({ 'Campaña': 'a"b' })]);
  const rawRows = summary.csv.split('\n').slice(1).map(r => r.split(','));
  assert.deepStrictEqual(rawRows[0][7], csvReporteField('=SUM(A1)'));
  assert.ok(csvReporteField('a"b').includes('""'), 'las comillas internas se doblan');
});

test('sin meses activos: months cero y CSV solo con la cabecera', () => {
  const vacio = historicalSummaryCsv([]);
  assert.equal(vacio.months, 0);
  assert.equal(vacio.csv.split('\n').length, 1);
});

test('entradas inesperadas: solo cabecera, sin lanzar ni mutar', () => {
  assert.equal(historicalSummaryCsv(null).months, 0);
  assert.equal(historicalSummaryCsv(undefined).months, 0);
  assert.equal(historicalSummaryCsv('no-array').months, 0);
});

// Caracterizacion de las piezas puras de Campanas (fase 22).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  campanasCsvLines, campanasDeFuentes, campaignTotals, csvReporteField,
  estadoVacioCampanasHtml, filaCampanaHtml, resumenCampanasHtml, totalCampanasHtml,
} from '../../src/legacy/reportes.js';

const rollup = [
  { campaign_name: 'Kids', leads_nuevos: 10, agendados: 4, asistieron: 3, inscritos: 2, agendados_previos: 1, pendientes: 5 },
  { campaign_name: 'Verano', leads_nuevos: 2 },
];
const stats = [{ id: 7, campaign_name: 'Kids', estado: 'pausada', alcance: 1000, gasto: 250.5, resultados: 5 }];

test('campanasDeFuentes: universo unico catalogo+rollup+stats con mapeo exacto', () => {
  const rows = campanasDeFuentes(['Verano', 'Nueva', '  '], rollup, stats);
  assert.deepEqual(rows.map(r => r.name), ['Kids', 'Nueva', 'Verano']);
  const kids = rows.find(r => r.name === 'Kids');
  assert.deepEqual(kids, {
    name: 'Kids', stat_id: 7, estado: 'pausada', alcance: 1000, gasto: 250.5, resultados: 5,
    periodos_alcance: 0, periodos_gasto: 0, periodos_resultados: 0, periodos_count: 0,
    leads_nuevos: 10, agendados: 4, asistieron: 3, inscritos: 2, agendados_previos: 1, pendientes: 5,
  });
  const verano = rows.find(r => r.name === 'Verano');
  assert.equal(verano.stat_id, null);
  assert.equal(verano.estado, 'activa');
  assert.equal(verano.alcance, 0);
  assert.equal(verano.leads_nuevos, 2);
  assert.equal(verano.pendientes, 0);
  // sin fuentes no hay campanas (los vacios del catalogo no crean filas)
  assert.deepEqual(campanasDeFuentes([], [], []), []);
});

const fila = { name: 'Kids & "Sala"', stat_id: 7, estado: 'pausada', alcance: 1000, gasto: 250.5, resultados: 5, leads_nuevos: 10, agendados: 4, asistieron: 3, inscritos: 2, agendados_previos: 1, pendientes: 5 };

test('filaCampanaHtml: mes en lectura por defecto; ajuste habilita solo esa fila', () => {
  // Lectura por defecto en vista mes (esEditor=true): spans y botón Ajustar.
  const lectura = filaCampanaHtml(fila, { esEditor: true, isAdmin: true, monthStr: '2026-10' });
  assert.match(lectura, /<span class="font-mono">1000<\/span>/);
  assert.match(lectura, /data-ev="click:iniciarAjusteMensualFromData\('Kids%20%26%20%22Sala%22'\)"/);
  assert.match(lectura, /Mensual ajustado/, 'con fila manual muestra el chip');
  assert.match(lectura, /data-ev="click:resetCampaignStatAutoFromData\('Kids%20%26%20%22Sala%22','2026-10'\)"/);
  assert.match(lectura, /data-ev="click:deleteCampaignStat\(7,'2026-10'\)"/);
  assert.doesNotMatch(lectura, /data-field="estado"|recalcCampaignRow|saveCampaignStatFromData/);
  // Modo ajuste: SOLO esa fila tiene inputs, Guardar ajuste y Cancelar.
  const ajuste = filaCampanaHtml(fila, { esEditor: true, isAdmin: true, monthStr: '2026-10', editandoMensual: 'Kids & "Sala"' });
  assert.match(ajuste, /data-field="alcance" value="1000"/);
  assert.match(ajuste, /data-ev="input:recalcCampaignRow\(this\)"/);
  assert.match(ajuste, /data-ev="click:saveCampaignStatFromData\('Kids%20%26%20%22Sala%22','2026-10',7\)"/);
  assert.match(ajuste, /Guardar ajuste/);
  assert.match(ajuste, /data-ev="click:cancelarAjusteMensual\(\)"/);
  assert.match(ajuste, /<option value="pausada" selected>/);
  assert.doesNotMatch(ajuste, /iniciarAjusteMensualFromData|Mensual ajustado|deleteCampaignStat|resetCampaignStatAutoFromData/);
  assert.match(ajuste, /data-field="coste">50\.10</, 'coste = gasto/resultados');
  // Sin stat_id el guardado crea la fila manual (id null) y no hay chip ni reajuste.
  const sinStat = filaCampanaHtml({ ...fila, stat_id: null }, { esEditor: true, isAdmin: true, monthStr: '2026-10', editandoMensual: 'Kids & "Sala"' });
  assert.match(sinStat, /saveCampaignStatFromData\('Kids%20%26%20%22Sala%22','2026-10',null\)/);
  const sinStatLectura = filaCampanaHtml({ ...fila, stat_id: null }, { esEditor: true, isAdmin: true, monthStr: '2026-10' });
  assert.doesNotMatch(sinStatLectura, /Mensual ajustado|resetCampaignStatAutoFromData|deleteCampaignStat/);
  // Lector puro: sin ningún botón.
  const lector = filaCampanaHtml(fila, { esEditor: false, isAdmin: false, monthStr: '2026-10' });
  assert.doesNotMatch(lector, /iniciarAjusteMensual|saveCampaignStatFromData|deleteCampaignStat|resetCampaignStatAutoFromData|cancelarAjusteMensual/);
  // Sin períodos disponibles y sin fila manual: Meta no calculable, sin botón de ajuste.
  const incompleta = filaCampanaHtml({ ...fila, stat_id: null, alcance: null, gasto: null, resultados: null, periodos_count: 0 }, { esEditor: true, isAdmin: true, monthStr: '2026-10', periodosDisponibles: false });
  assert.match(incompleta, /<span class="font-mono">—<\/span>/);
  assert.doesNotMatch(incompleta, /iniciarAjusteMensualFromData/);
  // Con fila manual y períodos caídos: valores manuales completos y ajuste permitido.
  const manualOk = filaCampanaHtml(fila, { esEditor: true, isAdmin: true, monthStr: '2026-10', periodosDisponibles: false });
  assert.match(manualOk, /iniciarAjusteMensualFromData/);
  assert.doesNotMatch(manualOk, /Períodos \(/, 'sin datos de períodos no hay pista de suma');
});

test('resumen, total y estado vacio', () => {
  const totals = campaignTotals([fila]);
  const resumen = resumenCampanasHtml([fila], totals);
  assert.match(resumen, /Inversión Meta/);
  assert.match(resumen, /\$250\.50/);
  assert.match(resumen, /Resultados Meta/);
  assert.equal(resumenCampanasHtml([], { gasto: 0, resultados: 0, leads_nuevos: 0, inscritos: 0 }), '');
  const total = totalCampanasHtml(totals, 'octubre 2026');
  assert.match(total, /TOTAL · octubre 2026/);
  assert.match(total, /250\.50/);
  const fallo = estadoVacioCampanasHtml(true, 'octubre 2026');
  assert.match(fallo, /No se pudo cargar el informe/);
  assert.match(fallo, /data-ev="click:loadCampanas\(\)"/);
  const vacio = estadoVacioCampanasHtml(false, 'octubre 2026');
  assert.match(vacio, /Sin campañas para octubre 2026/);
});

test('campanasCsvLines: cabecera, filas y total con coste calculado', () => {
  const lineas = campanasCsvLines([fila], '2026-10', '2026-11-01');
  assert.equal(lineas[0], 'Campañas · 2026-10');
  assert.equal(lineas[1], `Generado: 2026-11-01 Miami`);
  assert.equal(lineas[2], '');
  assert.equal(lineas[3], ['Campaña', 'Estado', 'Alcance', 'Gasto (USD)', 'Resultados Meta', 'Coste/Resultado', 'Leads Nuevos', 'Agendados', 'Asistieron', 'Inscritos', 'Agendados Meses Anteriores', 'Pendientes'].join(','));
  assert.equal(lineas.length, 6);
  assert.ok(lineas[4].startsWith(csvReporteField('Kids & "Sala"')));
  assert.match(lineas[4], new RegExp(csvReporteField('50.10').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(lineas.at(-1).split(',')[0], csvReporteField('TOTAL'));
  assert.match(lineas.at(-1), /250\.50/);
});

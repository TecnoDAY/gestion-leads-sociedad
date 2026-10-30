// Campanas por PERÍODOS de fechas (campaign_period_stats) + Reportes en
// lectura del trafficker. Piezas puras reales + aserciones de fuente sobre
// index.html y la migracion. Sustituye a campanas-semanales (pivot a períodos).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  campanasCsvLines, campanasDeFuentes, campaignTotals,
  filaCampanaHtml, resumenCampanasHtml, totalCampanasHtml,
} from '../../src/legacy/reportes.js';

const rollup = [
  { campaign_name: 'Kids', leads_nuevos: 10, agendados: 4, asistieron: 3, inscritos: 2, agendados_previos: 1, pendientes: 5 },
  { campaign_name: 'Verano', leads_nuevos: 2 },
];
const stats = [{ id: 7, campaign_name: 'Kids', estado: 'pausada', alcance: 1000, gasto: 250.5, resultados: 5 }];
const periodos = [
  { id: 31, campaign_name: 'Kids', desde: '2026-10-01', hasta: '2026-10-07', alcance: 300, gasto: 80, resultados: 2 },
  { id: 32, campaign_name: 'Kids', desde: '2026-10-08', hasta: '2026-10-14', alcance: 400, gasto: 100.5, resultados: 3 },
  { id: 33, campaign_name: 'Verano', desde: '2026-10-01', hasta: '2026-10-07', alcance: 50, gasto: 10, resultados: 1 },
];
const p1 = { desde: '2026-10-01', hasta: '2026-10-07' };
const p2 = { desde: '2026-10-08', hasta: '2026-10-14' };

test('campanasDeFuentes (vista mes): sin fila manual, el mes es la suma de períodos', () => {
  const rows = campanasDeFuentes([], rollup, stats, periodos, null);
  const kids = rows.find(r => r.name === 'Kids');
  assert.equal(kids.stat_id, 7);
  assert.equal(kids.alcance, 1000, 'la fila manual gana sobre la suma de períodos');
  assert.equal(kids.gasto, 250.5);
  assert.equal(kids.resultados, 5);
  assert.equal(kids.leads_nuevos, 10, 'el rollup CRM sigue mensual');
  assert.deepEqual(
    { a: kids.periodos_alcance, g: kids.periodos_gasto, r: kids.periodos_resultados, n: kids.periodos_count },
    { a: 700, g: 180.5, r: 5, n: 2 },
  );
  const verano = rows.find(r => r.name === 'Verano');
  assert.equal(verano.stat_id, null);
  assert.equal(verano.alcance, 50, 'sin fila manual: suma de períodos');
  assert.equal(verano.gasto, 10);
  assert.equal(verano.resultados, 1);
  assert.equal(verano.periodos_count, 1);
  // Sin períodos ni cambios: mes identico al comportamiento previo.
  const sinPeriodos = campanasDeFuentes([], rollup, stats, [], null).find(r => r.name === 'Kids');
  assert.equal(sinPeriodos.alcance, 1000);
  assert.equal(sinPeriodos.periodos_count, 0);
});

test('campanasDeFuentes (vista período): valores de ESE rango y CRM en null', () => {
  const rows = campanasDeFuentes([], rollup, stats, periodos, p2);
  const kids = rows.find(r => r.name === 'Kids');
  assert.equal(kids.period_id, 32);
  assert.equal(kids.alcance, 400);
  assert.equal(kids.gasto, 100.5);
  assert.equal(kids.resultados, 3);
  assert.equal(kids.leads_nuevos, null, 'el rollup CRM no se desglosa por período');
  assert.equal(kids.inscritos, null);
  // Campana sin fila en ese período: fila en cero, sin period_id.
  const sinFila = campanasDeFuentes([], rollup, [], periodos, { desde: '2026-10-15', hasta: '2026-10-21' });
  assert.equal(sinFila.find(r => r.name === 'Verano').alcance, 0);
  assert.equal(sinFila.find(r => r.name === 'Verano').period_id, null);
  // Una fila de período nueva crea el universo de campanas aunque no este en el catalogo.
  assert.ok(campanasDeFuentes([], [], [], periodos, p1).some(r => r.name === 'Kids'));
});

test('filaCampanaHtml (vista período): guarda período, estado en texto y CRM con guion', () => {
  const filaPeriodo = { name: 'Kids', stat_id: 7, period_id: 32, estado: 'pausada', alcance: 400, gasto: 100.5, resultados: 3, leads_nuevos: null, agendados: null, asistieron: null, inscritos: null, agendados_previos: null, pendientes: null };
  const html = filaCampanaHtml(filaPeriodo, { esEditor: true, isAdmin: true, monthStr: '2026-10', periodo: p2 });
  assert.match(html, /data-ev="click:saveCampaignPeriodStatFromData\('Kids','2026-10-08','2026-10-14'\)"/);
  assert.match(html, /data-desde="2026-10-08" data-hasta="2026-10-14"/);
  assert.match(html, /data-ev="click:deleteCampaignPeriodStat\(32,'2026-10-08','2026-10-14'\)"/, 'admin puede eliminar el período');
  assert.doesNotMatch(html, /data-field="estado"/, 'el estado es mensual, no del período');
  assert.doesNotMatch(html, /resetCampaignStatAutoFromData/, 'el reajuste es de la vista mes');
  assert.match(html, /pausada/);
  assert.match(html, /<td class="p-3 text-right font-mono">—<\/td>/, 'metricas CRM con guion');
  assert.doesNotMatch(html, /deleteCampaignStat\(/, 'no mezcla el borrado mensual');
  // Sin period_id el admin no puede eliminar una fila inexistente.
  const sinFila = filaCampanaHtml({ ...filaPeriodo, period_id: null }, { esEditor: true, isAdmin: true, monthStr: '2026-10', periodo: p2 });
  assert.doesNotMatch(sinFila, /deleteCampaignPeriodStat/);
  // Lector: sin botones.
  const lector = filaCampanaHtml(filaPeriodo, { esEditor: false, isAdmin: false, monthStr: '2026-10', periodo: p2 });
  assert.doesNotMatch(lector, /saveCampaignPeriodStatFromData|deleteCampaignPeriodStat|recalcCampaignRow/);
});

test('filaCampanaHtml (vista mes): pista de períodos, chip y ajuste por fila', () => {
  const fila = { name: 'Kids', stat_id: 7, estado: 'pausada', alcance: 1000, gasto: 250.5, resultados: 5, periodos_alcance: 700, periodos_gasto: 180.5, periodos_resultados: 5, periodos_count: 2, leads_nuevos: 10, agendados: 4, asistieron: 3, inscritos: 2, agendados_previos: 1, pendientes: 5 };
  // Lectura por defecto: pista + chip + Ajustar mensual; sin inputs.
  const conPeriodos = filaCampanaHtml(fila, { esEditor: true, isAdmin: false, monthStr: '2026-10' });
  assert.match(conPeriodos, /Períodos \(2\): 700 · \$180\.50 · 5 res\./);
  assert.match(conPeriodos, /Mensual ajustado/);
  assert.match(conPeriodos, /data-ev="click:iniciarAjusteMensualFromData\('Kids'\)"/);
  assert.match(conPeriodos, /data-ev="click:resetCampaignStatAutoFromData\('Kids','2026-10'\)"/);
  assert.doesNotMatch(conPeriodos, /data-field="estado"|recalcCampaignRow|saveCampaignStatFromData/);
  // Modo ajuste de ESA fila: inputs + Guardar ajuste; sin chip ni reajuste.
  // La pista de la suma de períodos se conserva: ayuda a corregir con contexto.
  const ajuste = filaCampanaHtml(fila, { esEditor: true, isAdmin: false, monthStr: '2026-10', editandoMensual: 'Kids' });
  assert.match(ajuste, /data-ev="click:saveCampaignStatFromData\('Kids','2026-10',7\)"/);
  assert.match(ajuste, /Guardar ajuste/);
  assert.match(ajuste, /data-ev="click:cancelarAjusteMensual\(\)"/);
  assert.match(ajuste, /Períodos \(2\): 700 · \$180\.50 · 5 res\./);
  assert.doesNotMatch(ajuste, /Mensual ajustado|iniciarAjusteMensualFromData|resetCampaignStatAutoFromData/);
  // Sin fila manual: sin chip y sin reajuste; el ajuste crea la fila.
  const sinStat = filaCampanaHtml({ ...fila, stat_id: null }, { esEditor: true, isAdmin: false, monthStr: '2026-10' });
  assert.doesNotMatch(sinStat, /Mensual ajustado|resetCampaignStatAutoFromData/);
  // Sin períodos: sin pista.
  const sinPeriodos = filaCampanaHtml({ ...fila, periodos_count: 0 }, { esEditor: true, isAdmin: false, monthStr: '2026-10' });
  assert.doesNotMatch(sinPeriodos, /Períodos \(/);
});

test('campanasDeFuentes: sin períodos disponibles, el mes sin fila manual no es calculable', () => {
  // Con fila manual: valores manuales intactos aunque la carga de períodos falle.
  const rows = campanasDeFuentes([], rollup, stats, [], null, false);
  const kids = rows.find(r => r.name === 'Kids');
  assert.equal(kids.alcance, 1000);
  assert.equal(kids.gasto, 250.5);
  // Sin fila manual: null (la UI muestra guion, nunca un cero falso).
  const verano = rows.find(r => r.name === 'Verano');
  assert.equal(verano.alcance, null);
  assert.equal(verano.gasto, null);
  assert.equal(verano.resultados, null);
  assert.equal(verano.periodos_count, 0);
  // Vista período con carga caída: también null.
  const semana = campanasDeFuentes([], rollup, stats, [], { desde: '2026-10-01', hasta: '2026-10-07' }, false);
  assert.equal(semana.find(r => r.name === 'Kids').alcance, null);
  // Con datos disponibles todo sigue igual que antes.
  const ok = campanasDeFuentes([], rollup, stats, periodos, null, true).find(r => r.name === 'Verano');
  assert.equal(ok.alcance, 50);
});

test('totales y resumen con datos incompletos: guion y No disponible, nunca cero falso', () => {
  const rows = campanasDeFuentes([], rollup, stats, [], null, false);
  const totals = campaignTotals(rows);
  const total = totalCampanasHtml(totals, 'OCTUBRE 2026', false, true);
  assert.match(total, /<td class="p-3 text-right font-mono">—<\/td>/, 'Meta con guion');
  assert.match(total, /12/, 'las columnas CRM (rollup) siguen visibles');
  const resumen = resumenCampanasHtml(rows, totals, false, true);
  assert.match(resumen, /No disponible/);
  assert.match(resumen, /Leads nuevos/, 'el rollup CRM no se ve afectado');
  // Sin incompletitud: el resumen y el total no cambian.
  const resumenOk = resumenCampanasHtml(campanasDeFuentes([], rollup, stats), campaignTotals(campanasDeFuentes([], rollup, stats)), false, false);
  assert.match(resumenOk, /\$250\.50/);
  assert.doesNotMatch(resumenOk, /No disponible/);
});

test('total, resumen y CSV de la vista período', () => {
  const rows = campanasDeFuentes([], rollup, stats, periodos, p2);
  const totals = campaignTotals(rows);
  assert.equal(totals.gasto, 100.5);
  assert.equal(totals.leads_nuevos, 0, 'los null del CRM no suman');
  const total = totalCampanasHtml(totals, 'OCTUBRE 2026 · 08/10 al 14/10', true);
  assert.match(total, /TOTAL · OCTUBRE 2026 · 08\/10 al 14\/10/);
  assert.match(total, /<td class="p-3 text-right font-mono">—<\/td>/, 'totales CRM con guion');
  const resumen = resumenCampanasHtml(rows, totals, true);
  assert.match(resumen, /Inversión Meta/);
  assert.match(resumen, /Alcance/);
  assert.match(resumen, /Coste\/Resultado/);
  assert.doesNotMatch(resumen, /Leads nuevos/, 'en período no se muestran metricas CRM');
  const lineas = campanasCsvLines(rows, '2026-10', '2026-11-01', '08/10 al 14/10');
  assert.equal(lineas[0], 'Campañas · 2026-10 · 08/10 al 14/10');
  assert.equal(lineas.at(-1).split(',').slice(6).join(','), ['""', '""', '""', '""', '""', '""'].join(','), 'total CRM vacío en período');
  // El CSV mensual no cambia.
  const lineasMes = campanasCsvLines(campanasDeFuentes([], rollup, stats), '2026-10', '2026-11-01');
  assert.equal(lineasMes[0], 'Campañas · 2026-10');
});

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('index.html: vista períodos con Desde/Hasta, guardado y contexto por rango', () => {
  assert.match(html, /id="campaignVistaSel" data-ev="change:loadCampanas\(\)"/);
  assert.match(html, /<option value="mes">Mes<\/option><option value="periodo">Períodos<\/option>/);
  assert.match(html, /id="campaignPeriodoDesde" type="date"/);
  assert.match(html, /id="campaignPeriodoHasta" type="date"/);
  assert.match(html, /id="campanasPeriodosLista" class="hidden/);
  assert.match(html, /rpc\('upsert_campaign_period_stat', \{/);
  assert.match(html, /rpc\('delete_campaign_period_stat', \{ p_id: statId \}\)/);
  assert.match(html, /rpc\('reset_campaign_stat_auto', \{/);
  assert.match(html, /function saveCampaignPeriodStatFromData\(nombreCodificado, desde, hasta\)/);
  assert.match(html, /function resetCampaignStatAutoFromData\(nombreCodificado, mes\)/);
  // El contexto de la carga incluye el período para no mezclar vistas.
  assert.match(html, /campanasContextPeriodo = periodo \? `\$\{periodo\.desde\}\|\$\{periodo\.hasta\}` : '';/);
  assert.match(html, /campanasContextPeriodo !== '' \|\| currentId !== wantedId/);
  assert.match(html, /campanasContextPeriodo !== `\$\{expectedDesde\}\|\$\{expectedHasta\}`/);
  // Validaciones cliente: rango y mes; el solape lo detecta el servidor.
  assert.match(html, /Desde debe ser anterior o igual a Hasta/);
  assert.match(html, /El período debe quedar dentro del mes seleccionado/);
  assert.match(html, /campañaErrorPeriodo\(error\.message/);
  assert.match(html, /exclusion constraint\|no_solape\|23P01/, 'solape concurrente (EXCLUDE) también traducido');
  // Guardar en vista períodos exige desglose cargado (no escribir a ciegas).
  assert.match(html, /if \(campaignPeriodosFailed\) \{ showToast\('El desglose por períodos no está disponible; recarga la página e inténtalo de nuevo', 'warning'\); return; \}/);
  // La carga de períodos es tolerante: si falla, el informe mensual se muestra igual.
  assert.match(html, /No se pudo cargar el desglose por períodos/);
  assert.match(html, /campanasCsvLines\(campanasData, monthStr, miamiToday\(\), periodoLabel\)/);
  // Lista de períodos guardados como accesos directos.
  assert.match(html, /data-ev="click:setCampanasPeriodo\('\$\{r\.desde\}','\$\{r\.hasta\}'\)"/);
  assert.match(html, /function setCampanasPeriodo\(desde, hasta\)/);
  // Ajuste mensual por fila: lectura por defecto, una fila en edición a la vez.
  assert.match(html, /function iniciarAjusteMensual\(campaignName\)/);
  assert.match(html, /function iniciarAjusteMensualFromData\(nombreCodificado\)/);
  assert.match(html, /function cancelarAjusteMensual\(\)/);
  assert.match(html, /function rerenderCampanas\(\)/);
  assert.match(html, /campaignEditMonth = null;/);
  assert.match(html, /campaignEditMonth !== campaignName/, 'guardar ajuste exige seguir en la fila editada');
  assert.match(html, /let campaignPeriodosFailed = false;/);
  assert.match(html, /editandoMensual: esPeriodo \? null : campaignEditMonth/);
  assert.match(html, /periodosDisponibles: !campaignPeriodosFailed/);
  assert.match(html, /campanasDeFuentes\(activeCatalogValues\('campana'\), rollupRows, statRows, campaignPeriodRows, esPeriodo \? campanasPeriodoSeleccionado\(\) : null, !periodosFailed\)/);
  assert.match(html, /const datosIncompletos = rows\.some\(r => r\.alcance == null\)/);
  assert.match(html, /resumenCampanasHtml\(rows, totals, esPeriodo, datosIncompletos\)/);
  assert.match(html, /totalCampanasHtml\(totals, mesLabel, esPeriodo, datosIncompletos\)/);
  // Sin restos del diseño por semanas descartado.
  assert.doesNotMatch(html, /WeekStat|campaign_weekly_stats|campaignSemanaSel|campanasContextWeek|campaignWeekRows/);
});

test('index.html: el trafficker ve Reportes en solo lectura', () => {
  // La pestana Reportes ya no se oculta al trafficker (ni sidebar ni switchTab).
  assert.doesNotMatch(html, /'tabBtnReporte'\]\.forEach/);
  assert.doesNotMatch(html, /btnHist, btnReporte, btnCitas\]\.forEach\(button => button\.classList\.toggle\('hidden', isTrafficker\)\)/);
  assert.doesNotMatch(html, /data-sidebar-tab="reporte" data-crm-nav/);
  // Las notas del diario no son editables para el trafficker.
  assert.match(html, /const editable = notasOk && !isTrafficker/);
  // El periodo del trafficker usa el RPC sin PII en lugar de la tabla leads.
  assert.match(html, /if \(isTrafficker\) \{\n        try \{\n          const \{ data, error \} = await supabaseClient\.rpc\('reporte_periodo_leads'\);/);
  assert.match(html, /if \(!isTrafficker && \(isLoadingLeads \|\| \(!allLeads\.length && isSupabaseLive !== true\)\)\)/);
});

const migration = readFileSync(new URL('../../supabase/migrations/archive/202610140001_campaign_period_stats.sql', import.meta.url), 'utf8');

test('migracion: tabla de períodos, RLS de solo lectura y RPCs con guards', () => {
  assert.match(migration, /create extension if not exists btree_gist;/);
  assert.match(migration, /create table if not exists public\.campaign_period_stats \(/);
  assert.match(migration, /constraint campaign_period_stats_rango_valido check \(desde <= hasta\)/);
  assert.match(migration, /constraint campaign_period_stats_un_mes check \(date_trunc\('month', desde\) = date_trunc\('month', hasta\)\)/);
  assert.match(migration, /constraint campaign_period_stats_unique_period unique \(campaign_name, desde, hasta\)/);
  assert.match(migration, /exclude using gist \(campaign_name with =, daterange\(desde, hasta, '\[\]'\) with &&\)/, 'solapes prohibidos en base');
  assert.match(migration, /create policy "campaign_period_stats_read_active"\non public\.campaign_period_stats for select to authenticated\nusing \(public\.is_active_user\(\)\);/);
  assert.match(migration, /revoke insert, update, delete on public\.campaign_period_stats from anon, authenticated;/);
  // Guard del upsert: solo editores de campanas; fila ajena exige admin.
  assert.match(migration, /if not public\.is_campaign_editor\(\) then\n    raise exception using errcode = '42501', message = 'campaign_editor_required';/);
  assert.match(migration, /message = 'period_overlap';/);
  assert.match(migration, /message = 'period_month_required';/);
  assert.match(migration, /message = 'period_range_invalid';/);
  assert.match(migration, /raise exception using errcode = '42501', message = 'own_campaign_stat_required';/);
  // delete: admin primero, sin filtrar existencia (patron delete_campaign_stat).
  const deleteBody = migration.slice(migration.indexOf('function public.delete_campaign_period_stat'), migration.indexOf('$$;', migration.indexOf('function public.delete_campaign_period_stat')));
  assert.ok(deleteBody.indexOf('is_admin_user') < deleteBody.indexOf('delete from'), 'admin antes del delete');
  assert.match(deleteBody, /campaign_period_stat_not_found/);
  // reset_campaign_stat_auto: elimina la fila manual; solo admin o creador.
  assert.match(migration, /function public\.reset_campaign_stat_auto\(p_campaign_name text, p_anio int, p_mes text\)/);
  assert.match(migration, /delete from public\.campaign_stats where id = stat\.id;/);
  assert.match(migration, /return false; -- sin corrección manual: nada que reajustar/);
});

test('migracion: reporte_periodo_leads sin PII', () => {
  assert.match(migration, /create or replace function public\.reporte_periodo_leads\(\)/);
  const cuerpo = migration.slice(migration.indexOf('function public.reporte_periodo_leads'), migration.indexOf('$$;', migration.indexOf('function public.reporte_periodo_leads')));
  assert.match(cuerpo, /select l\.id, l\."Fecha", l\."Medio", l\."Campaña", l\."GESTION", l\.archived_at/);
  assert.match(cuerpo, /public\.is_active_user\(\) and \(public\.is_crm_user\(\) or public\.is_campaign_editor\(\)\)/);
  assert.doesNotMatch(cuerpo, /Nombre|Telefono|Odoo|AGENTE|Ciudad/, 'nunca columnas con PII');
});

test('migracion: sin escaparse del alcance (campaign_stats intacta)', () => {
  assert.equal((migration.match(/create table if not exists/g) || []).length, 1, 'solo la tabla de períodos');
  assert.doesNotMatch(migration, /alter table public\.campaign_stats/);
  assert.doesNotMatch(migration, /drop policy on public\.campaign_stats/);
  assert.doesNotMatch(migration, /is_crm_user\(\)\s*\nreturns boolean/, 'is_crm_user no se redefine');
  // Las notas del diario siguen protegidas: no se redefinen sus RPCs.
  assert.doesNotMatch(migration, /function public\.upsert_daily_report_note/);
  assert.doesNotMatch(migration, /function public\.delete_daily_report_note/);
  // Sin restos del diseño semanal descartado.
  assert.doesNotMatch(migration, /weekly|semana/i);
});

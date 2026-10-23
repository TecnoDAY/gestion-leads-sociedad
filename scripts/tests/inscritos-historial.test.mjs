import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inscripcionMesRange, validateInscritosHistorial, validateInscritosDetalle, inscritosHistorialCsvLines, claseInscripcionEtiqueta } from '../../src/legacy/inscripciones.js';
import { buildPeriodSummary, periodoCsvLines } from '../../src/legacy/reportes.js';
import { filaLeadHtml, tarjetaLeadMovilHtml } from '../../src/legacy/leads.js';
import { csvFields } from './csv-fields.mjs';

test('inscripcion: mes/anio sin zona horaria, bisiestos y fechas invalidas', () => {
  assert.deepEqual(inscripcionMesRange('Octubre', '2026'), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(inscripcionMesRange('Febrero', '2024'), ['2024-02-01', '2024-02-29']);
  assert.deepEqual(inscripcionMesRange('Diciembre', '2025'), ['2025-12-01', '2025-12-31']);
  for (const [mes, year] of [['Otro','2026'],['Octubre',''],['Octubre','2026x'],['Octubre','1899']]) assert.throws(() => inscripcionMesRange(mes, year));
});
const h = { desde: '2026-10-01', hasta: '2026-10-31', personas_inscritas: 4, normales: 1, data_dura: 3, revision: 0, pendientes_fecha: 2,
  por_campana: [
    { campana: 'Kids', personas: 3, normales: 0, data_dura: 3, revision: 0 },
    { campana: 'Sin campaña', personas: 1, normales: 1, data_dura: 0, revision: 0 },
  ] };
test('historial: validador comprueba rango, personas y desglose por campana', () => {
  assert.equal(validateInscritosHistorial(h, h.desde, h.hasta), h);
  for (const bad of [
    {...h,normales:4},
    {...h,data_dura:2,revision:1},
    {...h,pendientes_fecha:-1},
    {...h,personas_inscritas:'4'},
    {...h,desde:'2025-10-01'},
    {...h,por_campana:'no-array'},
    {...h,por_campana:[{campana:'X',personas:9,normales:5,data_dura:4,revision:0}]},
    {...h,por_campana:[{campana:'Kids',personas:2,normales:0,data_dura:3,revision:0}]},
    {...h,por_campana:[{campana:'X',personas:1,normales:0.5,data_dura:0.5,revision:0}]},
    {...h,por_campana:[{personas:1,normales:1,data_dura:0,revision:0}]},
    {...h,por_campana:[{campana:'X',personas:1,normales:1,data_dura:0,revision:'0'}]},
  ]) assert.throws(() => validateInscritosHistorial(bad,h.desde,h.hasta));
});
test('detalle: una persona por rango, fechas verificables y clases coherentes con resumen', () => {
  const filas=[1,2,3,4].map(id=>({id,fecha_inscripcion:'2026-10-05',clase:id===1?'NORMAL':'DATA_DURA'}));
  assert.equal(validateInscritosDetalle(filas,h),filas);
  for(const bad of [null,filas.slice(1),[...filas,filas[0]],
    filas.map(f=>({...f,id:1})), filas.map(f=>({...f,fecha_inscripcion:null})),
    filas.map(f=>({...f,fecha_inscripcion:'2026-09-30'})),
    filas.map(f=>({...f,fecha_inscripcion:'2026-11-01'})),
    filas.map(f=>({...f,fecha_inscripcion:'2026-02-30'})),
    filas.map(f=>({...f,clase:'NORMAL'})), filas.map(f=>({...f,clase:'DESCONOCIDO'}))]) {
    assert.throws(()=>validateInscritosDetalle(bad,h),/Actualiza el reporte/);
  }
  assert.deepEqual(validateInscritosDetalle([],{...h,personas_inscritas:0,normales:0,data_dura:0}),[]);
  const revision=[{id:1,fecha_inscripcion:'2026-10-05',clase:'PENDIENTE'},
    {id:2,fecha_inscripcion:'2026-10-06',clase:'INCONSISTENTE'}];
  assert.equal(validateInscritosDetalle(revision,{...h,personas_inscritas:2,normales:0,data_dura:0,revision:2}),revision);
});

test('clase: etiquetas legibles sin inventar el grupo', () => {
  assert.equal(claseInscripcionEtiqueta('NORMAL'), 'Inscrito');
  assert.equal(claseInscripcionEtiqueta('data_dura'), 'Inscrito Data Dura');
  assert.match(claseInscripcionEtiqueta('PENDIENTE'), /falta fecha de ingreso/);
  assert.match(claseInscripcionEtiqueta('INCONSISTENTE'), /ingreso posterior/);
  assert.equal(claseInscripcionEtiqueta(''), 'Sin clase');
});
test('CSV historico: clase por fechas, campana y programa actual, con escape y formulas neutralizadas', () => {
  const lines = inscritosHistorialCsvLines([{id:1,nombre:'=SUM(1)',telefono:'3050000000',fecha_inscripcion:'2026-10-03',clase:'DATA_DURA',estado_inscripcion:'Inscrito',campana:'Taller, "camara"',programa:'Taller camara',estado_actual:'No procede'},
    {id:2,nombre:'Normal',telefono:'',fecha_inscripcion:'2026-10-04',clase:'NORMAL',estado_inscripcion:'Inscrito Data',campana:null},
    {id:3,nombre:'Rara',telefono:'',fecha_inscripcion:'2026-10-04',clase:'INCONSISTENTE',estado_inscripcion:'Inscrito'}],h.desde,h.hasta,'2026-11-01');
  const header = csvFields(lines[5]);
  assert.deepEqual(header, ['ID','Nombre','Teléfono','Fecha de inscripción','Clase','Estado al inscribirse','Campaña','Programa actual','Estado actual']);
  const row = csvFields(lines[6]);
  assert.deepEqual(row, ['1',"'=SUM(1)","'3050000000",'2026-10-03','Inscrito Data Dura','Inscrito','Taller, "camara"','Taller camara','No procede']);
  // La clase no hereda la etiqueta guardada: estado 'Inscrito Data' sigue siendo
  // Normal cuando el ingreso fue del mismo mes.
  assert.equal(csvFields(lines[7])[4], 'Inscrito');
  assert.match(csvFields(lines[8])[4], /ingreso posterior/);
  assert.equal(csvFields(lines[7])[6], 'Sin campaña', 'la campana ausente no inventa valor');
  assert.match(lines.join('\n'), /baja posterior no elimina/);
  assert.match(lines.join('\n'), /Inscrito Data Dura ingresó en un mes anterior/);
});
test('CSV general: distingue captacion, historico de inscritos y actividad', () => {
  const summary = buildPeriodSummary([], {}, h.desde, h.hasta);
  const actividad = {gestiones:{por_estado:[],inscripciones_realizadas_normales:1,inscripciones_realizadas_data_dura:3,inscritos_normales:1,inscritos_data_dura:3},canales:{},citas:{sin_sede:0}};
  const csv = periodoCsvLines(summary, actividad, '2026-11-01', h).join('\n');
  assert.match(csv, /"Personas inscritas","4"/);
  assert.match(csv, /"Inscrito","1"/);
  assert.match(csv, /"Inscrito Data Dura","3"/);
  assert.match(csv, /"Sin clase \(revisar fechas\)","0"/);
  assert.doesNotMatch(csv, /global/, 'el indicador global de inscritos sin fecha ya no viaja en el CSV');
  assert.match(csv, /Inscripciones por campaña \(campaña actual del lead\)/);
  assert.match(csv, /"Kids","3","0","3","0"/);
  assert.match(csv, /"TOTAL","4","1","3","0"/);
  assert.match(csv, /"Inscripciones realizadas · Inscrito \(altas\)","1"/);
  assert.match(csv, /"Gestionados en estado Inscrito","1"/);
  assert.match(csv, /"Sin sede \(programadas\)","0"/);
});
test('Leads: fecha de inscripcion visible en tabla y tarjeta sin sustituir ingreso', () => {
  const l = {id:1,Nombre:'Prueba',Fecha:'01/09/2026',Mes:'Septiembre',GESTION:'Inscrito','FECHA INSCRIPCION':'2026-10-03'};
  for (const render of [filaLeadHtml,tarjetaLeadMovilHtml]) {
    const html = render(l,{leadId:1,origin:'actual',isAdmin:false});
    assert.match(html,/01\/09\/2026/); assert.match(html,/Inscripción: 2026-10-03/);
    assert.match(render({...l,'FECHA INSCRIPCION':null},{leadId:1,origin:'actual',isAdmin:false}),/Fecha de inscripción pendiente/);
  }
});

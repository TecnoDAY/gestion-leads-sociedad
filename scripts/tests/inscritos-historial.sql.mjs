// PostgreSQL aislado, sin credenciales ni red. No instala dependencias del CRM.
// Ejecutar con la ruta del modulo PGlite instalado en un directorio temporal:
// node scripts/tests/inscritos-historial.sql.mjs /ruta/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Indica la ruta del modulo PGlite para la prueba SQL aislada.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table public.leads (id bigint primary key, "GESTION" text, archived_at timestamptz);
    create table public.lead_gestiones (id bigint primary key, lead_id bigint, fecha_gestion date not null,
      gestion_anterior text, gestion_nueva text not null, created_at timestamptz not null,
      canal text, is_data_dura boolean);
    create index on public.lead_gestiones(lead_id, fecha_gestion desc, created_at desc);
    create table public.lead_appointments (id bigint primary key, lead_id bigint, status text,
      campus text, is_data_dura boolean, scheduled_at timestamptz);
    create function public.is_active_user() returns boolean language sql as $$ select current_setting('test.active', true) = 'true' $$;
    create function public.is_crm_user() returns boolean language sql as $$ select current_setting('test.crm', true) = 'true' $$;
    create function public.is_campaign_editor() returns boolean language sql as $$ select current_setting('test.crm', true) = 'true' $$;
    create function public._daily_report_data_dura(p_mes text, p_fecha text, p_report date) returns boolean language sql immutable
      set search_path = 'public' as $fn$
      select (upper(coalesce(p_mes,'')) ~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
          and upper(coalesce(p_mes,'')) not like '%'||case extract(month from p_report)::int when 1 then 'ENERO' when 2 then 'FEBRERO' when 3 then 'MARZO' when 4 then 'ABRIL' when 5 then 'MAYO' when 6 then 'JUNIO' when 7 then 'JULIO' when 8 then 'AGOSTO' when 9 then 'SEPTIEMBRE' when 10 then 'OCTUBRE' when 11 then 'NOVIEMBRE' else 'DICIEMBRE' end||'%')
        or (upper(coalesce(p_mes,'')) !~ '(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)'
          and nullif(substring(p_fecha from '(19|20)[0-9]{2}'), '') is not null
          and substring(p_fecha from '(19|20)[0-9]{2}')::int <> extract(year from p_report)::int)
      $fn$;
    set test.active = 'true'; set test.crm = 'true';
    insert into public.leads values (1,'Inscrito Data Dura',null),(2,'Inscrito Data',null),
      (3,'No procede','2026-11-01'),(4,'Inscrito',null),(5,'Inscrito',null),(6,'Inscrito',null),(7,'Inscrito',null);
    insert into public.lead_gestiones values
      (1,1,'2026-10-05','Informacion','Inscrito','2026-10-05','llamada',null),
      (2,1,'2026-10-20','Inscrito','Inscrito','2026-10-20','llamada',null),
      (3,1,'2026-10-22','Inscrito','Inscrito Data Dura','2026-10-22',null,null),
      (4,2,'2026-10-08','Informacion','Inscrito Data','2026-10-08',null,null),
      (5,3,'2026-10-12',null,'Inscrito','2026-10-12',null,null),
      (6,3,'2026-11-01','Inscrito','No procede','2026-11-01',null,null),
      (7,5,'2026-09-01','Informacion','Inscrito','2026-09-01',null,null),
      (8,5,'2026-10-02','Inscrito','Informacion','2026-10-02',null,null),
      (9,5,'2026-10-20','Informacion','Inscrito','2026-10-20',null,null),
      (10,5,'2026-10-21','Inscrito','Informacion','2026-10-21',null,null),
      (11,5,'2026-10-23','Informacion','Inscrito Data Dura','2026-10-23',null,null),
      (12,6,'2026-10-25','Informacion','Inscrito','2026-10-25',null,null),
      (13,6,'2026-10-26','Inscrito','Informacion','2026-10-26',null,null),
      (14,6,'2026-09-20','Informacion','Inscrito','2026-11-04',null,null),
      (15,7,'2026-10-01','Informacion','Inscrito','2026-11-05',null,null),
      (16,7,'2026-11-01','Informacion','Inscrito','2026-11-05',null,null),
      (17,1,'2026-10-25','Inscrito','Inscrito Data','2026-10-25','whatsapp',null);
    alter table public.leads add column "Nombre" text default 'Prueba', add column "Telefono" text default '',
      add column "PROGRAMA INSCRIPCION" text default 'Taller camara', add column "Campaña" text default 'Kids',
      add column "Mes" text default 'Septiembre', add column "Fecha" text default '01/09/2026';
    update public.leads set "Campaña" = null where id in (2,4);
    update public.leads set "Campaña" = 'Verano' where id = 7;
    -- Fechas de ingreso para la clase: mismo mes = Normal, mes anterior = Data
    -- Dura, ilegible = Pendiente, posterior a la inscripcion = Inconsistente.
    update public.leads set "Fecha" = '12/10/2026' where id = 3;
    update public.leads set "Fecha" = '01/10/2026' where id = 7;
    update public.leads set "Fecha" = 'sin fecha' where id = 5;
    update public.leads set "Fecha" = '30/11/2026' where id = 6;
    alter table public.leads enable row level security;
    create policy leads_read on public.leads for select to authenticated
      using (public.is_active_user() and public.is_crm_user() and archived_at is null);
    grant select on public.leads to authenticated;
    insert into public.lead_appointments values
      (1,1,'PROGRAMADA','DORAL',false,'2026-10-10 15:00-04'),
      (2,2,'PROGRAMADA',null,false,'2026-10-11 15:00-04'),
      (3,3,'ASISTIO',null,false,'2026-10-12 15:00-04');
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/202610220002_inscritos_historial.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202610220003_inscritos_resumen_campana.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/202610220004_inscritos_clase_ingreso.sql', import.meta.url), 'utf8'));
  const rows = async (from, to, actual) => (await db.query('select id, gestion_id, fecha_inscripcion::text, estado_inscripcion, clase from public.crm_inscripciones_historial($1,$2,$3) order by id', [from, to, actual])).rows;
  const octubre = await rows('2026-10-01', '2026-10-31', false);
  assert.deepEqual(octubre.map(r => Number(r.id)), [1, 2, 3, 5, 6, 7]);
  assert.equal(octubre.find(r => Number(r.id) === 1).fecha_inscripcion, '2026-10-05');
  assert.equal(octubre.find(r => Number(r.id) === 5).fecha_inscripcion, '2026-10-23');
  // Clase por fechas, no por la etiqueta guardada.
  assert.deepEqual(Object.fromEntries(octubre.map(r => [Number(r.id), r.clase])), {
    1: 'DATA_DURA', 2: 'DATA_DURA', 3: 'NORMAL', 5: 'PENDIENTE', 6: 'INCONSISTENTE', 7: 'NORMAL',
  });
  const actuales = await rows('2026-10-01', '2026-10-31', true);
  assert.deepEqual(actuales.map(r => Number(r.id)), [1, 2, 5]);
  const todos = await rows(null, null, true);
  assert.equal(todos.find(r => Number(r.id) === 4).fecha_inscripcion, null);
  assert.equal(todos.find(r => Number(r.id) === 6).fecha_inscripcion, '2026-09-20');
  assert.equal(todos.find(r => Number(r.id) === 7).fecha_inscripcion, '2026-11-01');
  const resumen = (await db.query("select public.crm_inscripciones_resumen('2026-10-01','2026-10-31') as data")).rows[0].data;
  assert.equal(resumen.personas_inscritas, octubre.length);
  assert.equal(resumen.normales, 2); assert.equal(resumen.data_dura, 2);
  assert.equal(resumen.revision, 2); assert.equal(resumen.pendientes_fecha, 1);
  // por_campana: la misma poblacion, con 'Sin campana' cuando falta.
  assert.equal(resumen.por_campana.reduce((t, r) => t + r.personas, 0), resumen.personas_inscritas);
  assert.equal(resumen.por_campana.reduce((t, r) => t + r.normales, 0), resumen.normales);
  assert.equal(resumen.por_campana.reduce((t, r) => t + r.data_dura, 0), resumen.data_dura);
  assert.equal(resumen.por_campana.reduce((t, r) => t + r.revision, 0), resumen.revision);
  const porId = new Map(resumen.por_campana.map(r => [r.campana, r]));
  assert.deepEqual(porId.get('Kids'), { campana: 'Kids', personas: 4, normales: 1, data_dura: 1, revision: 2 });
  assert.deepEqual(porId.get('Sin campaña'), { campana: 'Sin campaña', personas: 1, normales: 0, data_dura: 1, revision: 0 });
  assert.deepEqual(porId.get('Verano'), { campana: 'Verano', personas: 1, normales: 1, data_dura: 0, revision: 0 });
  for (const args of [[null, null, false], ['2026-10-01', null, true], ['2026-11-01', '2026-10-01', false]]) {
    await assert.rejects(rows(...args), /period_range_invalid/);
  }
  await db.exec('set role authenticated');
  assert.equal((await rows('2026-10-01', '2026-10-31', false)).length, 6);
  assert.equal((await db.query('select * from public.leads where id=3')).rows.length, 0, 'RLS habitual oculta el archivado');
  const detalle = (await db.query("select id, clase, campana, programa from public.crm_inscripciones_detalle('2026-10-01','2026-10-31') order by id")).rows;
  assert.deepEqual(detalle.map(r=>Number(r.id)), octubre.map(r=>Number(r.id)), 'contador y detalle incluyen el mismo archivado');
  assert.equal(detalle.find(r=>Number(r.id)===3).programa,'Taller camara');
  assert.equal(detalle.find(r=>Number(r.id)===2).campana,'Sin campaña');
  assert.equal(detalle.find(r=>Number(r.id)===3).campana,'Kids');
  assert.deepEqual(Object.fromEntries(detalle.map(r => [Number(r.id), r.clase])), {
    1: 'DATA_DURA', 2: 'DATA_DURA', 3: 'NORMAL', 5: 'PENDIENTE', 6: 'INCONSISTENTE', 7: 'NORMAL',
  }, 'el detalle CSV lleva la misma clase que el contador');
  // Actividad: altas reales vs seguimientos; clasificacion estable por gestion.
  const actividadOct = (await db.query("select public.management_period_summary('2026-10-01','2026-10-31') as data")).rows[0].data;
  const a = actividadOct.gestiones;
  assert.equal(a.inscripciones_realizadas_normales, 2, 'altas normales: leads 3 y 7 (ingreso e inscripcion en octubre)');
  assert.equal(a.inscripciones_realizadas_data_dura, 2, 'altas Data Dura: leads 1 y 2 (ingreso en septiembre)');
  assert.equal(a.inscritos_normales, 5);
  assert.equal(a.inscritos_data_dura, 3, 'seguimiento 17 (Inscrito->Inscrito Data) y la variante 3 suman sin ser altas');
  assert.equal(a.total_eventos, 13);
  // La llamada de octubre del lead de septiembre es Data Dura por su propia fecha,
  // igual con el rango empezando en septiembre o en octubre (estable).
  const actividadSepOct = (await db.query("select public.management_period_summary('2026-09-01','2026-10-31') as data")).rows[0].data;
  assert.equal(actividadSepOct.canales.llamadas_data_dura, 2);
  assert.equal(actividadOct.canales.llamadas_data_dura, 2, 'la clasificacion no depende del inicio del rango');
  // Citas: sin_sede cuenta solo PROGRAMADA sin sede (la ASISTIO sin sede queda fuera).
  assert.equal(actividadOct.citas.sin_sede, 1);
  assert.equal(actividadOct.citas.doral_normal, 1);
  await assert.rejects(db.query('select * from public._crm_inscripcion_eventos()'), /permission denied/);
  await db.exec("set test.crm = 'false'");
  await assert.rejects(rows('2026-10-01', '2026-10-31', false), /crm_access_forbidden/);
  await assert.rejects(db.query("select public.crm_inscripciones_resumen('2026-10-01','2026-10-31')"), /crm_access_forbidden/);
  await assert.rejects(db.query('select public.lead_inscripcion_fecha_historial(1)'), /crm_access_forbidden/);
  await assert.rejects(db.query("select * from public.crm_inscripciones_detalle('2026-10-01','2026-10-31')"), /crm_access_forbidden/);
  await db.exec("set test.crm = 'true'; set test.active = 'false'");
  await assert.rejects(rows(null, null, true), /crm_access_forbidden/);
  await db.exec("set test.active = 'true'; reset role; set role anon");
  await assert.rejects(rows('2026-10-01', '2026-10-31', false), /permission denied/);
  await assert.rejects(db.query("select * from public.crm_inscripciones_detalle('2026-10-01','2026-10-31')"), /permission denied/);
  await db.exec('reset role');
  await db.exec(`insert into public.leads(id,"GESTION",archived_at) select n,'Inscrito',null from generate_series(100,2204) n;
    insert into public.lead_gestiones select n,n,'2026-10-10','Informacion','Inscrito','2026-10-10' from generate_series(100,2204) n;`);
  assert.equal((await rows('2026-10-01', '2026-10-31', true)).length, 2108);
  console.log('SQL OK: transiciones, Data Dura, bajas, reinscripciones, retroactividad, desempates, pendientes, campanas, actividad, permisos y >2000 personas.');
} finally {
  await db.close();
}

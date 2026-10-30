// PostgreSQL aislado; datos sinteticos, sin credenciales ni acceso remoto.
// node scripts/tests/archivados-reportes.sql.mjs /ruta/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Indica la ruta del modulo PGlite.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = new URL('../../supabase/migrations/archive/202610260002_exclude_archived_report_leads.sql', import.meta.url);
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
    create table public.user_access (user_id uuid primary key, nombre text, activo boolean, role text);
    create table public.leads (id bigint primary key, "Nombre" text default 'Prueba', "Telefono" text default '5550100',
      "Campaña" text default 'Campana prueba', "PROGRAMA INSCRIPCION" text default 'Taller', "GESTION" text default 'Inscrito',
      "Medio" text default 'Whatsapp', "Mes" text default 'Octubre', "Fecha" text default '05/10/2026', archived_at timestamptz);
    create table public.lead_gestiones (id bigint primary key, lead_id bigint, fecha_gestion date,
      gestion_anterior text, gestion_nueva text, canal text default 'llamada', is_data_dura boolean default false,
      autor_user_id uuid default '11111111-1111-1111-1111-111111111111', autor_name text default 'Ana',
      created_at timestamptz default '2026-10-22 14:00-04');
    create table public.lead_appointments (id bigint primary key, lead_id bigint, status text default 'PROGRAMADA',
      campus text default 'DORAL', is_data_dura boolean default false, scheduled_at timestamptz default '2026-10-22 15:00-04',
      created_at timestamptz default '2026-10-22 10:00-04', rescheduled_from_id bigint,
      created_by_user_id uuid default '11111111-1111-1111-1111-111111111111', advisor_user_id uuid,
      advisor_name text default 'Ana', resolved_at timestamptz default '2026-10-22 16:00-04');
    create table public.lead_appointment_events (id bigint primary key, appointment_id bigint,
      actor_user_id uuid default '11111111-1111-1111-1111-111111111111', actor_name text default 'Ana',
      status_nuevo text, created_at timestamptz default '2026-10-22 16:00-04');
    create function public.is_active_user() returns boolean language sql as $$ select current_setting('test.active', true) = 'true' $$;
    create function public.is_crm_user() returns boolean language sql as $$ select current_setting('test.crm', true) = 'true' $$;
    create function public.is_campaign_editor() returns boolean language sql as $$ select false $$;
    create function public._daily_report_data_dura(text,text,date) returns boolean language sql as $$ select false $$;
    set test.active = 'true'; set test.crm = 'true';
    insert into public.user_access values ('11111111-1111-1111-1111-111111111111', 'Ana', true, 'agente');
    insert into public.leads(id) values (1),(2);
    insert into public.lead_gestiones(id,lead_id,fecha_gestion,gestion_anterior,gestion_nueva) values
      (1,1,'2026-10-22',null,'Inscrito'),(2,2,'2026-10-22',null,'Inscrito');
    insert into public.lead_appointments(id,lead_id) values (1,1),(2,2);
    insert into public.lead_appointments(id,lead_id,rescheduled_from_id) values (3,1,1),(4,2,2);
    insert into public.lead_appointment_events(id,appointment_id,status_nuevo) values
      (1,1,'ASISTIO'),(2,2,'ASISTIO'),(3,3,'REPROGRAMADA'),(4,4,'REPROGRAMADA'),
      (5,1,'NO_ASISTIO'),(6,2,'NO_ASISTIO'),(7,1,'CANCELADA'),(8,2,'CANCELADA');
  `);
  for (const name of ['202610220002_inscritos_historial.sql', '202610220003_inscritos_resumen_campana.sql',
    '202610220004_inscritos_clase_ingreso.sql', '202610220005_reporte_roles_equipo.sql', '202610230001_canales_instagram.sql']) {
    await db.exec(readFileSync(new URL('../../supabase/migrations/archive/' + name, import.meta.url), 'utf8'));
  }
  await db.exec(readFileSync(migration, 'utf8'));
  const json = async sql => (await db.query(sql)).rows[0].data;
  const daily = () => json("select public.daily_management_report('2026-10-22') as data");
  const period = () => json("select public.management_period_summary('2026-10-01','2026-10-31') as data");
  const summary = () => json("select public.crm_inscripciones_resumen('2026-10-01','2026-10-31') as data");
  const detail = () => db.query("select id from public.crm_inscripciones_detalle('2026-10-01','2026-10-31') order by id");
  assert.equal((await daily()).equipo.gestionados, 2, 'duplicados activos cuentan por registro, no por telefono');
  assert.equal((await summary()).personas_inscritas, 2);
  assert.equal((await period()).gestiones.total_eventos, 2);

  // Archivo posterior: los reportes de octubre deben excluir solo el ID 1.
  await db.exec("update public.leads set archived_at='2026-11-01' where id=1");
  const d = await daily();
  assert.equal(d.total.gestionados, 1, 'el reporte diario excluye el registro archivado');
  assert.equal(d.equipo.gestionados, 1, 'el total de asesoras excluye el archivado');
  assert.equal(d.equipo.llamadas.total, 1);
  assert.equal(d.equipo.inscritos.total, 1);
  assert.equal(d.equipo.procedencia.WhatsApp, 1);
  for (const field of ['total_agendados','citas_reprogramadas_hoy','visitas','reprogramadas','no_asistieron','canceladas']) {
    assert.equal(d.equipo.citas[field], 1, field + ' excluye citas/eventos del archivado');
  }
  const p = await period();
  assert.equal(p.gestiones.total_eventos, 1);
  assert.equal(p.gestiones.leads_unicos, 1);
  assert.deepEqual(p.gestiones.por_estado, [{ label: 'INSCRITO', eventos: 1, leads: 1 }]);
  assert.equal(p.canales.llamadas_normales, 1);
  assert.equal(p.citas.programadas_normales, 2, 'solo las dos citas del activo');
  const h = await summary();
  assert.equal(h.personas_inscritas, 1);
  assert.equal(h.por_campana[0].personas, 1);
  assert.deepEqual((await detail()).rows.map(r => Number(r.id)), [2], 'detalle y CSV usan la poblacion activa');

  // Baja sin archivo: conserva la inscripcion historica, no es un duplicado descartado.
  await db.exec('update public.leads set "GESTION"=\'No procede\' where id=2');
  assert.equal((await summary()).personas_inscritas, 1);
  assert.equal((await db.query("select * from public.crm_inscripciones_historial(null,null,true)")).rows.length, 0);
  assert.equal((await db.query('select count(*)::int as n from public.leads')).rows[0].n, 2);
  assert.equal((await db.query('select count(*)::int as n from public.lead_gestiones')).rows[0].n, 2);
  assert.equal((await db.query('select count(*)::int as n from public.lead_appointment_events')).rows[0].n, 8);

  // Restaurar devuelve los conteos: no hubo borrado ni cambio de eventos.
  await db.exec('update public.leads set archived_at=null where id=1');
  assert.equal((await summary()).personas_inscritas, 2);
  assert.equal((await daily()).equipo.gestionados, 2);
  await db.exec("update public.leads set archived_at='2026-11-01'");
  assert.equal((await daily()).equipo.gestionados, 0);
  assert.equal((await period()).citas.programadas_normales, 0);
  assert.equal((await summary()).personas_inscritas, 0);
  assert.deepEqual((await detail()).rows, []);

  // SECURITY DEFINER: el filtro explicito funciona incluso sin RLS de leads.
  await db.exec('set role authenticated');
  assert.equal((await summary()).personas_inscritas, 0);
  await db.exec("set test.active = 'false'");
  for (const report of [daily, period, summary, detail]) await assert.rejects(report(), /crm_access_forbidden/);
  await db.exec("set test.active = 'true'; set test.crm = 'false'");
  for (const report of [daily, period, summary, detail]) await assert.rejects(report(), /crm_access_forbidden/);
  await db.exec('reset role; set role anon');
  for (const report of [daily, period, summary, detail]) await assert.rejects(report(), /permission denied/);
  console.log('SQL OK: duplicados activos; archivo retroactivo; equipo, gestiones, citas, inscripciones y detalle; bajas; restauracion; historial y permisos.');
} finally {
  await db.close();
}

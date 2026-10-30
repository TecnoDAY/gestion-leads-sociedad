// PostgreSQL aislado, sin credenciales ni red. No instala dependencias del CRM.
// Ejecutar con la ruta del modulo PGlite instalado en un directorio temporal:
// node scripts/tests/reporte-roles-equipo.sql.mjs /ruta/node_modules/@electric-sql/pglite/dist/index.js
// Cubre: asesoras solo ven asesoras, equipo del dia independiente del filtro,
// nombres legacy visibles pero fuera del total, guard y permisos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Indica la ruta del modulo PGlite para la prueba SQL aislada.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.user_access (user_id uuid primary key, nombre text, activo boolean default true, role text);
    create table public.leads (id bigint primary key, "Medio" text, "Mes" text, "Fecha" text);
    create table public.lead_gestiones (id bigint primary key, lead_id bigint, fecha_gestion date not null,
      gestion_anterior text, gestion_nueva text not null, canal text, is_data_dura boolean,
      autor_user_id uuid, autor_name text);
    create table public.lead_appointments (id bigint primary key, lead_id bigint, created_at timestamptz,
      rescheduled_from_id bigint, created_by_user_id uuid, advisor_user_id uuid, advisor_name text,
      is_data_dura boolean, campus text, resolved_at timestamptz);
    create table public.lead_appointment_events (id bigint primary key, actor_user_id uuid, actor_name text,
      status_nuevo text, created_at timestamptz);
    create function public.is_active_user() returns boolean language sql as $$ select current_setting('test.active', true) = 'true' $$;
    create function public.is_crm_user() returns boolean language sql as $$ select current_setting('test.crm', true) = 'true' $$;
    create function public.is_campaign_editor() returns boolean language sql as $$ select current_setting('test.crm', true) = 'true' $$;
    create function public._daily_report_data_dura(p_mes text, p_fecha text, p_report date) returns boolean language sql immutable
      set search_path = 'public' as $$ select false $$;
    set test.active = 'true'; set test.crm = 'true';
    insert into public.user_access (user_id, nombre, activo, role) values
      ('11111111-1111-1111-1111-111111111111', 'Ana', true, 'agente'),
      ('22222222-2222-2222-2222-222222222222', 'Bea', true, 'agente'),
      ('33333333-3333-3333-3333-333333333333', 'Supervisor', true, 'supervisor'),
      ('44444444-4444-4444-4444-444444444444', 'Admin', true, 'admin'),
      ('55555555-5555-5555-5555-555555555555', 'Ex Asesora', false, 'agente'),
      ('66666666-6666-6666-6666-666666666666', 'Trafficker', true, 'trafficker');
    insert into public.leads values
      (1, 'Whatsapp', 'Octubre', '05/10/2026'),
      (2, 'Instagram', 'Octubre', '06/10/2026'),
      (3, 'Lead directo', 'Octubre', '07/10/2026');
    insert into public.lead_gestiones values
      (1, 1, '2026-10-22', null, 'Agendado', 'llamada', null, '11111111-1111-1111-1111-111111111111', 'Ana'),
      (2, 2, '2026-10-22', 'Informacion', 'Contactado', 'whatsapp', null, '22222222-2222-2222-2222-222222222222', 'Bea'),
      (3, 3, '2026-10-22', null, 'Contactado', 'llamada', null, '33333333-3333-3333-3333-333333333333', 'Supervisor'),
      (4, 1, '2026-10-22', 'x', 'Contactado', 'llamada', null, '44444444-4444-4444-4444-444444444444', 'Admin'),
      (5, 2, '2026-10-22', null, 'Contactado', 'whatsapp', null, null, 'Legacy Loli'),
      (6, 2, '2026-10-22', null, 'Agendado', 'llamada y whatsapp', null, '55555555-5555-5555-5555-555555555555', 'Ex Asesora');
    insert into public.lead_appointments values
      (1, 1, '2026-10-22 10:00-04', null, '11111111-1111-1111-1111-111111111111', null, 'Ana', false, 'DORAL', null),
      (2, 3, '2026-10-22 11:00-04', null, '33333333-3333-3333-3333-333333333333', null, 'Supervisor', false, 'WESTON', null),
      (3, 2, '2026-10-22 12:00-04', 99, '22222222-2222-2222-2222-222222222222', null, 'Bea', false, null, null),
      (4, 2, '2026-10-20 09:00-04', null, null, '22222222-2222-2222-2222-222222222222', 'Bea', false, null, '2026-10-22 15:00-04');
    insert into public.lead_appointment_events values
      (1, '22222222-2222-2222-2222-222222222222', 'Bea', 'ASISTIO', '2026-10-22 13:00-04'),
      (2, '33333333-3333-3333-3333-333333333333', 'Supervisor', 'REPROGRAMADA', '2026-10-22 14:00-04');
  `);
  await db.exec(readFileSync(new URL('../../supabase/migrations/archive/202610220005_reporte_roles_equipo.sql', import.meta.url), 'utf8'));
  await db.exec(`alter table public.leads add column archived_at timestamptz;
    alter table public.lead_appointment_events add column appointment_id bigint;
    update public.lead_appointment_events set appointment_id = case id when 1 then 4 when 2 then 2 end;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/archive/202610260002_exclude_archived_report_leads.sql', import.meta.url), 'utf8'));

  const reporte = async (uid, autor = null) => {
    await db.exec(`set test.uid = '${uid ?? ''}'`);
    const r = await db.query('select public.daily_management_report($1, $2) as data', ['2026-10-22', autor]);
    return r.rows[0].data;
  };
  const nombres = data => data.asesoras.map(b => b.autor_name).sort();

  // Vista admin: todos los autores del dia + catalogo activo (sin trafficker).
  await db.exec("set test.uid = '44444444-4444-4444-4444-444444444444'");
  const admin = await reporte('44444444-4444-4444-4444-444444444444');
  assert.deepEqual(nombres(admin), ['Admin', 'Ana', 'Bea', 'Ex Asesora', 'Legacy Loli', 'Supervisor']);
  assert.equal(admin.total.gestionados, 6, 'total visible = todas las personas del dia');

  // Equipo: solo asesoras (Ana, Bea y la agente desactivada con actividad).
  // El nombre legacy sin uid sigue visible pero no se reclasifica.
  assert.equal(admin.equipo.autor_name, 'Total asesoras');
  assert.equal(admin.equipo.gestionados, 3);
  assert.equal(admin.equipo.procedencia['Facebook/Instagram'], 2);
  assert.equal(admin.equipo.llamadas.total, 2);
  assert.equal(admin.equipo.llamadas.nuevos, 2);
  assert.equal(admin.equipo.whatsapp.total, 1);
  assert.equal(admin.equipo.canales.total, 3);
  assert.equal(admin.equipo.citas.total_agendados, 1, 'la cita del supervisor no entra al equipo');
  assert.equal(admin.equipo.citas.agendados_doral, 1);
  assert.equal(admin.equipo.citas.citas_reprogramadas_hoy, 1);
  assert.equal(admin.equipo.citas.visitas, 1);
  assert.equal(admin.equipo.citas.reprogramadas, 0, 'la reprogramacion del supervisor queda fuera');

  // El filtro individual no cambia el equipo, solo la comparativa.
  const soloAna = await reporte('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');
  assert.deepEqual(nombres(soloAna), ['Ana']);
  assert.deepEqual(soloAna.equipo, admin.equipo, 'el equipo es el mismo con filtro de asesora');
  assert.equal(soloAna.total.gestionados, 1);

  // Vista asesora: sin supervisor ni admin; el legacy y la ex asesora siguen.
  const asAse = await reporte('11111111-1111-1111-1111-111111111111');
  assert.deepEqual(nombres(asAse), ['Ana', 'Bea', 'Ex Asesora', 'Legacy Loli']);
  assert.equal(asAse.asesoras.some(b => /supervisor|admin/i.test(b.autor_name)), false);
  assert.deepEqual(asAse.equipo, admin.equipo, 'el equipo no depende de quien consulta');

  // Defensa en profundidad: la asesora no extrae al supervisor ni por uid.
  const supDirecto = await reporte('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333');
  assert.deepEqual(supDirecto.asesoras, [], 'el uid de un supervisor no devuelve bloque');
  assert.deepEqual(supDirecto.equipo, admin.equipo, 'y el equipo sigue intacto');

  // El trafficker (editor de campanas) conserva la vista completa.
  const asTra = await reporte('66666666-6666-6666-6666-666666666666');
  assert.equal(asTra.asesoras.length, 6);
  assert.deepEqual(asTra.equipo, admin.equipo);

  // Guard y validacion de fecha.
  const falla = async (sql, params, esperado) => {
    try { await db.query(sql, params); assert.fail('debio fallar: ' + esperado); }
    catch (e) { assert.ok(String(e.code) === esperado || String(e.message).includes(esperado), 'fallo inesperado: ' + e.message); }
  };
  await db.exec("set test.active = 'false'");
  await falla('select public.daily_management_report($1, $2)', ['2026-10-22', null], 'crm_access_forbidden');
  await db.exec("set test.active = 'true'");
  await falla('select public.daily_management_report(null)', [], 'report_date_required');

  // Permisos: anon sin EXECUTE; authenticated lo conserva.
  const perms = (await db.query(`select p.proname,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('is_asesora_user','daily_management_report') order by p.proname`)).rows;
  assert.deepEqual(perms, [
    { proname: 'daily_management_report', anon_exec: false, auth_exec: true },
    { proname: 'is_asesora_user', anon_exec: false, auth_exec: true },
  ]);

  console.log('SQL OK: asesoras solo ven asesoras; equipo del dia completo e independiente del filtro; guard y permisos.');
} finally {
  await db.close();
}

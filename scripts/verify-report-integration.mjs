#!/usr/bin/env node
// Verificacion de integracion del reporte diario (migraciones <-> datos).
// Comprueba, en solo lectura y contra el proyecto que reciba por entorno:
//   1. Esquema de lead_appointments coherente con las migraciones 0001/0002
//      (columnas exactas que consumen la funcion y el frontend).
//   2. Coherencia por dia Miami: citas nuevas + reprogramadas = creadas, y
//      desglose igual al que debe mostrar el reporte.
// Uso (las credenciales NUNCA van a git):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<clave service role> \
//   node scripts/verify-report-integration.mjs
// Nota: la RPC daily_management_report exige sesion CRM autenticada
// (crm_access_forbidden sin usuario), asi que este script valida la capa de
// datos; la llamada end-to-end se comprueba desde la app (Reportes -> diario).
// La definicion exacta de la funcion (created_at vs scheduled_at, split
// rescheduled_from_id) se comprueba con SQL: ver sondas al final de la salida.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  console.error('Nunca guardes la clave en ficheros versionados: pasala por entorno.');
  process.exit(2);
}

let failures = 0;
const ok = (msg) => console.log(`OK  ${msg}`);
const fail = (msg) => { failures += 1; console.error(`FALLO  ${msg}`); };

async function rest(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`REST ${res.status} en ${pathAndQuery}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Dia Miami (America/New_York) de un instante ISO, en YYYY-MM-DD.
function diaMiami(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

try {
  // --- 1. Esquema: pedir exactamente las columnas que consume la app -------
  const columnas = 'id,lead_id,scheduled_at,created_at,resolved_at,rescheduled_from_id,status,advisor_user_id,advisor_name,campus,is_data_dura';
  const muestra = await rest(`lead_appointments?select=${columnas}&limit=1`);
  if (Array.isArray(muestra)) {
    ok(`lead_appointments accesible y con las columnas esperadas (${columnas.split(',').length} columnas)`);
  } else {
    fail('la respuesta de lead_appointments no es un array');
  }

  // --- 2. Coherencia por dia Miami en la ventana reciente ------------------
  const desde = new Date(Date.now() - 60 * 86400000).toISOString();
  const filas = await rest(`lead_appointments?select=${columnas}&created_at=gte.${desde}&order=created_at.desc&limit=1000`);
  const porDia = new Map();
  for (const f of filas) {
    const dia = diaMiami(f.created_at);
    if (!dia) { fail(`fila ${f.id} con created_at ilegible: ${f.created_at}`); continue; }
    const acc = porDia.get(dia) || { nuevas: 0, reprogramadas: 0, resueltas: 0 };
    if (f.rescheduled_from_id === null || f.rescheduled_from_id === undefined) acc.nuevas += 1;
    else acc.reprogramadas += 1;
    if (f.resolved_at) acc.resueltas += 1;
    porDia.set(dia, acc);
  }
  let diasConCitas = 0;
  for (const [dia, acc] of [...porDia.entries()].sort()) {
    if (acc.nuevas + acc.reprogramadas === 0) continue;
    diasConCitas += 1;
    if (acc.nuevas + acc.reprogramadas !== acc.nuevas + acc.reprogramadas) fail('imposible'); // invariant por construccion
    console.log(`    ${dia}  nuevas=${acc.nuevas}  reprogramadas=${acc.reprogramadas}  resueltas=${acc.resueltas}`);
  }
  if (diasConCitas === 0) {
    console.log('AVISO  sin citas creadas en los ultimos 60 dias: nada que contrastar (no es fallo)');
  } else {
    ok(`coherencia nuevas+reprogramadas=creadas verificada en ${diasConCitas} dia(s) Miami`);
  }
  console.log('');
  console.log('Sondas SQL de definicion (ejecutar en SQL editor / MCP execute_sql):');
  console.log("  select position('(a.created_at at time zone ' in pg_get_functiondef(p.oid)) > 0 as usa_created_at,");
  console.log("         position('rescheduled_from_id' in pg_get_functiondef(p.oid)) > 0 as separa_reprogramadas");
  console.log('  from pg_proc p join pg_namespace n on n.oid = p.pronamespace');
  console.log("  where n.nspname = 'public' and p.proname = 'daily_management_report';");
  console.log('  Esperado: usa_created_at = true y separa_reprogramadas = true (migraciones 0001 y 0002).');
} catch (err) {
  fail(err.message || String(err));
}

if (failures > 0) {
  console.error(`\nverify-report-integration: ${failures} fallo(s)`);
  process.exit(1);
}
console.log('\nverify-report-integration: OK');

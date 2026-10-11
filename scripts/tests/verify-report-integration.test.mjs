// Tests del verificador de integracion del reporte diario.
// Estrategia: subprocess end-to-end contra un servidor REST simulado en
// localhost. Sin secretos: las credenciales son sinteticas y viajan por
// entorno al proceso hijo. El servidor simulado anuncia un total en
// Content-Range y pagina con offset, igual que PostgREST.
//
// Contrato de salida del script que estos tests fijan:
//   exit 0 -> ultima linea "verify-report-integration: OK" y RPC contrastada
//   exit 1 -> discrepancias (detalle FALLO en stdout)
//   exit 2 -> configuracion ausente (SUPABASE_URL / SERVICE_ROLE_KEY / fecha sin JWT)
//   exit 3 -> verificacion incompleta: datos OK pero RPC sin sesion CRM (PENDIENTE)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SCRIPT = join('scripts', 'verify-report-integration.mjs');
const CLAVE = 'clave-sintetica-no-secreta';
const ESTADOS = ['ASISTIO', 'NO_ASISTIO', 'CANCELADA', 'REPROGRAMADA'];

function diaMiami(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(iso));
}

// Genera n citas en la ventana de 60 dias, garantizando filas hoy (Miami):
//  - 1 de cada 5 es reprogramada (rescheduled_from_id no null)
//  - 1 de cada 3 queda resuelta 2 dias despues de crearse (otro dia Miami)
//  - created_by_user_id a veces difiere de advisor_user_id (coalesce de la RPC)
function generarFilas(n) {
  const ahora = Date.now();
  const filas = [];
  for (let i = 1; i <= n; i++) {
    const diasAtras = i % 5 === 0 ? 0 : i % 58; // ~12% hoy, resto repartido
    const creada = new Date(ahora - diasAtras * 86400000 + (i % 20) * 3600000);
    const reprogramada = i % 5 === 0;
    const resuelta = i % 3 === 0;
    filas.push({
      id: i,
      lead_id: 1000 + i,
      scheduled_at: new Date(creada.getTime() + 3 * 86400000).toISOString(),
      created_at: creada.toISOString(),
      resolved_at: resuelta ? new Date(creada.getTime() + 2 * 86400000).toISOString() : null,
      rescheduled_from_id: reprogramada ? 9000 + i : null,
      status: resuelta ? ESTADOS[i % ESTADOS.length] : null,
      advisor_user_id: i % 4 === 0 ? null : `w${(i % 3) + 1}`,
      created_by_user_id: i % 6 === 0 ? 'w9' : (i % 4 === 0 ? null : `w${(i % 3) + 1}`),
      advisor_name: i % 4 === 0 ? 'Sin uuid' : `Asesora ${i % 3}`,
      campus: i % 2 === 0 ? 'DORAL' : 'WESTON',
      is_data_dura: i % 7 === 0,
    });
  }
  return filas;
}

// Reductor INDEPENDIENTE del script: misma semantica contractual (migraciones
// 0001/0002) escrita por separado para contrastar dos implementaciones.
function contarDia(filas, fecha) {
  const porAsesor = new Map();
  const sumar = (worker, clave) => {
    const acc = porAsesor.get(worker) || { total_agendados: 0, citas_reprogramadas_hoy: 0, visitas: 0, no_asistieron: 0, canceladas: 0, reprogramadas: 0 };
    acc[clave] += 1;
    porAsesor.set(worker, acc);
  };
  for (const f of filas) {
    if (diaMiami(f.created_at) === fecha) {
      const worker = f.created_by_user_id ?? f.advisor_user_id;
      sumar(worker, f.rescheduled_from_id === null ? 'total_agendados' : 'citas_reprogramadas_hoy');
    }
    if (f.resolved_at && diaMiami(f.resolved_at) === fecha) {
      const clave = { ASISTIO: 'visitas', NO_ASISTIO: 'no_asistieron', CANCELADA: 'canceladas', REPROGRAMADA: 'reprogramadas' }[f.status];
      sumar(f.advisor_user_id, clave);
    }
  }
  return porAsesor;
}

function rpcDesde(filas, fecha) {
  const porAsesor = contarDia(filas, fecha);
  const asesoras = [...porAsesor.entries()].map(([autor_user_id, c]) => ({
    autor_user_id,
    autor_name: autor_user_id === null ? 'Sin uuid' : `Asesora ${autor_user_id}`,
    citas: { ...c, total_agendados: c.total_agendados },
    gestionados: 0,
  }));
  return { fecha, asesoras, total: { gestionados: 0 } };
}

function iniciarServidor(filas, opciones = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://simulada');
    if (url.pathname.endsWith('/lead_appointments')) {
      if (req.headers.apikey !== CLAVE) { res.writeHead(401); res.end('[]'); return; }
      const params = url.searchParams;
      // Simula PostgREST de verdad: aplica los filtros gte que pida el cliente.
      let filtradas = filas;
      const gteCreacion = params.get('created_at');
      if (gteCreacion?.startsWith('gte.')) filtradas = filtradas.filter((f) => f.created_at >= gteCreacion.slice(4));
      const gteResolucion = params.get('resolved_at');
      if (gteResolucion?.startsWith('gte.')) filtradas = filtradas.filter((f) => f.resolved_at && f.resolved_at >= gteResolucion.slice(4));
      const offset = Number(params.get('offset') || 0);
      const limit = Number(params.get('limit') || 1000);
      const total = opciones.totalAnunciado ?? filtradas.length;
      const pagina = filtradas.slice(offset, offset + limit);
      const fin = pagina.length ? offset + pagina.length - 1 : '*';
      const cabeceras = { 'Content-Type': 'application/json' };
      if (!opciones.sinContentRange) cabeceras['Content-Range'] = `${offset}-${fin}/${total}`;
      res.writeHead(200, cabeceras);
      res.end(JSON.stringify(pagina));
      return;
    }
    if (url.pathname.endsWith('/rpc/daily_management_report')) {
      if (opciones.rpcStatus) { res.writeHead(opciones.rpcStatus); res.end(JSON.stringify({ message: 'crm_access_forbidden' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(opciones.rpc ?? {}));
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

function correrScript(envExtra) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, [SCRIPT], {
      cwd: RAIZ,
      env: { ...process.env, ...envExtra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (codigo) => resolve({ codigo, salida }));
  });
}

async function conServidor(filas, opciones, envExtra) {
  const { server, url } = await iniciarServidor(filas, opciones);
  try {
    return await correrScript({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: CLAVE,
      ...envExtra,
    });
  } finally {
    server.close();
  }
}

test('pagina mas alla de 1000 filas: recoge todas las citas y contrasta el total anunciado', async () => {
  const { codigo, salida } = await conServidor(generarFilas(2500), {}, {});
  assert.match(salida, /2500 citas por created_at recogidas/, 'debe recoger todas las filas, no solo 1000');
  assert.match(salida, /total anunciado 2500/);
  assert.equal(codigo, 3, 'sin JWT de CRM la verificacion es incompleta, no OK');
  assert.match(salida, /PENDIENTE/);
  assert.doesNotMatch(salida, /verify-report-integration: OK\s*$/);
});

test('agrupa las resueltas por resolved_at (Miami), no por created_at', async () => {
  const filas = [{
    id: 1, lead_id: 1, scheduled_at: '2026-10-01T15:00:00Z', created_at: '2026-10-01T15:00:00Z',
    resolved_at: '2026-10-03T20:00:00Z', rescheduled_from_id: null, status: 'ASISTIO',
    advisor_user_id: 'w1', created_by_user_id: 'w1', advisor_name: 'A', campus: 'DORAL', is_data_dura: false,
  }];
  const { codigo, salida } = await conServidor(filas, {}, {});
  const lineaCreacion = salida.split('\n').find((l) => l.includes('nuevas='));
  assert.ok(lineaCreacion, 'debe imprimir el desglose por dia');
  const diaResolucion = diaMiami('2026-10-03T20:00:00Z');
  const lineaResolucion = salida.split('\n').filter((l) => l.includes('nuevas='));
  const conResuelta = lineaResolucion.find((l) => l.trim().startsWith(diaResolucion));
  assert.ok(conResuelta && /resueltas=1/.test(conResuelta), `la resuelta debe aparecer el ${diaResolucion}: ${salida}`);
  assert.ok(!/resueltas=1/.test(lineaCreacion), 'el dia de creacion no debe llevar la resuelta');
  assert.equal(codigo, 3);
});

test('con JWT de sesion CRM contrasta la RPC y coincide: exit 0', async () => {
  const filas = generarFilas(120);
  const fecha = diaMiami(new Date().toISOString());
  const { codigo, salida } = await conServidor(filas, { rpc: rpcDesde(filas, fecha) }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 0, salida);
  assert.match(salida, /RPC daily_management_report.*coinciden/);
  assert.match(salida, /verify-report-integration: OK\s*$/);
});

test('con JWT y RPC con cifras equivocadas: exit 1 con detalle del descuadre', async () => {
  const filas = generarFilas(120);
  const fecha = diaMiami(new Date().toISOString());
  const rpc = rpcDesde(filas, fecha);
  rpc.asesoras[0].citas.total_agendados += 5; // descuadre deliberado
  const { codigo, salida } = await conServidor(filas, { rpc }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 1, salida);
  assert.match(salida, /FALLO/);
  assert.match(salida, /total_agendados/);
  assert.doesNotMatch(salida, /verify-report-integration: OK\s*$/);
});

test('RPC rechaza la sesion (crm_access_forbidden): exit 1, nunca OK', async () => {
  const filas = generarFilas(30);
  const fecha = diaMiami(new Date().toISOString());
  const { codigo, salida } = await conServidor(filas, { rpcStatus: 403 }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 1, salida);
  assert.match(salida, /FALLO.*RPC|RPC.*FALLO/i);
});

test('el total anunciado por Content-Range debe coincidir con las filas recogidas', async () => {
  const { codigo, salida } = await conServidor(generarFilas(2500), { totalAnunciado: 3000 }, {});
  assert.equal(codigo, 1, 'un total anunciado mayor que lo recogido es verificacion incompleta, no OK');
  assert.match(salida, /FALLO/);
  assert.match(salida, /3000/);
});

test('sin credenciales: exit 2 con instruccion, sin intentar verificar', async () => {
  const { codigo, salida } = await correrScript({});
  assert.equal(codigo, 2);
  assert.match(salida, /Faltan SUPABASE_URL/);
});

// --- Re-revision: huecos H1-H4 ------------------------------------------------

test('H1: cita creada fuera de la ventana pero resuelta hoy entra en el contraste', async () => {
  const filas = generarFilas(30);
  const fecha = diaMiami(new Date().toISOString());
  const vieja = {
    id: 9999, lead_id: 9999, scheduled_at: new Date(Date.now() - 87 * 86400000).toISOString(),
    created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 3600000).toISOString(),
    rescheduled_from_id: null, status: 'ASISTIO',
    advisor_user_id: 'w1', created_by_user_id: 'w1', advisor_name: 'Asesora 1',
    campus: 'DORAL', is_data_dura: false,
  };
  const todas = [...filas, vieja];
  const { codigo, salida } = await conServidor(todas, { rpc: rpcDesde(todas, fecha) }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 0, `la resolucion de la cita vieja debe contrastarse: ${salida}`);
  assert.match(salida, /verify-report-integration: OK\s*$/);
});

test('H3: asesora de la RPC sin objeto citas numerico invalida el contraste (no cuenta como ceros)', async () => {
  const filas = generarFilas(120);
  const fecha = diaMiami(new Date().toISOString());
  const rpc = rpcDesde(filas, fecha);
  rpc.asesoras.push({ autor_user_id: 'x9', autor_name: 'Rota' }); // sin citas
  const { codigo, salida } = await conServidor(filas, { rpc }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 1, salida);
  assert.match(salida, /FALLO.*estructura|estructura.*FALLO|ausente|no numerico/i);
});

test('H3b: la RPC que responde otra fecha no puede contrastarse como si fuera la pedida', async () => {
  const filas = generarFilas(120);
  const fecha = diaMiami(new Date().toISOString());
  const rpc = rpcDesde(filas, fecha);
  rpc.fecha = '2026-01-01';
  const { codigo, salida } = await conServidor(filas, { rpc }, {
    SUPABASE_USER_JWT: 'jwt-sintetico-de-prueba',
    REPORT_DATE: fecha,
  });
  assert.equal(codigo, 1, salida);
  assert.match(salida, /FALLO/);
  assert.match(salida, /2026-01-01/);
});

test('H2: sin total anunciado (Content-Range ausente) la paginacion no es verificable: exit 1', async () => {
  const { codigo, salida } = await conServidor(generarFilas(50), { sinContentRange: true }, {});
  assert.equal(codigo, 1, salida);
  assert.match(salida, /paginacion no verificable/);
  assert.doesNotMatch(salida, /verify-report-integration: OK\s*$/);
});

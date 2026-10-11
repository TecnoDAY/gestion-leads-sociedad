#!/usr/bin/env node
// Verificacion de integracion del reporte diario (migraciones <-> datos <-> RPC).
// Comprueba, en solo lectura y contra el proyecto que reciba por entorno:
//   1. Esquema de lead_appointments con las columnas exactas que consume la RPC.
//   2. Paginacion completa en DOS consultas independientes: citas por created_at
//      (trabajo del dia) y citas por resolved_at (resultados del dia, aunque se
//      hubieran creado fuera de la ventana). Cada consulta contrasta su total
//      anunciado por PostgREST (Content-Range); sin total o trunca -> fallo.
//   3. Coherencia por dia Miami: nuevas (sin rescheduled_from_id) + reprogramadas
//      (con el) por created_at; resueltas por resolved_at con desglose de estado.
//   4. RPC daily_management_report con sesion CRM real (SUPABASE_USER_JWT):
//      valida estructura (fecha de respuesta y claves de citas numericas; un
//      campo ausente invalida el contraste, no cuenta como 0) y compara las
//      citas por asesora contra los conteos independientes.
// Codigos de salida:
//   0 verificacion completa (datos + RPC coinciden)
//   1 fallo de verificacion (discrepancia, datos ilegibles, paginacion no
//     verificable, RPC en desacuerdo o con estructura invalida)
//   2 configuracion ausente o invalida
//   3 verificacion incompleta (datos OK, RPC sin verificar: falta sesion CRM)
// Uso (las credenciales NUNCA van a git):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<clave service role> \
//   [SUPABASE_USER_JWT=<access_token de sesion CRM>] [REPORT_DATE=YYYY-MM-DD] \
//   node scripts/verify-report-integration.mjs
// El JWT se obtiene de la sesion del panel (DevTools -> Local Storage ->
// sb-<ref>-auth-token -> access_token) y se usa solo en esta ejecucion.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_JWT = process.env.SUPABASE_USER_JWT;
const REPORT_DATE = process.env.REPORT_DATE;

const LIMITE_PAGINA = 1000;
const MAX_PAGINAS = 500;
const COLUMNAS = 'id,lead_id,scheduled_at,created_at,resolved_at,rescheduled_from_id,status,advisor_user_id,created_by_user_id,advisor_name,campus,is_data_dura';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  console.error('Nunca guardes la clave en ficheros versionados: pasala por entorno.');
  process.exit(2);
}
if (USER_JWT && (!REPORT_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(REPORT_DATE))) {
  console.error('Con SUPABASE_USER_JWT debes indicar REPORT_DATE=YYYY-MM-DD (fecha del reporte a contrastar).');
  process.exit(2);
}

let failures = 0;
const ok = (msg) => console.log(`OK  ${msg}`);
const fail = (msg) => { failures += 1; console.error(`FALLO  ${msg}`); };

async function rest(pathAndQuery, { metodo = 'GET', token = SERVICE_KEY, cuerpo, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: metodo,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`REST ${res.status} en ${pathAndQuery.split('?')[0]}: ${texto.slice(0, 300)}`);
  }
  const totalAnunciado = (() => {
    const cr = res.headers.get('content-range');
    if (!cr || !cr.includes('/')) return null;
    const total = cr.split('/')[1];
    return total === '*' ? null : Number(total);
  })();
  return { json: await res.json(), totalAnunciado };
}

// Dia Miami (America/New_York) de un instante ISO, en YYYY-MM-DD.
function diaMiami(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

// Pagina TODAS las citas cuyo campo de fecha (created_at o resolved_at) caiga
// en la ventana: offset estable (orden asc: las filas nuevas se anaden al final
// y no desplazan las paginas ya leidas).
async function paginar(campoFecha, desdeIso) {
  const filtro = `select=${COLUMNAS}&${campoFecha}=gte.${desdeIso}&order=${campoFecha}.asc,id.asc`;
  const filas = [];
  let totalAnunciado = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const offset = pagina * LIMITE_PAGINA;
    const { json, totalAnunciado: total } = await rest(
      `lead_appointments?${filtro}&limit=${LIMITE_PAGINA}&offset=${offset}`,
      { prefer: 'count=exact' },
    );
    if (total !== null) totalAnunciado = total;
    if (!Array.isArray(json)) throw new Error('la respuesta de lead_appointments no es un array');
    filas.push(...json);
    if (json.length < LIMITE_PAGINA) break;
    if (pagina === MAX_PAGINAS - 1) throw new Error(`la ventana supera ${MAX_PAGINAS * LIMITE_PAGINA} filas: aumenta la ventana por tramos o revisa el filtro`);
  }
  return { filas, totalAnunciado };
}

// Resumen por dia Miami. Las citas NUEVAS y REPROGRAMADAS se agrupan por
// created_at (consulta de creacion); las RESUELTAS por resolved_at (consulta
// independiente: una cita creada hace meses y resuelta hoy cuenta hoy), con
// desglose de estado, igual que la RPC.
function resumenPorDia(filasCreacion, filasResolucion) {
  const porDia = new Map();
  const bloque = () => ({ nuevas: 0, reprogramadas: 0, resueltas: 0, asistio: 0, no_asistieron: 0, canceladas: 0, reprogramadas_status: 0 });
  for (const f of filasCreacion) {
    const diaCreacion = diaMiami(f.created_at);
    if (!diaCreacion) { fail(`fila ${f.id} con created_at ilegible: ${f.created_at}`); continue; }
    const creacion = porDia.get(diaCreacion) || bloque();
    if (f.rescheduled_from_id === null || f.rescheduled_from_id === undefined) creacion.nuevas += 1;
    else creacion.reprogramadas += 1;
    porDia.set(diaCreacion, creacion);
  }
  for (const f of filasResolucion) {
    if (!f.resolved_at) continue;
    const diaResolucion = diaMiami(f.resolved_at);
    if (!diaResolucion) { fail(`fila ${f.id} con resolved_at ilegible: ${f.resolved_at}`); continue; }
    const resolucion = porDia.get(diaResolucion) || bloque();
    resolucion.resueltas += 1;
    if (f.status === 'ASISTIO') resolucion.asistio += 1;
    else if (f.status === 'NO_ASISTIO') resolucion.no_asistieron += 1;
    else if (f.status === 'CANCELADA') resolucion.canceladas += 1;
    else if (f.status === 'REPROGRAMADA') resolucion.reprogramadas_status += 1;
    else fail(`fila ${f.id} resuelta con status inesperado: ${JSON.stringify(f.status)}`);
    porDia.set(diaResolucion, resolucion);
  }
  return porDia;
}

// Conteos independientes por asesora para una fecha, imitando la atribucion
// contractual de la RPC: agendamiento por coalesce(created_by_user_id,
// advisor_user_id); resolucion por advisor_user_id.
function resumenAsesorDia(filasCreacion, filasResolucion, fecha) {
  const porAsesor = new Map();
  const sumar = (worker, clave) => {
    const acc = porAsesor.get(worker ?? '__sin_usuario__') || { agendados: 0, reprogramadas: 0, visitas: 0, no_asistieron: 0, canceladas: 0, reprogramadas_status: 0 };
    acc[clave] += 1;
    porAsesor.set(worker ?? '__sin_usuario__', acc);
  };
  for (const f of filasCreacion) {
    if (diaMiami(f.created_at) === fecha) {
      sumar(f.created_by_user_id ?? f.advisor_user_id, f.rescheduled_from_id === null ? 'agendados' : 'reprogramadas');
    }
  }
  for (const f of filasResolucion) {
    if (f.resolved_at && diaMiami(f.resolved_at) === fecha) {
      const clave = { ASISTIO: 'visitas', NO_ASISTIO: 'no_asistieron', CANCELADA: 'canceladas', REPROGRAMADA: 'reprogramadas_status' }[f.status];
      if (!clave) { fail(`fila ${f.id} resuelta con status inesperado: ${JSON.stringify(f.status)}`); continue; }
      sumar(f.advisor_user_id, clave);
    }
  }
  return porAsesor;
}

async function llamarRpc(fecha) {
  const { json } = await rest('rpc/daily_management_report', {
    metodo: 'POST',
    token: USER_JWT,
    cuerpo: { p_fecha: fecha, p_autor_user_id: null },
  });
  return json;
}

// Compara la RPC contra los conteos independientes. Devuelve la lista de
// descuadres (vacia = coincide). Validacion estricta: si la respuesta trae otra
// fecha o alguna asesora sin sus claves de citas numericas, el contraste queda
// invalidado (los campos ausentes NO se interpretan como 0).
function contrastarRpc(porAsesor, rpcJson, fecha) {
  if (!rpcJson || !Array.isArray(rpcJson.asesoras)) {
    return [`estructura de la RPC inesperada: se esperaba {asesoras:[...]}, se recibio ${JSON.stringify(rpcJson).slice(0, 200)}`];
  }
  if (rpcJson.fecha !== fecha) {
    return [`la RPC devolvio fecha ${JSON.stringify(rpcJson.fecha)} en lugar de ${fecha}: no puede contrastarse`];
  }
  const CLAVES_RPC = ['total_agendados', 'citas_reprogramadas_hoy', 'visitas', 'no_asistieron', 'canceladas', 'reprogramadas'];
  const descuadres = [];
  const rpcPorAsesor = new Map();
  rpcJson.asesoras.forEach((a, indice) => {
    if (!a || typeof a !== 'object' || !a.citas || typeof a.citas !== 'object') {
      descuadres.push(`estructura: asesoras[${indice}] (autor=${JSON.stringify(a?.autor_user_id ?? null)}) no trae objeto citas`);
      return;
    }
    for (const clave of CLAVES_RPC) {
      if (typeof a.citas[clave] !== 'number' || !Number.isFinite(a.citas[clave])) {
        descuadres.push(`estructura: asesoras[${indice}] (autor=${JSON.stringify(a.autor_user_id ?? null)}) campo ${clave} ausente o no numerico (${JSON.stringify(a.citas[clave])})`);
      }
    }
    rpcPorAsesor.set(a.autor_user_id ?? '__sin_usuario__', {
      agendados: a.citas.total_agendados,
      reprogramadas: a.citas.citas_reprogramadas_hoy,
      visitas: a.citas.visitas,
      no_asistieron: a.citas.no_asistieron,
      canceladas: a.citas.canceladas,
      reprogramadas_status: a.citas.reprogramadas,
    });
  });
  if (descuadres.length > 0) return descuadres;
  const claves = new Set([...porAsesor.keys(), ...rpcPorAsesor.keys()]);
  const clavesActivas = [...claves].filter((k) => {
    const datos = porAsesor.get(k);
    const rpc = rpcPorAsesor.get(k);
    const activoDatos = datos && Object.values(datos).some((v) => v > 0);
    const activoRpc = rpc && Object.values(rpc).some((v) => v > 0);
    return activoDatos || activoRpc;
  });
  // [campo interno, clave tal y como la expone la RPC] para que el detalle del
  // descuadre se pueda cotejar directo contra el JSON de la funcion.
  const CAMPOS = [
    ['agendados', 'total_agendados'],
    ['reprogramadas', 'citas_reprogramadas_hoy'],
    ['visitas', 'visitas'],
    ['no_asistieron', 'no_asistieron'],
    ['canceladas', 'canceladas'],
    ['reprogramadas_status', 'reprogramadas'],
  ];
  const etiqueta = (k) => (k === '__sin_usuario__' ? 'sin_usuario' : k);
  for (const k of clavesActivas) {
    const datos = porAsesor.get(k) || { agendados: 0, reprogramadas: 0, visitas: 0, no_asistieron: 0, canceladas: 0, reprogramadas_status: 0 };
    const rpc = rpcPorAsesor.get(k) || { agendados: 0, reprogramadas: 0, visitas: 0, no_asistieron: 0, canceladas: 0, reprogramadas_status: 0 };
    for (const [campo, claveRpc] of CAMPOS) {
      if (datos[campo] !== rpc[campo]) {
        descuadres.push(`asesora ${etiqueta(k)} ${claveRpc}: rpc=${rpc[campo]} vs datos=${datos[campo]}${k === '__sin_usuario__' ? ' (bloque sin usuario: la RPC lo colapsa por max(advisor_name))' : ''}`);
      }
    }
  }
  return descuadres;
}

try {
  // --- 1. Esquema: pedir exactamente las columnas que consume la RPC --------
  const muestra = await rest(`lead_appointments?select=${COLUMNAS}&limit=1`);
  if (Array.isArray(muestra.json)) {
    ok(`lead_appointments accesible y con las columnas esperadas (${COLUMNAS.split(',').length} columnas, incluida created_by_user_id)`);
  } else {
    fail('la respuesta de lead_appointments no es un array');
  }

  // --- 2. Ventana: 60 dias, o ampliada hacia atras para cubrir REPORT_DATE --
  const msDia = 86400000;
  const limiteVentana = Date.now() - 60 * msDia;
  const desdeMs = REPORT_DATE ? Math.min(limiteVentana, Date.parse(REPORT_DATE) - msDia) : limiteVentana;
  const desdeIso = new Date(desdeMs).toISOString();

  // --- 3. Paginacion completa de ambos campos, total anunciado exigido ------
  const { filas: filasCreacion, totalAnunciado: totalCreacion } = await paginar('created_at', desdeIso);
  const { filas: filasResolucion, totalAnunciado: totalResolucion } = await paginar('resolved_at', desdeIso);
  if (filasCreacion.length === 0 && filasResolucion.length === 0) {
    fail(`sin citas creadas ni resueltas en la ventana desde ${desdeIso.slice(0, 10)}: nada que contrastar, verificacion no posible`);
  }
  if (totalCreacion === null) {
    fail('paginacion no verificable (created_at): PostgREST no anuncio total (Content-Range)');
  } else if (totalCreacion !== filasCreacion.length) {
    fail(`paginacion incompleta (created_at): recogidas ${filasCreacion.length} de ${totalCreacion} anunciadas`);
  } else {
    ok(`paginacion completa: ${filasCreacion.length} citas por created_at recogidas (total anunciado ${totalCreacion})`);
  }
  if (totalResolucion === null) {
    fail('paginacion no verificable (resolved_at): PostgREST no anuncio total (Content-Range)');
  } else if (totalResolucion !== filasResolucion.length) {
    fail(`paginacion incompleta (resolved_at): recogidas ${filasResolucion.length} de ${totalResolucion} anunciadas`);
  } else {
    ok(`paginacion completa: ${filasResolucion.length} citas por resolved_at recogidas (total anunciado ${totalResolucion})`);
  }

  // --- 4. Desglose por dia Miami --------------------------------------------
  const porDia = resumenPorDia(filasCreacion, filasResolucion);
  for (const [dia, acc] of [...porDia.entries()].sort()) {
    console.log(`    ${dia}  nuevas=${acc.nuevas}  reprogramadas=${acc.reprogramadas}  resueltas=${acc.resueltas}`);
  }
  const conActividad = [...porDia.values()].filter((a) => a.nuevas + a.reprogramadas + a.resueltas > 0).length;
  if (conActividad > 0 && failures === 0) ok(`desglose por dia Miami generado para ${conActividad} dia(s); resueltas agrupadas por resolved_at`);

  // --- 5. RPC daily_management_report con sesion CRM real -------------------
  if (!USER_JWT) {
    console.log('PENDIENTE  RPC daily_management_report sin verificar: falta SUPABASE_USER_JWT (sesion CRM).');
    console.log('           Los conteos de datos estan verificados; el resultado de la funcion, no.');
  } else {
    try {
      const rpcJson = await llamarRpc(REPORT_DATE);
      const porAsesor = resumenAsesorDia(filasCreacion, filasResolucion, REPORT_DATE);
      const descuadres = contrastarRpc(porAsesor, rpcJson, REPORT_DATE);
      if (descuadres.length === 0) {
        const totalAgendados = [...porAsesor.values()].reduce((s, a) => s + a.agendados, 0);
        const totalReprog = [...porAsesor.values()].reduce((s, a) => s + a.reprogramadas, 0);
        ok(`RPC daily_management_report ${REPORT_DATE} coinciden (total_agendados=${totalAgendados}, citas_reprogramadas_hoy=${totalReprog})`);
      } else {
        for (const d of descuadres) fail(`RPC ${REPORT_DATE}: ${d}`);
      }
    } catch (err) {
      fail(`RPC daily_management_report ${REPORT_DATE}: ${err.message || String(err)}`);
    }
  }
} catch (err) {
  fail(err.message || String(err));
}

if (failures > 0) {
  console.error(`\nverify-report-integration: ${failures} fallo(s)`);
  process.exit(1);
}
if (!USER_JWT) {
  console.log('\nverify-report-integration: VERIFICACION INCOMPLETA (datos verificados, RPC pendiente de sesion CRM)');
  process.exit(3);
}
console.log('\nverify-report-integration: OK');

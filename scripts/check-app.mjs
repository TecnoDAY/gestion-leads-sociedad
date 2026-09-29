#!/usr/bin/env node
// Guarda del monolito de index.html:
//   1. node --check de cada bloque <script> en linea (cada uno por separado:
//      concatenados darian falsos positivos por redeclaracion).
//   2. Reglas anti-regresion sobre el HTML (ver REGRESSION_RULES).
// Los secretos NO se escanean aqui: los cubre qa-gate sobre el diff staged.
//
// Uso:  node scripts/check-app.mjs [ruta-a-index.html]
//       (la ruta opcional permite autotest con una copia rota fuera del repo)

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const target = process.argv[2] || 'index.html';

let html;
try {
  html = readFileSync(target, 'utf8');
} catch (err) {
  console.error(`check-app: no se puede leer ${target}: ${err.message}`);
  process.exit(2);
}

let failures = 0;

// --- 1. Sintaxis de los bloques <script> en linea ---------------------------
const blocks = [];
const blockRe = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = blockRe.exec(html)) !== null) {
  const attrs = match[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue; // los externos los valida su CDN/existencia, no nosotros
  blocks.push({
    module: /type\s*=\s*["']?module/i.test(attrs),
    code: match[2],
  });
}

if (blocks.length === 0) {
  console.error(`check-app: ${target} no tiene bloques <script> en linea que comprobar`);
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'check-app-'));
try {
  blocks.forEach((block, i) => {
    const file = join(dir, `block-${i + 1}.${block.module ? 'mjs' : 'js'}`);
    writeFileSync(file, block.code, 'utf8');
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      failures++;
      const detail = String(r.stderr || r.stdout).split('\n').filter(Boolean).slice(0, 3).join('\n');
      console.error(`check-app: bloque <script> #${i + 1} (${block.module ? 'module' : 'clasico'}) con error de sintaxis:\n${detail}`);
    } else {
      console.log(`check-app: bloque #${i + 1} OK (${block.code.split('\n').length} lineas)`);
    }
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// --- 2. Reglas anti-regresion cerradas ---------------------------------------
const REGRESSION_RULES = [
  {
    re: /onclick="filterFromMatrix\(/,
    msg: 'la matriz NO debe interpolar datos en onclick (XSS ya cerrado: usa data-matrix-* y el listener delegado)',
  },
  {
    re: /catch\s*(\([^)]*\))?\s*\{\s*\}/s,
    msg: 'catch vacio detectado: registra con console.warn o avisa al usuario',
  },
];

for (const { re, msg } of REGRESSION_RULES) {
  if (re.test(html)) {
    failures++;
    console.error(`check-app: regresion detectada -> ${msg}`);
  }
}

// --- 3. Cobertura del tema claro ---------------------------------------------
// El modo claro no reescribe Tailwind: suma sobrescrituras bajo [data-theme="light"].
// Si se usa una utilidad oscura sin su sobrescritura, se rompe SOLO en modo claro
// (borde/divisor/superficie oscuro sobre fondo blanco) y sin ningun aviso, que es
// como se acabo de perder una vez. Esta regla convierte ese fallo silencioso en un
// error de build.
//   - fondos neutros: avisan desde 600 (un bg de 500 es un indicador legitimo en ambos temas)
//   - bordes/divisores/anillos: avisan desde 500 (cualquier tono medio pesa sobre blanco)
const styleTag = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
if (!styleTag) {
  failures++;
  console.error('check-app: no hay bloque <style> que analizar para el tema claro');
} else {
  const deescapar = (t) => t.replace(/\\(.)/g, '$1');
  const cubiertas = new Set();
  for (const regla of styleTag[1].matchAll(/([^{}]+)\{[^}]*\}/g)) {
    const selector = regla[1];
    if (!selector.includes('[data-theme="light"]')) continue;
    for (const parte of selector.split(',')) {
      if (!parte.includes('[data-theme="light"]')) continue;
      // .hover\:bg-x:hover -> .hover\:bg-x ; .bg-x > :not([hidden]) -> .bg-x > :not()
      const limpio = parte
        .replace(/:(hover|focus|focus-visible|active|disabled)(\([^)]*\))?/g, '')
        .replace(/\[[^\]]*\]/g, '');
      for (const c of limpio.matchAll(/\.((?:\\.|[\w-])+)/g)) cubiertas.add(deescapar(c[1]));
    }
  }

  // El lado "usado" es solo HTML/JS: el propio CSS genera tokens con otra forma
  // (.hover\:bg-x se lee como bg-x) y daria falsos positivos.
  const marcado = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  const utilidad = /(?:[a-zA-Z0-9-]+:)*(?:bg|text|border|divide|ring|placeholder)-(?:slate|zinc|neutral|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+(?:\/\d+)?/g;
  const sinSobrescritura = new Set();
  let usadas = 0;
  for (const m of marcado.matchAll(utilidad)) {
    usadas++;
    const clase = m[0];
    if (cubiertas.has(clase)) continue;
    const base = clase.split(':').pop(); // quita variantes hover:/focus:/lg:
    const b = base.match(/^(bg|border|divide|ring)-(slate|zinc|neutral|gray)-(\d+)(?:\/\d+)?$/);
    if (b && Number(b[3]) >= (b[1] === 'bg' ? 600 : 500)) sinSobrescritura.add(clase);
  }
  if (sinSobrescritura.size > 0) {
    failures++;
    console.error(
      `check-app: regresion detectada -> tema claro sin sobrescritura para: ${[...sinSobrescritura].sort().join(', ')}`
    );
  } else {
    console.log(`check-app: tema claro OK (${cubiertas.size} sobrescrituras, ${usadas} utilidades usadas)`);
  }
}

if (failures > 0) {
  console.error(`check-app: ${failures} fallo(s)`);
  process.exit(1);
}
console.log(`check-app: OK (${blocks.length} bloques, ${REGRESSION_RULES.length} reglas)`);

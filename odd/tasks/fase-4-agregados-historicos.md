# Fase 4: agregados historicos

## Objetivo
Extraer computeHistoricalAggregates a src/legacy/reportes.js sin cambiar los
contadores ni el orden de meses usados por el panel y el CSV.

## Problema y por que
El calculo mensual sigue en index.html pese a utilizar solo helpers ya
extraidos. Los filtros y el rango dependen del DOM; moverlos a la vez
mezclaria responsabilidades y aumentaria el riesgo.

## Alcance
- Mover la funcion pura computeHistoricalAggregates al modulo canonico de
  reportes, registrarla en window y adaptar el sandbox t5.
- Caracterizar estados, fechas, campanas, agentes y datos vacios.
- Dejar readHistRange/filterHistoricalLeads y render en index.html.

## Restricciones
- Sin cambios de UX, contratos del reporte, SQL o Supabase.
- Misma rama; no commit, push ni deploy sin peticion explicita.

## No romper
- Mismo resultado de computeHistoricalAggregates(data) y llamadas actuales.
- Tests existentes de reportes, t5 y build autocontenido.
- No incluir odd/tasks/fase-1-centro-ayuda.md ni opencode.json.bak ajenos.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [x] T1: Caracterizar entradas y salidas del agregado con tests del modulo.
- [x] T2: Mover funcion, reutilizar getField, registrar API global y adaptar t5.
- [x] T3: Test completo, lint, build, smoke y revision de diff.

## Criterios de aceptacion
- [x] Mismos totales y orden de meses para todos los casos caracterizados.
- [x] Sin funcion duplicada en index.html, llamadas intactas.
- [x] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- Tramo minimo: agregado puro primero; filtros/DOM en una entrega futura.
- La comprobacion pasiva local de ZAP se completo despues de la extraccion;
  sus alertas CSP preexistentes quedan abiertas para una fase independiente.

## Reutilizacion investigada
- src/legacy/reportes.js ya define histMonthKey, normalizeGestion,
  groupGestionEstado, sortHistMonthKeys; src/legacy/helpers.js exporta getField.
- t5-frontend-edge.test.mjs ya caracteriza cuatro escenarios del agregado.

## Evidencia
- T1: nuevo `scripts/tests/agregados-historicos.test.mjs` observo RED por
  export ausente; caracteriza entrada vacia, meses por ano, Mes declarado,
  estados, campanas, agentes y embudo. Tests t5 anteriores conservados.
- T2: funcion movida con script al modulo canonico `src/legacy/reportes.js`;
  registro `window.computeHistoricalAggregates`; t5 inyecta export en VM.
- T3: tests especificos+t5 137/137; pnpm test 416/416 Node y 11 Python;
  lint/tsc/check-app OK, build OK (dist autocontenido 804 kB),
  `git diff --check` OK; localhost:3001 root 200 y modulo reportes 200.
  qa-gate sin staged solo reviso rutas rastreadas; no equivale a gate strict
  sobre los cambios aun sin stage. La prueba visual y ZAP posteriores se
  documentan debajo.
- Prueba visual del Analisis Historico: confirmada por el humano ("todo esta
  funcionando bien"). Esta confirmacion no sustituye la auditoria ZAP.
- ZAP pasivo local solicitado por el humano: ZAP 2.17.0 en una sesion nueva
  `/tmp/opencode/zap-fase4-aislado.session`, spider finalizado 100%, cola
  pasiva 0. Contra `http://127.0.0.1:3001/`: 0 High, 34 instancias Medium
  (17 `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 282 instancias informativas; la raiz presenta los 2 tipos Medium.
  Muchas instancias vienen de rutas GET con query strings generadas por el
  spider. No son 34 tipos diferentes. No se ejecuto active scan ni se
  autenticaron usuarios. El proceso ZAP de esta prueba fue detenido.
  Las alertas CSP son preexistentes de la politica de `vercel.json` y no
  resultan de extraer el agregado historico. Eliminarlas exigiria cambiar
  los scripts/estilos inline y handlers onclick en toda la app, fuera de
  esta fase; no se declara seguridad sin alertas.
- Verificacion posterior del build de produccion: `pnpm build` OK; preview
  local HTTP 200 y HTML identico a `dist/index.html`. Las cabeceras del
  preview coinciden con `vercel.json` salvo la excepcion WebSocket local de
  `vite.config.ts` (intencionada). El HTML construido incluye 3 scripts inline,
  1 bloque style y 121 atributos de evento; eliminar `unsafe-inline` sin
  migrarlos romperia el panel. `pnpm test`: 416 Node + 11 Python OK;
  `pnpm lint`: OK. No se verifico un despliegue nuevo en Vercel ni el flujo
  autenticado en un navegador contra el preview.

## Progreso
- Estado: implementada, verificada y con commit local atomo realizado
  (solo ficheros de esta fase; fase-1-centro-ayuda.md y opencode.json.bak
  quedaron fuera); sin push
- Ultima tarea: commit de la fase tras qa-gate --strict en staged
- Siguiente paso: fase 5, separar la logica pura de filtrado del historico
  (filterHistoricalLeads) de sus lecturas del DOM; la auditoria sigue abierta
  y la migracion CSP se decide aparte
- Bloqueos: CSP unsafe-inline preexistente; sin escaneo autenticado

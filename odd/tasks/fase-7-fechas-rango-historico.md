# Fase 7: fechas del rango historico

## Objetivo
Extraer la logica pura de fechas del rango Desde/Hasta del panel historico
a src/legacy/reportes.js: parseo de entrada YYYY-MM-DD a timestamp UTC y
calculo de presets (7d, 30d, mes, clear), dejando en index.html solo DOM.

## Problema y por que
readHistRange y setHistRangePreset mezclan parseo/calculo de fechas con
lectura/escritura de inputs. La parte pura es reutilizable y hoy no tiene
tests; caracterizarla antes de moverla evita romper el filtro y el CSV.

## Alcance
- Nuevas `histDateInputToTs(s)` y `histRangePresetDates(preset, todayTs)` en
  reportes, registro en window y delegacion desde los wrappers.
- Contrato exacto del parseo actual: regex estricta YYYY-MM-DD; dia
  imposible hace rollover (sin validacion de dia de calendario) y ese
  comportamiento se caracteriza tal cual (sin cambiarlo).
- Presets con todayTs inyectado (el wrapper calcula el today local como hoy,
  exactamente como el codigo original); preset desconocido devuelve null y
  el wrapper no toca los inputs.
- Tests: validas/invalidas/vacias, rollover, 7d, 30d, mes, clear,
  desconocido y no mutacion.

## Restricciones
- Sin cambios de UX, contratos del reporte, SQL o Supabase.
- Misma rama; sin push, merge ni deploy sin peticion explicita.
- No incluir trabajo ajeno (fase-1-centro-ayuda.md, opencode.json.bak).

## No romper
- Misma forma del retorno de readHistRange ({from, to}) y del flujo de
  setHistRangePreset (clear vacia, presets escriben, desconocido no escribe
  y render se recalcula siempre).
- Tests existentes de reportes, t5 y build autocontenido.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: Caracterizar parseo y presets con tests del modulo (RED por
  export ausente).
- [ ] T2: Extraer funciones, registrar API global y delegar desde los
  wrappers; adaptar t5.
- [ ] T3: Suite completa, lint, build, smoke, ZAP pasivo y revision de diff.

## Criterios de aceptacion
- [ ] Mismos timestamps y fechas de preset en todos los casos
  caracterizados.
- [ ] Sin logica de fechas del rango duplicada en index.html.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- El rollover de dia imposible se conserva documentado (comportamiento
  actual, no bug nuevo); cambiarlo seria cambio de contrato fuera de fase.
- todayTs es inyectable: pureza y determinismo en tests.

## Reutilizacion investigada
- patron window + inyeccion t5 establecido en fases 1-6; miamiToday existe
  pero el codigo original usa la fecha local del navegador: se conserva ese
  contrato y no se sustituye por Miami aqui.

## Evidencia
- T1: `scripts/tests/fechas-rango-historico.test.mjs` observo RED por export
  ausente; caracteriza parseo validas/invalidas/vacias, rollover documentado
  (2026-02-30 -> 2026-03-02), presets 7d/30d/mes/clear, desconocido null,
  cruce de ano y no dependencia de Date.now. Un error mio de aritmetica del
  7d se corrigio en el test (la funcion ya coincidia con el original).
- T2: `histDateInputToTs` y `histRangePresetDates` extraidas a
  `src/legacy/reportes.js` con registro en window; `readHistRange` queda
  solo con lecturas de inputs y `setHistRangePreset` conserva el todayTs
  local del navegador y el render obligatorio; preset desconocido no toca
  inputs. t5 inyecta ambos exports.
- T3: tests afectados 156/156; `pnpm test` 440/440 Node y 11 Python OK;
  `pnpm lint` (tsc + check-app) OK; `pnpm build` OK (dist 804 kB);
  `git diff --check` OK; smoke localhost:3000 root 200 y modulo reportes
  200. ZAP pasivo de esta fase: contra `http://127.0.0.1:3000/` con el
  daemon MCP en 8080 (evidencia `/tmp/opencode/zap-fase7-3000.log`), spider
  28 URLs y cola pasiva 0, con estados verificados al arrancar (reglas
  informativas GraalJS 50001/40100 desactivadas, reglas de seguridad
  10038/10055 activas): 0 High, 34 instancias Medium (17
  `CSP: script-src unsafe-inline` y 17 `CSP: style-src unsafe-inline`),
  0 Low y 303 informativas. Mismos 2 tipos Medium preexistentes de la
  linea base (Fase 4); sin hallazgos nuevos atribuibles a esta extraccion.
  Sin active scan ni autenticacion; auditoria global sigue abierta por el
  CSP preexistente y sin escaneo autenticado.

## Progreso
- Estado: implementada, verificada (suite 440/440, lint, build, smoke) con
  ZAP pasivo valido y revision visual del humano confirmada en el puerto
  activo 3000 ("funciona perfecto")
- Ultima tarea: revision visual del rango y presets
- Commit atomo de la fase 7 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita; continuar extracciones
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado

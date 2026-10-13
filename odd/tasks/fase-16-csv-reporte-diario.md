# Fase 16: CSV del reporte diario (armado puro) a reportes.js

## Objetivo
Extraer a src/legacy/reportes.js la construccion de las lineas del CSV del
reporte diario (diarioCsvLines) y la resolucion de la nota por autor
(resolverNotaBloque), dejando en el wrapper solo guardas, lecturas de DOM
(textareas de problemas/observaciones) y descarga/toast.

## Problema y por que
exportReporteDiarioCSV mezcla guardas de sesion con la seleccion de columnas
(headers/keys fijados), sumatorias, matching de notas por autor y el armado
de 30+ lineas. El armado es puro y no tiene tests directos; el golden real
es el t5 del CSV diario (32 columnas, fila TOTAL).

## Alcance
- `diarioCsvLines(fecha, filtro, generado, bloques, notasResueltas)` pura:
  mismo orden exacto (titulo, fecha, generado con generado como parametro,
  filtro opcional, cabecera de 32 columnas via csvReporteField, filas por
  bloque con values en el orden exacto de keys, TOTAL con sumas y dos
  vacios para problemas/observaciones).
- `resolverNotaBloque(bloque, notas)` pura: misma regla (autor_user_id
  coincide, si no autor_name con autor_user_id ausente, fallback b.nota).
- El wrapper conserva guardas, filtro por nombre visible del select y
  resuelve problemas/observaciones por DOM primero y nota despues.
- Tests directos de caracterizacion + golden t5 sin cambios de contenido.

## Restricciones
- Sin cambios de UX ni del CSV; mismas columnas y orden.
- Misma rama; sin push/merge/deploy sin peticion explicita; sin trabajo ajeno.

## No romper
- Tests t5 'período/diario CSV' actuales (golden de 32 columnas y TOTAL).
- Suite completa, lint, build, smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente antes de extraer; golden t5 mantiene el contenido.

## Tareas
- [ ] T1: caracterizar diarioCsvLines y resolverNotaBloque (RED).
- [ ] T2: extraer a reportes.js, registro window, wrapper con guardas y
  lecturas de DOM; inyeccion en t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke preview y ZAP pasivo.

## Criterios de aceptacion
- [ ] Sin armado de lineas del CSV diario en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- generado (miamiToday) via parametro para determinismo; el wrapper lo evalua.
- La lectura previa del textarea en pantalla se conserva: screen wins.

## Reutilizacion investigada
- csvReporteField, miamiToday y totalCanalesVisibles ya viven en reportes.js.
- exportReporteDiarioCSV esta en la lista de extract de t5 (cuerpo en vm).

## Evidencia
- T1: caracterizacion en `scripts/tests/reporte-diario-csv.test.mjs` (RED
  por export ausente): cabecera fija (titulo/fecha/generado/filtro/32
  columnas), fila por bloque en orden de keys (29 numericas + notas
  resueltas), TOTAL con sumas y dos vacios, resolverNotaBloque (uid,
  autor_name sin uid, fallback b.nota). Correccion: el fixture tenia
  'manana' descompuesta (n + tilde combinante) - h 'se retoma luego'.
- T2: `diarioCsvLines` + `resolverNotaBloque` en `src/legacy/reportes.js`
  (reutilizan csvReporteField y totalCanalesVisibles; headers/keys
  fijados como constantes del modulo); registro window; el wrapper
  exportReporteDiarioCSV queda con guardas, filtro visible del select,
  problemas/observaciones con DOM primero y nota despues, y descarga/toast.
- Inyeccion en t5/session-isolation; ajuste del test de etiquetas del
  canal (la cabecera vive ahora en reportes.js): 217/217 afectados.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  942 kB con guardia CSP LIMPIA (170 data-ev en dist, 0 on*=), preview
  4173 responde 200; `git diff --check` OK.
- ZAP pasivo de la fase 15 (preview): INCOMPLETO — el daemon cayo
  (connection refused) antes de drenar; no se recolecto alertas y no se
  puede declarar limpia; re-escaneo pendiente cuando haya daemon.

## Correccion de coherencia (autorizada; solape con esta entrega)
- Verificado con datos reales: Jessica/2026-10-13 = 130 gestiones =
  56 whatsapp + 14 llamada + 27 data dura + 31 llamada y whatsapp
  + 2 'Informacion' SIN canal (ids 10339 y 10444) y 1 lead con medio
  fuera de catalogo; la pantalla ocultaba esos buckets y los totales
  quedaban incoherentes (128/129 vs 130).
- Fix: pantalla Canales con fila 'Otros o sin canal' (= visita +
  sin_clasificar) y Total sumando las 6 filas; pantalla Procedencia con
  fila 'Otras procedencias' (= CogniTalking + Otros; CogniTalking ya no
  se usara, por eso fila agregada sin resucitar la etiqueta); CSV diario
  con columna 'Otros o sin canal' antes de 'Total canales' (33
  columnas) y totalCanalesVisibles sumando TODOS los buckets del RPC.
  CAVEAT documentado: el typo 'cognitalkign' del SQL no afecta a este
  reporte (0 en el caso) y queda para revision aparte.
- Tests: 5/5 en reporte-diario-csv (incluida coherencia con los datos
  reales del dia), t5 golden 33 columnas y totalCanalesVisibles=12 con
  motivo registrado; suite completa (Node + 11 Python), lint, build
  942 kB y guardia CSP LIMPIA verdes.

## Progreso
- Estado: implementada y verificada localmente (entrega fase 16 +
  correccion de coherencia); sin commit
- Ultima tarea: correccion de coherencia del reporte diario
- Siguiente paso: revision visual del humano (Canales/Procedencia y CSV
  diario; Jessica/13-10 debe cuadrar 130) y commit atomico solo con orden
- Bloqueos: ZAP fase 15 incompleto (daemon caido); re-escaneo pendiente

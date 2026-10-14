# Fase 19: KPIs y desglose de Citas a citas.js

## Objetivo
Extraer a src/legacy/citas.js la construccion del HTML de KPIs y del
desglose por estado y sede de la seccion Citas (citasKpiHtml); el wrapper
renderCitasKpis queda solo escribiendo los 2 nodos DOM.

## Problema y por que
renderCitasKpis mezcla la construccion de 11 tarjetas (principal y desglose
con Doral/Weston por data dura y 'Sin sede historicas') con la escritura de
2 innerHTML. La construccion es pura y no tiene tests directos.

## Alcance
- `citasKpiHtml(rows, counts, denom)`: devuelve { principales, desglose }
  con las mismas 4 + 8 tarjetas, etiquetas, valores y reglas exactas
  (Doral/Weston con is_data_dura, 'Sin sede (historicas)' = !campus,
  tasa asistencia con 1 decimal).
- Wrapper: solo innerHTML de citasKpis y de sedeBreakdownBody.

## Restricciones
- Bytes del HTML identicos; sin cambiar etiquetas ni Saltos.
- Misma rama; sin push/merge/deploy sin peticion explicita; sin trabajo ajeno.

## No romper
- t5 de citas (kpis en pantalla) intactos; suite, lint, build verde.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 como golden.

## Tareas
- [ ] T1: caracterizar citasKpiHtml (RED).
- [ ] T2: extraer a citas.js con registro window; delegar el wrapper.
- [ ] T3: suite completa, lint, build, smoke; ZAP solo si hay daemon.

## Criterios de aceptacion
- [ ] Sin construccion de tarjetas KPI en index.html.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- La tarjeta (card) es detalle de la construccion: no se exporta sola.

## Reutilizacion investigada
- conteoCitas (fase 17) provee counts/denom hace puente natural.

## Evidencia
- T1: caracterizacion en `scripts/tests/citas-kpis.test.mjs` (RED por
  export ausente): 4 principales con tasa 66.7%/0.0%, 8 tarjetas de
  desglose con conteos (is_data_dura null cuenta como normal), ceros sin
  excepciones. Correcciones de mis tests: 7 -h 8 tarjetas (conteo del
  original), regex de reconstruccion del marcado y valores como texto.
- T2: `citasKpiHtml` en citas.js con registro window; renderCitasKpis
  queda escribiendo citasKpis y sedeBreakdownBody; ajuste t5: el calculo
  por sede se verifica ahora en citas.js y se inyecto citasKpiHtml en el
  contexto vm.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  942 kB con guardia CSP LIMPIA, preview 200, blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano (KPIs y desglose) y commit
  atomico solo con orden
- Bloqueos: ZAP fase 15 incompleto (daemon caido)

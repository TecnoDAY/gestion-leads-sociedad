# Fase 20: utilitarios de estado de leads a leads.js

## Objetivo
Extraer a src/legacy/leads.js la lógica de upsertLeadInState y
removeLeadFromState como funciones puras sobre un objeto de estado
explícito; el wrapper aplica el estado devuelto, el límite
loadedLeadTarget y marca el período dirty.

## Problema y por que
Ambas funciones mutan 5 variables del monolito (allLeads,
completeCurrentLeads, totalDatabaseCount, leadDataRevision y el límite de
ventana) y llaman markPeriodoReportDirty: no son testeables aisladas y
mezclan semánntica de datos con efectos implicitos. La semántica es de
datos (consolidar por id, trim de ventana, contadores) y ES pureizable.

## Alcance
- `aplicarUpsertLead(estado, lead)` pura: semántica original exacta
  (~cache-only upsert sin alta en allLeads, alta con trim a
  loadedLeadTarget, actualización consolidada, totalDatabaseCount,
  leadDataRevision) y devuelve { estado, esNuevo }.
- `aplicarRemoveLead(estado, leadId)` pura: mismo descuento en ambas
  listas, totalDatabaseCount con Math.max(0,...), leadDataRevision; devuelve
  { estado, removedVisible }.
- El wrapper hace destructuring del estado devuelto, mantiene
  loadedLeadTarget fuera de estado y llama markPeriodoReportDirty() si
  corresponde (esNuevo como flag, removedVisible como flag).

## Restricciones
- Semántica byte a byte: consolidateLeadsById invocado con exactamente los
  mismos args; leadDataRevision depende solo del efecto, no del resultado.
- Misma rama; sin push/merge/deploy sin petición explicita; sin trabajo ajeno.

## No romper
- t5/session-isolation: upsertLeadInState y removeLeadFromState están en
  las listas y los tests ejercitan caches; inyectar las funciones nuevas.
- Suite completa, lint, build, smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 como golden del flujo.

## Tareas
- [ ] T1: caracterizar aplicarUpsertLead/aplicarRemoveLead (RED).
- [ ] T2: extraer a leads.js con registro window; delegar los wrappers;
  inyeccion en t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke; ZAP solo si hay daemon.

## Criterios de aceptacion
- [ ] Sin lógica de union/trim en el cuerpo de upsert/remove del monolito.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- El estado es objeto explícito con 5 llaves; loadedLeadTarget queda en
  el wrapper (es un ajuste de app, no del algoritmo).
- markPeriodoReportDirty permanece en el monolito (observador del estado).

## Reutilizacion investigada
- consolidateLeadsById ya vive en helpers.js y llega a leads.js directo.

## Evidencia
- T1: caracterizacion en `scripts/tests/estado-leads.test.mjs` (RED por
  export ausente): alta con recorte de ventana y revision, consolidacion
  de existente, cache-only sin contar total, alta con cache completa,
  remove en ambas listas, remove inexistente sin revision, piso en 0 y
  entrada nula. Correcciones de mis tests cuando la semantica real de
  consolidateLeadsById ordena por id desc (conteo despues, no en el orden
  a原唱ar) y con Nombre en el deepEqual.
- T2: `aplicarUpsertLead(estado, lead, loadedLeadTarget)` y
  `aplicarRemoveLead(estado, leadId)` purezas en leads.js con registro
  window; los wrappers del bloque principal hacen destructuring, hacen
  asig a las variables del script clasico y marcan el problema del
  periodo solo cuando la revision cambio. Inyeccion de ambos en los
  contextos t5 y session-isolation.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  943 kB guardia LIMPIA, preview 200, blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano (aplicando/corrijiendo leads
  con cache completa), luego commit atomico con orden
- Bloqueos: ZAP fases 15-19 incompleto (daemon caido)

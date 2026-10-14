# Fase 18: carga de Citas (orden y union con leads) a citas.js

## Objetivo
Extraer a src/legacy/citas.js las partes puras de loadCitas: el orden
descendente de citas (ordenarCitasDesc) y la union cita-lead con contadores
y aviso de omitidas (unirCitasConLeads). El wrapper conserva guardas,
consultas, validacion de sesion y DOM.

## Problema y por que
loadCitas mezcla red, sesion y DOM con ordenamiento de filas y una reunion
contra leads con tres contadores omitidos (sin lead, archivadas, faltantes).
Esa reunion es pura y no tiene tests directos; el golden indirecto es el
t5 'citas: carga y filtro' que usa datos sinteticos con leads.

## Alcance
- `ordenarCitasDesc(rows)`: mismo comparador (scheduled_at desc, luego id
  desc, sin mutar la entrada).
- `unirCitasConLeads(rows, leads)`: filtra citas sin lead_id en silencio,
  descuenta archivados y faltantes con contadores, devuelve
  { citas, omitidas: { sinLead, archivadas }, aviso } con el texto exacto
  'Omitidas: X cita(s) sin lead asociado; Y cita(s) de lead(s)
  archivado(s).' y '' si no hay omitidas.
- Wrapper: valid(), fetchPagedResult/fetchRowsByIds, selects con
  catalogOptions, aria-busy y renderCitas siguen en index.html.

## Restricciones
- Sin cambios de comportamiento ni mensajes; mismos contadores en el mismo orden.
- Misma rama; sin push/merge/deploy sin peticion explicita; sin trabajo ajeno.

## No romper
- t5 de citas (carga con leads sinteticos, aviso de omitidas) intactos.
- Suite completa, lint, build, smoke.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test
- RED por export ausente; t5 como golden del flujo completo.

## Tareas
- [ ] T1: caracterizar ordenarCitasDesc y unirCitasConLeads (RED).
- [ ] T2: extraer a citas.js con registro window; delegar en loadCitas;
  inyeccion en t5/session-isolation.
- [ ] T3: suite completa, lint, build, smoke; ZAP solo si hay daemon.

## Criterios de aceptacion
- [ ] Sin ordenamiento ni union cita-lead en el cuerpo de loadCitas.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- El aviso se computa junto a la union (un solo consumo de la semantica).

## Reutilizacion investigada
- miamiDayBounds (helpers.js) ya delimita el rango en el wrapper.
- citas.js ya contiene citasEventsFromRows con la misma cache de filas.

## Evidencia
- T1: caracterizacion en `scripts/tests/citas-carga.test.mjs` (RED por
  export ausente): orden sin mutar, union con contadores y aviso exacto,
  aviso vacio, Leads compartidos, entradas vacias. Correccion de mi
  asercion (sinLead=4 cuando no llega ningun lead).
- T2: `ordenarCitasDesc` y `unirCitasConLeads` en citas.js con registro
  window; loadCitas queda con guardas, fetches, valid() y DOM; inyeccion
  de ambas en el contexto t5.
- T3: suite completa verde (Node + 11 Python), lint (3 reglas), build
  943 kB con guardia CSP LIMPIA, preview 200, blanco OK.

## Progreso
- Estado: implementada y verificada localmente; sin commit
- Ultima tarea: T3
- Siguiente paso: revision visual del humano (carga de citas con aviso de
  omitidas) y commit atomico solo con orden
- Bloqueos: ZAP fase 15 incompleto (daemon caido)

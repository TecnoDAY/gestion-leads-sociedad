# Fase 5: filtrado puro del historico

## Objetivo
Extraer la logica pura de filtrado del panel historico (campana, agente,
ano, rango Desde/Hasta con precedencia sobre mes) a src/legacy/reportes.js
como applyHistoricalFilters, dejando en index.html solo las lecturas del DOM.

## Problema y por que
filterHistoricalLeads mezcla lectura de 5 controles del DOM con reglas de
filtrado reutilizadas por render y CSV. Extraer solo la parte pura permite
caracterizar la precedencia rango-vs-mes y el conteo de excluidos sin DOM.

## Alcance
- Nueva funcion pura applyHistoricalFilters(data, filters) en el modulo
  canonico de reportes, registro en window y delegacion desde el wrapper
  filterHistoricalLeads en index.html (lecturas del DOM intactas).
- Tests de caracterizacion: sin filtros, campana, agente (clave 'Agente '),
  ano SIN-FECHA y especifico, precedencia del rango sobre mes, solo
  desde/solo hasta, conteo excludedNoDate, entradas inesperadas y no
  mutacion.
- Adaptar la inyeccion del sandbox t5 (un export mas).

## Restricciones
- Sin cambios de UX, contratos del reporte, SQL o Supabase.
- Misma rama; no push, merge ni deploy sin peticion explicita.
- El commit de esta fase viaja solo (sin fase-1-centro-ayuda.md ni
  opencode.json.bak ajenos).

## No romper
- Misma forma del retorno { data, range, rangeActive, selectedMes,
  selectedAnio, excludedNoDate } y llamadas en render/CSV.
- Tests existentes de reportes, t5 y build autocontenido.
- Precedencia documentada: rango activo anula el filtro de mes.

## TDD
- Modo: off | Fuente: default | Runner: pnpm test.
- Tests de caracterizacion obligatorios para esta extraccion.

## Tareas
- [ ] T1: Caracterizar applyHistoricalFilters con tests del modulo (RED por
  export ausente).
- [ ] T2: Extraer la funcion, registrar API global, delegar desde index.html
  y adaptar t5.
- [ ] T3: Suite completa, lint, build, smoke y revision de diff.

## Criterios de aceptacion
- [ ] Mismos resultados de filtrado y excludedNoDate en todos los casos
  caracterizados; precedencia rango sobre mes conservada.
- [ ] Sin logica de filtrado duplicada; index.html sin reglas de datos.
- [ ] Suite, lint y build verdes; sin despliegue ni commit automaticos.

## Decisiones aceptadas
- Tramo minimo: solo el filtrado; readHistRange, setHistRangePreset,
  updateHistRangeNotice y populate* siguen en index.html (DOM).
- rangeActive se calcula una sola vez, dentro de la funcion pura.

## Reutilizacion investigada
- src/legacy/reportes.js ya exporta getField (via helpers), parseFechaLead,
  normalizeLeadMonth y leadReportDate usados por el filtro actual.
- Patron de registro window y de inyeccion en sandbox t5 ya establecido en
  fases 1-4 (reportesMod inyectado en el contexto vm).

## Evidencia
- T1: nuevo `scripts/tests/filtro-historico.test.mjs` observo RED por export
  ausente; caracteriza sin filtros, campana, agente (clave 'Agente '), ano
  SIN-FECHA y especifico, precedencia rango sobre mes, solo desde/solo
  hasta, excludedNoDate, mes sin rango, combinacion de filtros, no mutacion
  y entradas inesperadas (null/range null).
- T2: `applyHistoricalFilters(data, filters)` extraida a
  `src/legacy/reportes.js` (reutiliza getField, leadReportDate,
  parseFechaLead, normalizeLeadMonth del propio modulo); registro
  `window.applyHistoricalFilters`; wrapper `filterHistoricalLeads` en
  index.html queda solo con lecturas del DOM y delega, conservando la forma
  del retorno. t5 inyecta el export en el contexto vm.
- T3: filtro-historico + t5 145/145; pnpm test 426/426 Node y 11 Python OK;
  `pnpm lint` (tsc + check-app) OK; build OK (dist autocontenido 804 kB);
  `git diff --check` OK; smoke localhost:3001 root 200 y modulo reportes
  200. Sin prueba visual autenticada ni ZAP de esta fase todavia.

## Progreso
- Estado: implementada y verificada localmente; ZAP pasivo valido registrado
  en el doc de fase 6; revision visual del humano confirmada en el puerto
  activo 3000
- Commit atomo de las fases 5-6 aprobado por el humano; sin push
- Siguiente paso: push solo con orden explicita
- Bloqueos: CSP unsafe-inline preexistente (fase aparte); sin escaneo
  autenticado

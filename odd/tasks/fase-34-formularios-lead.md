# Fase 34: alta/edicion de lead — payloads puros (tramo final del strangler)

## Objetivo
Extraer de handleCreateLead/handleUpdateLead/formatSaveError las
transformaciones puras (payload de alta, campos de edicion, mensajes de
error) hacia el modulo legacy de leads, dejando en el monolito solo lectura
de inputs, sesion/generaciones, RPC y controles de UI. Plan aprovado por el
humano tras el analisis de ultraplan (alternativa minima; NO mover handlers
enteros, NO tocar validaciones/permisos/flujo de citas).

## Problema y por que
Los dos formularios grandes siguen construyendo payloads inline mezclados
con DOM y red. Es la ultima superficie con reglas de negocio sin tests
directos; los defaults con espacios finales ('Informacion ', 'Agente ') y
la regla del telefono (solo se envia si cambio, excepto admin) son
fragiles a cualquier edicion futura.

## Alcance (subtramos del mismo commit)
- 34A Alta: `leadCreatePayload(vals, ctx)` y `fechaLlegadaDisplay(fechaSel,
  hoyMiami)` (+ `fechaLlegadaValida(fechaSel, hoyMiami)` si queda limpia).
  ctx: { isAdmin, nombreAgente, nombreAcceso }. Defaults exactos: 'Sin
  Nombre', formatPhone, '', 'Sin definir', 'Whatsapp', 'Informacion ' (con
  espacio final), 'WhatsApp', AGENTE segun rol con fallbacks en orden
  exacto, '', 'Nuevo lead registrado desde el panel.'.
- 34B Edicion: `leadUpdateFields(vals, ctx)` con la regla de telefono
  (enviar solo si telNuevo !== telOriginal; admin SIEMPRE incluye Telefono)
  y overrides admin (Mes, Fecha, Campana, Medio, Ciudad, AGENTE, Odoo,
  'Fecha de Atencion', LANDING) en el mismo orden literal.
- `formatSaveError(error, agendado)` movida tal cual.
- Wrapper: lee inputs, valida fecha futura, genera requestGeneration/
  validRequest, RPC, toasts, filtros — INALTERADOS nombres/orden/valores.
- No tocar: citas (confirmAppointmentCreation, appointmentDetailsFrom,
  campus), loadEditExistingAppointment, permisos RLS, RPC, modales DOM.

## Restricciones
Sin stage/commit/push/remoto ni main. Golden ANCLADO: capturar los payloads
reales de HEAD (609e1df) ejecutando handleCreateLead/handleUpdateLead en vm
con DOM+supabase mock (spy de rpc registra p_lead/p_fields) para una matriz
de samples (admin/asesor, telefono cambiado/no, campos vacios, cita
agendada/no), serializarlos a scripts/tests/fixtures/fase34-golden.json y
que el test compare builder vs FIXTURE (no vs git show en runtime — leccion
de la fase 33: el golden de HEAD se rompe al commitear).

## No romper
- Byte a byte: claves del objeto payload, espacios finales, orden de
  asignacion admin (Object.assign puede sobrescribir Telefono), default
  'Llamada' de ULTIMA GESTION en edicion, 'Sin Nombre'.
- Suite (621), lint, build, smoke, t5/session-isolation.

## TDD
Modo: off | Fuente: default | Runner: pnpm test
Caracterizacion por fixture anclado (arriba).

## Tareas
- [x] T1: extraer builders + formatSaveError, fixture golden, tests.
- [x] T2: contraste independiente, suite, lint, build, smoke, diff-check.
- [ ] T3: revision visual humana (alta + edicion con/sin cita, admin y
  asesora) y ZAP separado (limitacion: pasiva HTTP, no cubre flujos
  autenticados; la correccion de payloads queda cubierta por fixture +
  visual).

## Criterios de aceptacion
- [ ] handleCreateLead/handleUpdateLead sin construccion de payload inline.
- [ ] Fixture commiteado; tests no dependen de HEAD movil.
- [ ] Suite, lint y build verdes; sin commit automatico.

## Decisiones aceptadas
- Los builders van a src/legacy/leads.js (dominio leads; evita un script
  tag nuevo). formatSaveError tambien (es mensaje de guardado de leads).
- Handlers completos no se mueven (alternativa de mayor riesgo descartada).

## Reutilizacion investigada
- formatPhone (leads.js/helpers), isAgendadoGestion (leads.js),
  appointmentInputISO (citas.js): reutilizar desde el wrapper; los builders
  puros reciben valores ya leidos, no DOM.

## Evidencia
- T1 (2026-10-14): piezas puras en src/legacy/leads.js con registro `window.*`
  (mismo patron de fases 25-30, sin namespace): `fechaLlegadaDisplay(fechaSel,
  hoyMiami)`, `leadCreatePayload(v, ctx)`, `leadUpdateFields(v, ctx)` y
  `formatSaveErrorLead(error, agendado)` (firma historica, `agendado` sin uso
  como en HEAD). Wrappers en index.html: handleCreateLead/handleUpdateLead
  solo leen inputs y delegan; `formatSaveError` queda como delegador puro.
- Golden ANCLADO: scripts/tests/fixtures/fase34-golden.json (9 alta, 7
  edicion, 9 fechas, 16 errores) capturado por
  scripts/tests/generar-fase34-golden.mjs ejecutando los handlers del commit
  FIJO 609e1df en vm con DOM+rpc spy (payloads p_lead/p_fields, claves y
  orden serializados). Salida determinista (regenerar = mismo hash). El test
  no toca git en runtime.
- Tests nuevos: scripts/tests/formularios-lead.test.mjs (10): builders vs
  fixture (payload + payloadKeys), replay del wrapper del arbol vs fixture en
  vm, casos borde (nombre en blanco, telefono igual/distinto por asesora,
  admin siempre incluye Telefono incluso vacio, 'Información ' con espacio
  final, gestion '   ' sin trim, AGENTE por rol con acceso undefined/null),
  tabla formatSaveError fila a fila, pureza+registro del modulo, forma de los
  wrappers. t5-frontend-edge adaptado (2 aserciones de fuente apuntan ahora a
  leads.js sin debilitar: literales de errores y split de fecha; inyeccion de
  las 4 nuevas piezas en el sandbox).
- Verificacion: node --test (formularios-lead+ficha-lead+tabla-leads+
  repetidos-ficha+t5+session-isolation) 244/244; pnpm test 631 node + 11
  python (621 base + 10 nuevos, 0 fail); pnpm lint OK (tsc + check-app);
  pnpm build OK (inline-dist); git diff --check limpio.

## Progreso
Estado: T1 passed (2026-10-14). T2/T3 pendientes (verificacion independiente y revision visual).
Siguiente tarea: T2.
Bloqueos: ninguno. fixture/generador/test quedan untracked sin stagear (el worker no commitea).

## Progreso (cierre visual)
- Estado: passed T3-visual. El humano reviso alta/edicion en preview y
  confirmo "todo funciona correctamente" (2026-10-14). ZAP pendiente tras
  el commit.

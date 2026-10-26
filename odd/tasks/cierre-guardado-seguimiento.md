# Cierre de guardado y pantalla de seguimiento

## Objetivo
Cerrar el punto 1 aprobado: guardado confirmado y pantalla consistente.

## Problema y por que
La migracion aplicada cambia la firma de citas de cinco parametros, pero la app utiliza siete. La pantalla tambien asigna seguimiento a la respuesta sin comprobar persistencia y usa una ruta parcial que omite busqueda/contexto.

## Alcance
Auditar RPC vigentes, preparar correcciones locales minimas, pruebas de regresion y recalcular vistas reutilizando applyFilters.

## Out of scope
Sugerencias, campanas, cambios visuales, commit/push y migraciones remotas sin autorizacion especifica. Nuevos contratos de concurrencia requieren decision humana.

## Restricciones / No romper
Vanilla JS, sin dependencias ni tablas nuevas. Conservar permisos, detalles/sede de cita, filtros, pagina e inscripciones. No escribir pruebas sobre leads reales. No sobrescribir trabajo previo.

## TDD
Modo: on. Fuente: usuario (plan aprobado: reproducir antes de corregir). Runner: node --test --test-name-pattern='seguimiento:' scripts/tests/t5-frontend-edge.test.mjs; npm test.

## Tareas
- [x] T1 Inspeccionar firmas y cuerpos remotos (solo lectura).
- [x] T2 Reproducir/corregir confirmacion de guardado y refresco conservando pagina.
- [x] T3 Preparar migracion correctiva local preservando contratos/permisos (aplicada en remoto 2026-10-26 con autorizacion humana; suite SQL aislada sin ejecutar).
- [x] T4 Verificar suite/lint/build y revision independiente (limites de QA y SQL declarados).
- [ ] T5 Validacion de navegador y transacciones/reintentos/concurrencia en entorno aislado.

## Criterios de aceptacion
- [x] No atribuir al servidor campos no devueltos.
- [x] Recalcular busqueda, orden, tabla, movil e Inicio tras guardar.
- [x] Conservar pagina y filtros y refrescar inscripciones.
- [x] Firma SQL usada por frontend admite seguimiento atomico (7 args delega en update_lead_followup y sus dos whitelists aceptan el par).
- [ ] Pruebas transaccionales/duplicados/concurrencia verificadas o explicitamente pendientes.
- [ ] Validacion manual escritorio/movil completada.

## Decisiones aceptadas
Reutilizar flujo de filtros, no optimizacion parcial no demostrada. Corregir localmente; pedir autorizacion antes de remoto.

## Reutilizacion investigada
applyFilters/renderTable/renderQuickLeads y resetDashboardInscripciones existen; sustituyen actualizacion parcial en guardado. RPC siete parametros conserva detalle/sede y validacion telefono; no reemplazarla por version historica.

## Evidencia
T1 passed: consulta pg_proc/pg_get_functiondef: firmas de citas 5/6/7; solo la de 5 admite seguimiento. Firma de 7 mantiene proteccion trafficker/telefono/detalles/sede. update_lead_full aplicado perdio validaciones presentes en version anterior; revisar antes de corregir.
Contexto: proyecto no indexado por query_context.py list; docs/agent-context y AGENTS local no existen.
T2 RED: 3 tests fallan (pagina, pareja/fecha/limite y respuesta maquillada). GREEN: tests especificos pasan tras correccion; ampliados a cuatro rutas, borrado y doble envio en vuelo.
Checks iniciales passed: npm test 820 Node + 11 Python; npm run lint; npm run build. Se agregaron mas tests despues: repetir suite al cierre.
QA strict passed con limite: no staged; solo rutas rastreadas comprobadas, no certifica el codigo unstaged.
Navegador passed (funcional aislado, sin red externa ni datos reales): node /tmp/opencode/check-lead-render.mjs; Chromium 1280px y 390px, funciones reales applyFilters/renderTable/renderQuickLeads + modulos reales con datos sinteticos; tabla/movil/Inicio/pagina/origen. No es validacion visual del CRM completo ni autenticacion real.
Concurrencia pending: RPC no incluye version esperada y frontend envia campos comerciales completos. El lock serializa escrituras pero no detecta edicion obsoleta. Cambio de contrato requiere autorizacion.
Gestiones pending: al programar desde modal tambien viajan campos comerciales y fecha de gestion preseleccionada; comprobar semantica antes de afirmar ausencia de gestiones extra.
Revision independiente frontend: detecto borrado falsamente confirmado con campos ausentes. RED observado y corregido exigiendo presencia explicita de ambos campos; nueva revision sin blocker en estos fixes.
Filtro ultimo lead: RED observado seleccion vacia; correccion acotada al guardado mediante preserveSelection, para mantener contrato historico del selector en otras rutas. Una primera correccion global fallo golden historico; se acoto y suite completa paso 829/829 Node + 11 Python. Se agrego luego un test de respuesta obsoleta con editSessionValid real: passed.
Correctiva local: supabase/migrations/202610260001_correct_atomic_followup_contracts.sql; fixtures SQL solo local en supabase/tests/atomic_followup_contracts.sql. Tests estaticos no demuestran SQL funcional. Revision SQL detecto wrapper admin+sede faltante y dos defectos de expectativas/aserciones en fixtures, remitidos al implementador.
Entorno SQL unavailable: no psql/postgres/supabase CLI; docker ps falla por daemon inexistente. No se inicio ni instalo servicio del sistema.
Revision SQL final independiente: wrapper admin/full y resto/followup, permisos cita/lead y fixtures corregidos; sin nuevos defectos concretos por inspeccion. 5/5 tests estaticos aprobados; no equivalen a SQL funcional.
Reinicio de servidor durante suite final: proceso interrumpido, temporales de navegador/log perdidos. No se repitieron las comprobaciones de navegador ya terminadas.
Suite reanudada (2026-10-26): RED tres casos de prioridad por fecha ignorada. Correccion minima: scorePrioridadLead acepta hoy como segundo argumento, por defecto Miami actual. Sin cambiar expectativas. GREEN final: npm test 831/831 Node + 11 Python; npm run lint y npm run build passed; git diff --check passed. QA strict: rutas rastreadas comprobadas, sin staged (no audita contenido unstaged).
Navegador antes del reinicio: se amplio check sintetico con etiquetas de inscritos actualizadas y seleccion de filtro preservada; passed en 1280/390. No certifica CSS, temas, autenticacion ni base real.
Despliegue remoto (2026-10-26, autorizacion humana explicita): correctiva aplicada en dos apply_migration. part1 = update_lead_followup + update_lead_full; part2 = update_lead_with_appointment de 7 args, wrapper de sede y ACL. Deriva de nombre frente al fichero local unico 202610260001_correct_atomic_followup_contracts.sql; cualquier db push posterior la re-aplicaria (es idempotente). Usar apply_migration, no db push.
Verificacion posterior solo lectura: los 5 contratos estaticos reproducidos contra pg_get_functiondef (delegacion en update_lead_followup, cita de 7 args, guards crm/telefono/nombre/lead_contacts, par + largo 200 + ISO + to_char, USING sin quote_literal); wrapper con rama admin/full y orden lead antes que cita antes que sede; whitelists admin y no-admin incluyen proxima_accion/fecha_seguimiento; ACL overloads 5 y 6 revocados de authenticated/anon/public y 7 args/full/followup solo authenticated. Advisors: solo avisos preexistentes (52 SECURITY DEFINER, btree_gist, passwords), ninguno nuevo critico.
Revision SQL independiente (2026-10-26) confirmo 6/6 puntos y anadio el bug del wrapper admin+sede (ya corregido) y la deriva de nombres de migracion local/remoto.
Bugs cerrados en produccion: el par de seguimiento rechazado por whitelist en admin y no-admin al agendar; admin con sede existente con followup_fields_only; update_lead_full sin sincronizacion lead_contacts; quote_literal anulaba JSON null en seguimiento; overload de 5 args expuesto a authenticated.
Pendiente explicito: no se ejecuto supabase/tests/atomic_followup_contracts.sql (sin psql, sin CLI de Supabase, demonio docker inexistente). La validacion aplicada es estatica + inspeccion de cuerpos remotos; no hay prueba funcional de ejecucion.

## Progreso
Estado: waiting-human; punto 1 NO cerrado. Remoto corregido y verificado estaticamente (2026-10-26, autorizado); codigo local commiteado y push: e712251 (nota opcional en tabla de visitas), 7cf93b9/b75a0e9 (prioridad de seguimiento y contratos), 60b257b (JSDoc). Siguiente: decidir contrato para rechazar ediciones obsoletas y semantica de programacion sin gestion; habilitar validacion PostgreSQL aislada (requiere instalar CLI y arrancar docker = autorizacion humana). Bloqueos: SQL transaccional/duplicados/reintentos/concurrencia sin ejecutar; validacion manual escritorio/movil sin realizar.

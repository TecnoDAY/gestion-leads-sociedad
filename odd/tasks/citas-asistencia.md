# Citas, asistencia y reporte filtrable

## Objetivo
Registrar cada cita de un lead por separado de su gestión comercial, marcar si asistió/no asistió/canceló/reprogramó, conservar historial y obtener métricas filtrables por fecha, asesor, campaña, medio y resultado. Además, simplificar el reporte diario para captura legible.

## Problema y por qué
`GESTION = AGENDADO` solo indica que hubo un agendamiento: no conserva fecha/hora ni permite saber si la persona asistió. Convertir asistencia en otra etiqueta de `GESTION` mezclaría dos conceptos y sobrescribiría citas anteriores. En paralelo, los campos manuales del reporte diario tienen fondo oscuro dentro de una hoja clara y no se leen en captura; solo se desean Problemas/Bloqueos y Observaciones.

## Alcance
- **T1** Migración `202609250002_create_lead_appointments.sql`: tablas `lead_appointments` y `lead_appointment_events`, RLS real por asesor/admin, RPCs seguras para crear cita, cambiar resultado y reprogramar, trigger append-only de historial.
- **T2** Reporte diario: hoja siempre clara en ambos temas; eliminar todos los manuales salvo Problemas/Bloqueos y Observaciones; eliminar suma/eventos JS ya innecesarios.
- **T3** Ficha del lead: bloque de citas, crear fecha/hora, listar historial, marcar Asistió/No asistió/Cancelada y reprogramar sin sobrescribir la cita anterior.
- **T4** Panel/pestaña Citas: filtros por rango de fechas, asesor (solo admin), campaña, medio y resultado; KPIs Programadas/Asistieron/No asistieron/Canceladas/Reprogramadas/Tasa de asistencia; tabla de resultados. Asesor solo ve sus citas, admin todas.
- **T5** Reporte diario: añadir automáticamente Agendados para hoy, Asistieron hoy y No asistieron hoy desde `lead_appointments` (sin nuevos manuales).
- **T6** Verificación integral e informe.

## Restricciones
- Sin dependencias nuevas; vanilla JS; solo `index.html` + una migración nueva + este ODD.
- SQL remoto lo revisa y ejecuta el humano; el agente nunca aplica migraciones remotas.
- No commit/push sin petición explícita.
- Conservar los cambios no commiteados de reporte diario y tema claro.

## No romper
- `GESTION`, `lead_gestiones` y atribución mensual por campo `Mes`; una cita no cambia automáticamente el estado comercial del lead.
- RLS/RPC de `leads`, `lead_notes`, `lead_catalogs`, `user_access`.
- Reset completo de sesión y guardas `sessionGeneration` del reporte diario.
- Tema oscuro/claro, barra segmented y paleta de Chart.js ya implementados.
- Históricos 2025 siguen solo lectura.

## TDD
Modo: off | Fuente: default | Runner: no disponible. Checks funcionales y SQL estático obligatorios.

## Tareas
- [x] T1 migración citas + eventos + RLS/RPC/trigger
- [x] T2 simplificar y corregir reporte diario
- [x] T3 gestionar citas desde ficha del lead
- [x] T4 panel Citas con filtros, métricas y tabla
- [x] T5 integrar resumen de citas en reporte diario
- [x] T6 verificación integral e informe
- [x] T7 restringir citas a leads AGENDAD* + RPC atómica lead/cita
- [x] T8 UI condicional en Nuevo Lead y ficha de existentes
- [x] T9 verificación de ampliación e informe
- [x] T10 transición atómica de lead existente a AGENDAD* + cita
- [x] T11 UI condicional de cita en Editar Lead
- [x] T12 Centro de Ayuda y ayudas contextuales
- [x] T13 verificación final e informe

## Criterios de aceptación
- [ ] Crear una cita conserva fecha/hora, lead y asesor server-side.
- [ ] Marcar Asistió/No asistió/Cancelada conserva el cambio en historial.
- [ ] Reprogramar marca la cita anterior como REPROGRAMADA y crea otra PROGRAMADA enlazada, sin sobrescribirla.
- [ ] Agente solo puede leer/modificar sus citas; admin puede gestionar todas; enforcement server-side.
- [ ] Filtros mensuales permiten contar asistieron/no asistieron por asesor/campaña/medio.
- [ ] Lead de agosto con cita en septiembre se reporta como cita de septiembre sin cambiar su mes de origen.
- [ ] Reporte diario es legible en ambos temas y solo mantiene Problemas/Bloqueos y Observaciones como manuales.
- [ ] Reporte diario muestra automáticamente citas de hoy, asistieron y no asistieron.
- [ ] build/lint/diff-check/node-check/qa-gate verdes.
- [ ] Lead nuevo con `GESTION` AGENDAD* exige cita y crea lead+cita en una sola transacción.
- [ ] Lead existente AGENDAD* permite crear cita; otro estado oculta el formulario y la RPC lo rechaza.
- [ ] Las citas históricas siguen visibles aunque el lead deje de estar agendado.
- [ ] `Información → Agendado` registra el cambio en `lead_gestiones` y crea la cita en la misma transacción.
- [ ] Las RPC antiguas no permiten saltarse la cita al pasar de no-agendado a AGENDAD*.
- [x] Centro de Ayuda explica paso a paso Leads, Gestiones, Citas, Reporte, Filtros, Catálogos y Data Dura.

## Decisiones aceptadas
- Citas separadas de `GESTION`; descartadas etiquetas `AGENDADO ASISTIÓ/NO ASISTIÓ` por ambigüedad y pérdida de múltiples citas.
- Una fila por cita; reprogramación crea una cita nueva y enlaza la anterior.
- Historial de cambios por trigger append-only, misma filosofía que `lead_gestiones`.
- Filtros y métricas por fecha de cita, no por mes de origen del lead; campaña/medio se leen del lead asociado.
- Reporte v1 sigue siendo vista + captura; sin persistencia de los dos textos manuales, PDF/CSV/PNG fuera de alcance.
- La habilitación usa prefijo normalizado `AGENDAD*`, cubriendo `Agendado` y `AGENDADO DATADURA` sin listas duplicadas.
- Crear un lead agendado y su primera cita es atómico: wrapper RPC reutiliza `create_lead` y `create_lead_appointment`; cualquier fallo revierte ambos.
- La edición muestra fecha de cita solo en una transición real de no-agendado a `AGENDAD*`; un lead que ya era agendado usa la ficha para citas adicionales.
- El Centro de Ayuda v1 es contenido estático versionado en `index.html`, buscable y contextual; no crea tablas/RLS/editor.

## Reutilización investigada
- Patrón RLS y RPC de migraciones `202609240008_create_lead_notes.sql` y `202609250001_create_lead_gestiones.sql`.
- Carga paralela y guardas de sesión de `loadLeadGestiones`/`loadReporteDiario`.
- Helpers `getField`, `escapeHtml`, `formatPhone`, `showToast`, `activeCatalogValues`.
- Pestañas `switchTab`/`setDashboardTabState` y reset en `clearSessionState`.

## Evidencia
- T1: creada `supabase/migrations/202609250002_create_lead_appointments.sql`, con tablas, índices, RLS, revokes/grants, tres RPC security definer y trigger append-only.
- Reapertura T1: corregida la idempotencia y serialización de `set_lead_appointment_status` (bloqueo `FOR UPDATE`, retorno sin mutaciones/evento para el mismo estado, transición solo desde `PROGRAMADA`), validación explícita de `NULL` y CHECK de estados en eventos.
- Verificación: `git diff --check` y sanity estático de políticas, funciones, trigger, permisos y columnas exactas ejecutados correctamente.
- T2: `index.html` deja únicamente las dos textareas manuales, elimina suma/listeners de llamadas y aplica estilos claros con contraste suficiente en ambos temas; aviso y resets actualizados.
- Verificación T2: grep de restos prohibidos, `npm run build`, `npm run lint`, `git diff --check`, `node --check` del script inline y `qa-gate` ejecutados correctamente.
- T3: ficha actual incorpora creación, listado, estados y reprogramación de citas; ficha histórica oculta y no consulta el bloque. Asesores admin se cargan mediante `admin_manage_user_access` y se reutilizan guardas/escape existentes. Degradación ante tabla/RPC ausente oculta la sección.
- Verificación T3: `git diff --check`, `npm run build`, `npm run lint`, `node --check` del script inline, auditoría de IDs y grep de `prompt` en funciones nuevas ejecutados; el `prompt` preexistente de catálogos queda fuera de T3.
- Reapertura T3: corregido el payload exacto `NO_ASISTIO`; carga admin de asesores paralela a citas, fail-closed en error/lista vacía y selección por agente/current admin; se añadieron guardas de generación/ficha/sesión, bloqueo de mutaciones concurrentes y restauración segura de controles tras await.
- Verificación reapertura T3: `git diff --check` y `node --check` del script inline ejecutados correctamente.
- 2ª reapertura T3: los controles de estado y reprogramación de cada cita se deshabilitan durante su RPC mediante `data-appointment-id`, y se restauran en `finally` solo si la ficha/sesión y fila siguen vigentes; se conserva `pendingAppointmentMutations`.
- Verificación 2ª reapertura T3: `git diff --check`, `npm run build`, `npm run lint`, `node` sobre scripts inline y comprobación estática ejecutados; `qa-gate` avisó únicamente de `.env.example` sensible ya rastreado.
- T4: añadida la pestaña Citas con rango mensual, filtros, KPIs, tabla responsive, consulta acotada por rango, RLS respetada y guardas de sesión; reutiliza `catalogOptions`, `getField`, `escapeHtml` y `openViewLeadModal`.
- Verificación T4: `git diff --check`, `npm run build`, `npm run lint`, `node --check` del script inline y auditoría estática de IDs/tablas ejecutados.
- Reapertura T4: rango inválido limpia caché, rango, resultados, KPIs, contador y filtros; las cargas usan generación/token de citas y validan sesión, autenticación, pestaña y rango tras cada `await`; fechas de inputs y límites de consulta se construyen en hora local sin `toISOString()` para defaults.
- Verificación reapertura T4: `git diff --check`, `node --check` del script inline y sanity Node bajo `TZ=Europe/Madrid` y `TZ=America/New_York` confirmaron primer día/hoy estables y límite exclusivo del día local siguiente.
- T5: el reporte consulta gestiones y citas en paralelo con límites locales exclusivos, cuenta citas por estado, conserva métricas cuando una fuente falla y añade token/generación/fecha/asesor/tab guard.
- Reapertura T5: defaults de `reporteFecha` usan `formatLocalDateInput`; cada carga recompone el aviso desde el texto base y warnings independientes de gestiones/citas, conservando ambos y añadiendo warning general ante errores inesperados.
- Verificación reapertura T5: `git diff --check`, `npm run build`, `npm run lint`, `node --check` del script inline y sanity de default local bajo `TZ=Europe/Madrid` y `TZ=America/New_York` ejecutados correctamente.
- 2ª reapertura T5: sustituidas las dos llamadas inexistentes `formatLocalDateInput(new Date())` por el helper existente `formatLocalDate(new Date())`; la declaración es function declaration hoisted.
- Verificación 2ª reapertura T5: `grep`/sanity estático confirmó 0 referencias a `formatLocalDateInput`, 1 declaración `function formatLocalDate`, `git diff --check`, `npm run build`, `npm run lint`, `node --check` de scripts inline y sanity bajo `TZ=Europe/Madrid` y `TZ=America/New_York` ejecutados correctamente.
- T7: creada `supabase/migrations/202609250003_agendado_appointment_creation.sql`; reutiliza `create_lead` y la inserción canónica de citas, restringe server-side a `AGENDAD*` y añade wrapper atómico lead+cita con revokes/grants explícitos.
- Verificación T7: `git diff --check --no-index /dev/null supabase/migrations/202609250003_agendado_appointment_creation.sql` y sanity estático de firmas, validaciones, atomicidad, `AGENDAD`, revokes/grants ejecutados correctamente; migración no ejecutada remotamente.
- T8: Nuevo Lead muestra cita condicional y usa el wrapper atómico; la ficha separa creación de historial, conserva citas al cambiar de estado y reutiliza la caché de asesores con guardas fail-closed.
- Verificación T8: `git diff --check`, comprobación `node --check` de los 7 scripts inline, auditoría de helper único `isAgendadoGestion` y RPCs de creación ejecutadas correctamente.
- T11: Editar Lead marca la gestión original normalizada (`editLeadPreviousGestion`) al abrir y solo muestra el bloque de cita en una transición real no-AGENDAD→AGENDAD*; si ya era AGENDAD* muestra un aviso breve y remite a la ficha. `handleUpdateLead` valida fecha/notas/asesor y llama únicamente a `update_lead_with_appointment` (`p_id:Number`, `p_fields`, `p_scheduled_at`, `p_notes`, y `p_advisor_user_id` solo admin con asesor elegido); sin transición mantiene `update_lead_full`/`update_lead_followup` idéntico. Errores `appointment_required_for_agendado_transition` y `agendado_transition_required` se traducen a "Un lead agendado necesita fecha y hora de cita"; el resto conserva el mensaje crudo.
- T11 fail-closed y concurrencia: el submit de Editar se bloquea si el admin no tiene asesores cargados o sin selección (`updateEditSubmitState`), doble submit bloqueado con `editLeadSubmitting`, token/generación `editLeadRequestGeneration` + guardas de sesión/usuario/acceso/modal y coincidencia de `editLeadId` tras cada `await` (incluido `loadLeadsData()`), invalidación en `closeEditLeadModal` y `clearSessionState`, y carga de asesores reutilizando `leadAppointmentAdvisors` + `renderAppointmentAdvisorSelect` sin RPC duplicada (`loadEditAppointmentAdvisors` con token propio y bandera `editAdvisorsLoading`).
- T11 limpieza: al pasar a gestión no-AGENDAD se ocultan, limpian y quitan el `required` los campos; al cerrar el modal se limpia y oculta el bloque completo; un lead ya AGENDAD* no se ensucia.
- Verificación T11: `git diff --check` OK; `node --check` de los 3 scripts inline OK; 0 ids duplicados y 0 `getElementById` sin id; `npm run build` OK (247.36 kB); `npm run lint` (`tsc --noEmit`) OK; `qa-gate` sin hallazgos nuevos (solo `.env.example` preexistente).
- T12: `btnHelp` en la cabecera (patrón `btnTheme`/`btnCatalogs`, icono `help-circle`, oculto en login, restaurado en `setAppAuthenticated` para todo usuario autenticado y ocultado en `clearSessionState`); modal `modalHelp` con scroll canónico (`max-h-[90dvh] flex flex-col` + cuerpo `overflow-y-auto min-h-0` + header/buscador/footer `shrink-0`), `role="dialog"`, `aria-modal`, `aria-labelledby`, cierre con X, clic en fondo (`event.stopPropagation()` en el panel) y Escape con listener `keydown` global que solo actúa si el modal está visible; foco al abrir (sección cuando se pide una sección concreta, buscador en el resto) y restaurado al cerrar con guarda `document.contains`. Registrado en la lista de modales que `clearSessionState` oculta.
- T12 contenido: constante `HELP_SECTIONS` con 8 secciones (`ayuda-nuevo-lead`, `ayuda-gestionar-lead`, `ayuda-citas`, `ayuda-reporte-diario`, `ayuda-filtros-reportes`, `ayuda-catalogos`, `ayuda-data-dura`, `ayuda-seguridad-roles`), 50 pasos numerados y 13 notas, renderizados con `escapeHtml` y `escapeAttr` sobre ids `helpSection-<id>` prefijados para no colisionar. Sin dependencias, sin red y sin tablas nuevas, conforme a la decisión de la v1 estática.
- T12 buscador: filtra por título, resumen, pasos y notas con `normalizeHelpText` (NFD, sin diacríticos) para que términos acentuados y no acentuados encuentren la misma sección; muestra "Sin resultados" cuando no coincide nada y botón Limpiar que vacía y repinta.
- T12 ayudas contextuales: cinco botones `?` (tipo `button`, con `title` y `aria-label`) junto a Gestión Inicial de Nuevo Lead, bloque de cita de Nuevo Lead, Estatus de Gestión de Editar, encabezado de la sección Citas de la ficha y el título del Reporte diario; todos reutilizan `openHelpModal('seccion-id')` y hacen scroll + foco a la sección.
- Verificación T12: `npm run build` OK (267.13 kB); `npm run lint` (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 0 ids duplicados y 0 `getElementById`/`querySelector` sin id; `qa-gate` sin hallazgos nuevos (solo `.env.example` preexistente); contraste en tema claro de todo el texto de ayuda ≥ 6.1:1 (el único valor por debajo de 4.5 es el filete decorativo `border-amber-500/40`, no texto); prueba de la lógica de filtrado en Node con 16 términos (secciones 0-8 según coincidence, 8 ids únicos, 0 secciones mal formadas).
- Reapertura T12 (correcciones del verificador): (1) contenido alineado con el código real: el historial describe la gestión anterior → nueva "con su fecha, su canal y su asesor" (los badges se unen con la flecha real "→"), las etiquetas de los botones son "Asistió", "No asistió" y "Cancelada", Data Dura indica "usa el desplegable Gestión y selecciona el valor que contiene DATADURA" (en los filtros no hay buscador de texto) y el KPI se llama "Total citas". (2) Buscador: la conservación de sección considera también `notes` (una coincidencia solo en notas ya no descarta la sección), sin pasos filtrados se muestra "Sin pasos para este término; revisa el resumen." en lugar de un `<ol>` vacío, y los pasos conservan su numeración original (índice real de la sección) sin renumerar 1..n; se elimina el contador `visible` muerto. (3) Ortografía: todo `HELP_SECTIONS` reescrito con tildes correctas (Información, Gestión, Teléfono, Sesión, Catálogos, Métricas, Día, Añadir, Gráficos Históricos…); `normalizeHelpText` neutraliza diacríticos, así que con y sin tilde devuelven las mismas secciones. (4) Nits: `setAppAuthenticated` usa `classList.toggle('hidden', false)` como `btnAdminUsers`/`btnCatalogs` (sin dejar `hidden`+`flex` a la vez), `shrink-0` añadido a los dos chips `?` que faltaban (Cita obligatoria al agendar y Citas de la ficha, con `aria-label` corregido) y eliminado el `mb-1` duplicado en los divs de pista de Nuevo/Editar Lead. (5) Evidencia: el conteo real es 50 pasos (7+7+6+6+6+6+6+6), 13 notas, 8 secciones y 177 ids en el documento; se corrige el "51 pasos" de la evidencia anterior.
- Verificación reapertura T12: `npm run build` OK (267.50 kB); `npm run lint` (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 177 ids, 0 duplicados, 0 `getElementById`/`querySelector` sin id; `qa-gate` sin hallazgos nuevos (solo `.env.example` preexistente); prueba en Node de la lógica de filtrado con 39 comprobaciones: 8 ids únicos, equivalencia con/sin tilde en 9 pares (gestión/gestion, catálogos/catalogos, teléfono/telefono, día/dia, métricas/metricas, operación/operacion, información/informacion, histórico/historico, automáticos/automaticos, añade/anade), defecto A (`solo añade`, `ver ficha` y `ninguna línea anterior` conservan su sección), defecto B (las 8 secciones con coincidencia solo por resumen muestran su resumen y el aviso de sin pasos) y defecto C (`reprogramar` en `ayuda-citas` muestra el paso 4 con su número original, no 1), más "Sin resultados" para un término inexistente y vacío → 8 secciones.

## Progreso
- Estado: implementación completa y verificada en local (T1-T13 passed — 2026-09-25).
- Última tarea: T13.
- Siguiente paso: humano despliega la UI (T10-T12) y aplica `202609250004_update_lead_with_appointment.sql`; después prueba el checklist manual y decide el commit.
- Bloqueos: migración 004 aún NO aplicada en remoto; prueba manual; commit/push pendiente de petición explícita.
- T10 — Estado: passed. Implementada por el padre (los subagentes ODD fallaron por credencial `Incorrect API key provided`) y verificada de forma independiente por subagente general. Migración `202609250004_update_lead_with_appointment.sql`: las dos RPC canónicas de 0003 se re-crean con row lock y guard `appointment_required_for_agendado_transition`; la nueva `update_lead_with_appointment` aplica el update por rol y crea la cita en la misma transacción, y el trigger de `lead_gestiones` registra `Información → Agendado`. Checks: `git diff --check` sin avisos de whitespace, 3 `security definer` + 3 `search_path`, 3 `for update`, 0 manejadores `exception when`, `begin/commit` único, ACL revoke public/grant authenticated y columnas exactas. Verificador: PASS en los 6 puntos, con nota de orden de despliegue (aplicar 004 DESPUÉS de desplegar la UI de T11).
- T13 — Estado: passed. Suite final: build 267.50 kB OK; lint (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 175 ids, 0 duplicados, 0 `getElementById`/`querySelector` sin id; qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Ficheros afectados: `index.html`, este ODD y la migración 004 (untracked, sin aplicar en remoto).
- Migración remota 004 — Estado: passed por el humano el 2026-09-25. Evidencia visual de SQL Editor: `Success. No rows returned` al ejecutar `202609250004_update_lead_with_appointment.sql`. Nota: aplicada junto al despliegue de la UI de T11/T12; desde ahora pasar de una gestión no agendada a `AGENDAD*` exige cita y la RPC antigua lo rechaza.
- Checklist manual pendiente: `Información → Agendado` con fecha (crea lead actualizado + cita + historial), sin fecha (bloquea con mensaje claro), `AGENDADO DATADURA`, lead ya agendado (explica usar la ficha), `Agendado → Información` (conserva la cita), buscar en la ayuda, botones `?` contextuales y reporte diario.
- T6 — Estado: passed. Suite final: build 231.41 kB OK; lint (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 0 ids duplicados; 0 `getElementById` sin id; qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Revisión estática de migración: 2 tablas, 2 políticas SELECT, revokes/grants, 3 RPCs security-definer y trigger presentes; migración NO ejecutada remotamente.
- Migración remota — Estado: passed por el humano el 2026-09-25. Evidencia visual de SQL Editor: `Success. No rows returned` al ejecutar `202609250002_create_lead_appointments.sql`.
- Migración remota 003 — Estado: passed por el humano el 2026-09-25. Evidencia visual de SQL Editor: `Success. No rows returned` al ejecutar `202609250003_agendado_appointment_creation.sql`.
- Reapertura T8: corregida carga por `lead.id` con visibilidad según gestión, markup admin estático oculto, helper de render/cache con guardas, invalidación de modales y protección de submit/cargas tardías.
- Verificación T8 reabierta: `node --check` de scripts inline OK; pendiente ejecutar suite completa declarada.
- Reapertura T8: corregida carga por `lead.id`, markup admin estático oculto, helper cacheado con guardas, invalidación de modales y protección de submits/cargas tardías.
- Verificación T8 reabierta: `node --check` de scripts inline OK. 
- 2ª reapertura T8: protegidos los submits de Nuevo Lead con token/generación de sesión, pending y cierre seguro del modal; la creación de citas usa try/catch/finally con limpieza única de pending y restauración validada.
- Verificación 2ª reapertura T8: `node --check` de scripts inline, `npm run build`, `npm run lint` y `git diff --check` ejecutados correctamente.
- 3ª reapertura T8: `viewLeadGeneration` invalida cargas/mutaciones de citas al cerrar y reabrir la misma ficha; `pendingAppointmentMutations` usa `Map` con token único y limpieza condicional; `handleCreateLead` revalida tras cada await y limita catch/toast a solicitudes vigentes. Trazas cubiertas: ficha A cerrar/reabrir mismo id, logout y nueva creación con la misma clave, excepción tardía de lead nuevo y segundo await obsoleto en modo no-live.
- Verificación 3ª reapertura T8: `node --check` de todos los scripts inline y `git diff --check` ejecutados correctamente.
- T9 — Estado: passed. Suite final: build 238.66 kB OK; lint (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 OK; 0 ids duplicados; 0 `getElementById` sin id; qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Verificador final: UI condicional, wrapper atómico, generación de ficha, tokens propietarios de mutación y guardas tras cada await sin hallazgos.
- T11 — Estado: passed. Suite: build 247.36 kB OK; lint (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 0 ids duplicados; 0 `getElementById` sin id; qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Sin SQL, sin commit, sin subagentes.
- T12 — Estado: passed. Suite: build 267.13 kB OK; lint (`tsc --noEmit`) OK; `git diff --check` OK; `node --check` 3/3 scripts inline OK; 177 ids, 0 duplicados; 0 `getElementById`/`querySelector` sin id; qa-gate sin hallazgos nuevos (solo `.env.example` preexistente). Sin SQL, sin commit, sin subagentes.
- T12 reapertura — Estado: passed. Suite: build 267.50 kB OK; lint OK; `git diff --check` OK; `node --check` 3/3 OK; 177 ids, 0 duplicados; qa-gate sin hallazgos nuevos. 39 comprobaciones de la lógica de filtrado en Node (con/sin tilde, defectos A/B/C, Sin resultados y vacío). Sin SQL, sin commit, sin subagentes.

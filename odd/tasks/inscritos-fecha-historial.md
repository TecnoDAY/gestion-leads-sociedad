# Inscritos por fecha del historial

## Objetivo
Unificar filtro mensual de Leads, reporte por periodo y CSV mediante las transiciones reales a inscrito del historial.

## Problema y por que
El filtro sigue usando Mes de ingreso y compara una fecha ISO con el nombre del mes. La fecha derivada no se consulta. Taller camara no tiene fila de programa con nivel y queda fuera de ese bloque del reporte.

## Alcance
Consulta SQL compartida, filtros de inscritos actuales por mes y anio, reporte historico de personas inscritas y CSV. Opcion A aprobada: una baja posterior no elimina la inscripcion del reporte historico.
Fuera: despliegues, cambios remotos, commits, notificaciones, reescritura del historial y sustitucion de fechas manuales de programas.

## Restricciones
No descargar historiales completos al navegador. Sin fechas duplicadas persistidas, sin backfill y sin inventar fechas. Preservar permisos y contratos existentes.

## No romper
Filtros de otros estados, captacion por fecha de ingreso, programas y niveles, aislamiento de sesion, paginacion completa y escritorio/movil.

## TDD
Modo: off
Fuente: default
Runner: pnpm test
Checks funcionales y pruebas de regresion obligatorios.

## Tareas
- [x] T1: Migracion local con transiciones compartidas y RPC con permisos.
- [x] T2: Filtro mensual/anual de inscritos actuales y fecha visible en Leads.
- [x] T3: Reporte historico y CSV con personas unicas, incluidos programas sin nivel.
- [x] T4: Pruebas funcionales SQL y frontend, checks y revision independiente.

## Criterios de aceptacion
- [x] Ingreso en septiembre e inscripcion en octubre aparece en octubre. (test frontend: lead 01/09/2026 con fecha 2026-10-05 aparece con mes Octubre)
- [x] Inscrito normal y Data Dura usan la misma regla de fecha pero filtros separados; editar o cambiar entre variantes no mueve la fecha. (tests frontend y SQL)
- [x] Reinscripciones y fechas retroactivas se resuelven por orden del historial con desempate estable. (test SQL: leads 5/6/7 con reentradas y fecha retroactiva)
- [x] Sin evidencia queda pendiente, no se atribuye a otro mes. (test SQL lead 4 null; CSV muestra 'Pendiente')
- [x] Baja posterior conserva conteo historico y se excluye del filtro actual. (test SQL lead 3 archivado; CSV frontend incluye 'No procede' archivado)
- [x] Listado, contador y CSV usan la misma poblacion y no truncan en 1000/2000. (test SQL 2108 personas con paginacion 137; frontend 2105 leads)
- [x] SQL deniega usuarios no CRM/inactivos y auxiliares no son RPC publicas. (test SQL: _crm_inscripcion_eventos denegada; CRM/inactivo/anon rechazados)
- [x] check:app, lint, test y build pasan; sin despliegues. (771 tests JS + 11 Python OK; lint OK; build OK)

## Decisiones aceptadas
Opcion A. Fecha de entrada a familia Inscrito, no ultima llamada. Variantes de Inscrito son una sola familia. Una persona se cuenta una vez por rango; para el detalle se selecciona su ultima entrada registrada dentro del rango. Captacion y fechas manuales de nivel conservan significado independiente.
Correccion humana durante la implementacion: Inscrito no incluye Data Dura en el filtro. Cada uno tiene su filtro separado. El reporte conserva el total general con desglose de ambos grupos segun el estado del evento de entrada.

## Reutilizacion investigada
Reutilizar fetchPagedResult/fetchRowsByIds, lead_gestiones, esInscritoGestion, periodoCsvLines y estado de carga/invalidacion de inscripciones. Mantener RPC antiguas. SQL derivado evita duplicar fechas y descargar todo el historial. Dos revisiones independientes del plan coinciden con este enfoque y senalan el riesgo de confundir personas con eventos.

## Evidencia
Docker esta instalado pero el daemon no esta disponible; PostgreSQL local no esta instalado. Se usa PGlite instalado fuera del repo en /tmp/opencode/inscripciones-postgres, sin dependencias nuevas del CRM ni acceso remoto.
Primera revision independiente: detecto que RLS de leads oculta archivados y bloqueaba todo el CSV historico (P1). Corregido con RPC de detalle estrecha crm_inscripciones_detalle y fixture RLS real.
Segunda revision independiente (revalidacion P1): PASS. CSV pagina la RPC de detalle sin leer leads directamente; archivados incluidos; permisos CRM activo; guardas de sesion/revision/rango/concordancia conservadas.

Checks finales (2026-10-22, arbol local):
- pnpm test: 771 tests JS + 11 Python, todos OK.
- node scripts/tests/inscritos-historial.sql.mjs (PGlite): OK (transiciones, Data Dura, bajas, reinscripciones, retroactividad, desempates, pendientes, permisos, RLS y >2000 personas).
- pnpm lint (tsc + check:app): OK.
- pnpm build: OK.
- qa-gate --strict: sin hallazgos.
- Servidor dev localhost:3000 sirve los cambios (anio de inscripcion, filtros separados, bloque historial presentes).

Pendiente real (no bloquea el cierre local):
- Validacion visual humana en navegador de filtros y exportaciones.
- Aplicar la migracion al proyecto remoto (requiere autorizacion explicita; incluye endurecer lead_inscripcion_fecha_historial creada antes en remoto).

Aplicacion remota (2026-10-22, autorizada por el humano):
- tools.supabase.apply_migration name=inscritos_historial con el cuerpo de supabase/migrations/202610220002_inscritos_historial.sql: success.
- Verificacion read-only posterior: 5 funciones presentes; _crm_inscripcion_eventos sin EXECUTE para anon/authenticated/public; las 4 RPC solo para authenticated; ejecucion sin sesion CRM devuelve crm_access_forbidden (guard verificado).
- Datos reales: 7 transiciones a inscrito, 5 en octubre 2026, 6 personas distintas (consulta directa de solo lectura).
- El error del navegador (rpc inexistente) queda resuelto al recargar localhost:3000.

Segunda aplicacion remota (2026-10-22, autorizada por el humano tras ver el error de conteo invalido):
- tools.supabase.apply_migration name=inscritos_resumen_campana con supabase/migrations/202610220003_inscritos_resumen_campana.sql: success. Incluye DROP previo de crm_inscripciones_detalle porque Postgres no permite cambiar el RETURNS TABLE con create or replace (error 42P13 detectado primero en PGlite y corregido).
- Verificacion con datos reales de octubre 2026: 4 personas (3 Inscrito + 1 Data Dura); por_campana Actuacion kids 2 (1+1), Kids doral ingles 1, Taller camara 1 (suma 4); altas reales 3+1 (coincide con el bloque superior); gestionados en estado inscrito 12+1 (seguimientos, ya no se mezclan con las altas); citas programadas sin sede 1 (antes 3 con otros estados); guard crm_access_forbidden sigue activo.
- Checks tras el cambio: 771 tests JS + 11 Python OK; lint OK; build OK; qa-gate --strict sin hallazgos; prueba SQL PGlite OK (incluye campanas, actividad, estabilidad de clasificacion y permisos).

Tercera iteracion (2026-10-22): regla de clase por fechas confirmada por el humano.
- El humano corrigio la interpretacion: Data Dura es el lead que ingreso en un mes anterior al de su inscripcion, independientemente de la etiqueta guardada en GESTION. Octubre real queda 1 Normal (Jorge) + 3 Data Dura (Yuri, Jeannine, Maislen).
- supabase/migrations/202610220004_inscritos_clase_ingreso.sql (local, pendiente de aplicar en remoto): _crm_fecha_ingreso (parseo dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd; null si no se puede leer), _crm_inscripcion_clase (NORMAL/DATA_DURA/PENDIENTE/INCONSISTENTE por comparacion de mes de ingreso vs inscripcion), crm_inscripciones_historial gana columna clase (DROP previo de las tres funciones dependientes y recreacion), resumen agrega revision y por_campana.revision, detalle gana clase, management_period_summary clasifica las altas reales por fechas (las filas de gestionados en estado siguen separando por el estado del evento).
- Frontend: filtro de Leads clasifica por CLASE INSCRIPCION (la etiqueta deja de decidir; sin clase verificable no aparece en ninguno de los dos filtros), resumen del reporte agrega metrica 'Sin clase (revisar fechas)' y fila de matriz solo con revision, CSV de inscritos gana columna Clase, CSV general agrega revision, ayuda y notas actualizadas.
- Checks locales: 772 tests JS + 11 Python OK; prueba SQL PGlite OK (clases por fechas, PENDIENTE e INCONSISTENTE, revision en resumen/detalle/campanas, altas reales por clase, permisos); lint OK; build OK; qa-gate --strict sin hallazgos.

Aplicacion remota de la clase por fechas (2026-10-22, autorizada por el humano):
- tools.supabase.apply_migration name=inscritos_clase_ingreso con supabase/migrations/202610220004_inscritos_clase_ingreso.sql: success. DROP previo de crm_inscripciones_detalle, crm_inscripciones_resumen y crm_inscripciones_historial (cambio de RETURNS TABLE) y recreacion en orden.
- Verificacion read-only: _crm_fecha_ingreso y _crm_inscripcion_clase sin EXECUTE para nadie; las tres RPC solo para authenticated; guard crm_access_forbidden activo (ejecucion sin sesion CRM rechazada en la linea 4 de la nueva version).
- Datos reales de octubre 2026: 4 personas = 1 Normal (Jorge, ingreso 16/10, inscripcion 21/10) + 3 Data Dura (Maislen ingreso 18/08; Yuri 09/09; Jeannine 29/09). Por campana: Actuacion kids 2 (0+2), Kids doral ingles 1 (0+1), Taller camara 1 (1+0); revision 0; sumas cuadran con el total.

Cuarta iteracion (2026-10-22): fix del validador de actividad (error reportado por el humano en pantalla).
- Sintoma: «La actividad del período devolvió una respuesta inválida» al abrir el reporte de octubre.
- Causa raiz: validatePeriodoActividad (src/legacy/reportes.js) comparaba inscripciones_realizadas_data_dura (clasificadas por fecha de ingreso) contra inscritos_data_dura (separadas por la etiqueta del evento). Con los datos reales (3 altas Data Dura por fechas frente a 1 gestion con etiqueta Data) la cota 3 > 1 rechazaba una respuesta correcta. No era un problema de datos ni requirio migracion.
- Fix minimo: la cota se compara sobre la suma (realizadas_normales + realizadas_data_dura > inscritos_normales + inscritos_data_dura), que si es un invariante real: las altas son un subconjunto de las personas gestionadas estando inscritas, independiente de la clasificacion.
- Prueba de regresion en scripts/tests/resumen-periodo.test.mjs: payload con la forma exacta de octubre (1+3 altas vs 12+1 gestionados) pasa; suma excedida (1+3 > 2+1) sigue fallando.
- Checks: 773 tests JS OK (772 + 1 nuevo), lint OK, build OK, qa-gate --strict sin hallazgos.

Quinta iteracion (2026-10-22, autorizada): redisenio del bloque de inscripciones del reporte por periodo.
- El humano pidio quitar el indicador global (inscritos actuales sin fecha verificable, el 176) y mejorar la estetica del bloque.
- index.html renderPeriodoInscripcionesResumen: tres tarjetas con clase period-metric (total destacado en indo, Inscrito y Data Dura), parrafo breve (las reglas completas siguen en tooltips y ayuda), aviso ambar de fechas por revisar solo cuando hay casos (explicando que ya suman en el total), mensaje unico para periodos vacios, sin dato global.
- src/index.css: #reportePeriodo .period-metric espeja el estilo daily-metric del reporte diario (borde superior de color por posicion, total resaltado).
- src/legacy/reportes.js periodoCsvLines: fila global del CSV retirada; el payload del RPC y el validador no cambian.
- Checks: 779 tests JS OK (nuevo caso de revision>0 con aviso y fila, y caso vacio con tres tarjetas y mensaje unico), lint OK, build OK, qa-gate --strict sin hallazgos.

## Progreso
Estado: implementacion, checks locales y revision independiente completos; validacion visual pendiente.
Ultima tarea: detalle historico de personas, fecha DD/MM/AAAA, clasificacion y programa actual; retirados render y exportador de fechas manuales en esta vista.
Siguiente paso: validar visualmente en navegador el detalle del historial. Sin cambios remotos, commits ni despliegues.

## Sexta iteracion: detalle unificado (2026-10-23)
Alcance aprobado: persona, fecha real de inscripcion, clase y programa actual; sin niveles inferidos ni fecha manual; conservar tarjetas y matriz. No cambiar Supabase ni datos guardados.
Reutilizacion: crm_inscripciones_resumen y crm_inscripciones_detalle (la misma RPC del CSV), fetchPagedResult, claseInscripcionEtiqueta y exportador historico existentes. Retirar de esta vista render y exportador de fechas declaradas; conservar funciones puras y datos de programas para las fichas.
- [x] T5: Carga y render del detalle historico, coherencia con resumen y CSV.
- [x] T6: Tests funcionales, checks y revision independiente por concurrencia/PII.
Evidencia:
- passed: pnpm test: 782 JS + 11 Python, 0 fallos; unit tests de detalle (rango, duplicados, fecha, clase), integracion 2001 filas con paginas de 137, escape HTML, descarte de respuesta tardia, bloqueo trafficker, error sin restos y coherencia CSV.
- passed: pnpm lint (incluye check:app), pnpm build, git diff --check y qa-gate --strict.
- passed: HTTP localhost:3000 devuelve 200; no equivale a una validacion visual.
- passed: prueba SQL PGlite inscritos-historial.sql.mjs: transiciones, clases, permisos y mas de 2000 personas; no se modificaron migraciones.
- passed: revision independiente read-only ses_e973217c6ffeM4F5EOOuGBTGu9 sin hallazgos; 8 pruebas focalizadas y 76 de aislamiento verificadas por el revisor. Lint/build ejecutados por el agente principal (el revisor no los ejecuto).
- Validacion visual navegador: pending.

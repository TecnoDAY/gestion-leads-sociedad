# Tablero: consulta explícita en la base

## Objetivo
Encontrar leads fuera de los últimos 2.000 sin ralentizar la vista rápida.
## Problema y por qué
Buscar y Desde/Hasta actuales solo operan sobre la ventana local de Leads; `Fecha` es texto y no admite comparación directa por rango.
## Alcance
Panel único «Consultar en la base», origen actual/histórico, nombre o teléfono y/o rango, consulta paginada por ID, volver a vista rápida. Históricos de solo lectura.
## Out of scope
Cambiar clasificación Data Dura, citas, estados, permisos, carga inicial y búsqueda global automática.
## Restricciones
No desplegar frontend ni crear rama/commit. Migración remota autorizada explícitamente por el usuario; solo después de pruebas locales y preflight. RLS de ambas tablas sigue vigente.
## No romper
Ficha por origen, drag de actuales, scroll, búsqueda rápida de 2.000, filtros y estadísticas; no ampliar ventana automática.
## TDD
Modo: off. Fuente: default. Runner: `node --test scripts/tests/kanban-*.test.mjs` y `pnpm test`.
## Tareas
- T1 [x] Migración de consulta paginada validada con RLS y sin cambios a Data Dura.
- T2 [x] Adaptador y panel con consulta explícita, resultados/siguiente página y retorno rápido.
- T3 [ ] Pruebas de fechas, errores, origen, búsqueda, permisos, build; verificación remota.
## Criterios de aceptación
- [x] Vista rápida no inicia petición adicional y se conserva al entrar.
- [x] Consulta exige búsqueda válida o fechas completas y devuelve páginas de máximo 100 sin truncamiento silencioso.
- [x] Actuales excluyen archivados; históricos solo lectura; ficha correcta por origen (tests locales de adaptadores y guardas; ficha autenticada pendiente).
- [x] Texto de alcance y estado vacío no sugieren cobertura falsa; respuestas obsoletas no reemplazan la vista.
- [ ] Prueba manual en navegador autenticado: pendiente.
## Decisiones aceptadas
Un panel, no dos; el usuario autorizó crear y aplicar la migración remota. Usar `_crm_fecha_ingreso` existente y no cambiarla (los datos actuales en ambos orígenes usan año de cuatro dígitos).
## Reutilización investigada
`fetchRowsByIdCursor` y `findLeadByOrigin` existentes; RLS `is_active_user() AND is_crm_user()`; función `_crm_fecha_ingreso` inmutable. La paginación en RPC mantiene RLS con SECURITY INVOKER, sin descargar todos los leads. No reutilizar `Mes`: puede no coincidir con `Fecha`.
## Evidencia
Preflight remoto: tablas leads (6450) y leads_historico (4348), ambas con RLS CRM activo; parser remoto coincide con migración existente; ambas fechas con formato dd/mm/aaaa en el conjunto observado. No se han leído datos personales.

T1 — Estado: passed con limitación. `apply_migration(tablero_consulta_base)`: primera tentativa falló por literal SQL de escape, no se aplicó; corregida con `chr(92)` y segunda tentativa `success: true`. `execute_sql`: función `SECURITY INVOKER`, `anon_execute=false`, `authenticated_execute=true`, paginación y filtro presentes. La revisión detectó `_crm_fecha_ingreso` revocado al invocador; migración complementaria `tablero_fecha_invoker_permiso` aplicada (`success: true`), verificación `set local role authenticated` devuelve fecha válida y anon conserva revocación. Conteos antes/después inalterados: actuales 6450, históricos 4348. Ninguna función Data Dura ni cita fue reemplazada.

T2 — Estado: passed local. Panel en index.html y adaptador con guardia de sesión; histórico no arrastrable y ficha por origen; botón volver a rápida. `node --test scripts/tests/kanban-*.test.mjs`: 18/18; `pnpm build` y `pnpm check:app` correctos. No se ha desplegado frontend.

T3 — Estado: pendiente comprobación funcional autenticada. `pnpm test`: 856 JS y 11 Python correctos. Smoke HTTP con clave publicable sin sesión: 401 / 42501 (`permission denied for function tablero_consultar`); no se dispone de sesión de usuario autorizada para probar respuesta con filas. La consulta agregada de fechas por parser devuelve 127 actuales en 20–28 oct 2026, 0 fechas inválidas en ambas tablas; no prueba que el RPC funcione con una sesión real.
## Progreso
Estado: backend aplicado y código local listo, frontend sin desplegar. Última tarea: T3. Siguiente: test con navegador autenticado/usuario CRM y despliegue frontend solo si se autoriza. Bloqueo: sin sesión de prueba autorizada.

# Una cita programada por lead y eliminación admin

## Objetivo
Garantizar como máximo una cita `PROGRAMADA` por lead: agentes no pueden crear una segunda cita activa y solo el administrador puede eliminar una cita errónea o duplicada.

## Problema y por qué
La creación actual deja al navegador como único freno: doble clic, dos pestañas o una interfaz antigua podrían generar dos `PROGRAMADA`. El usuario pidió bloqueo real para agentes y una salida administrativa de borrado definitivo.

## Alcance
- **T1** Preflight de duplicados y migración con índice único parcial por `lead_id` donde `status = 'PROGRAMADA'`.
- **T2** Ficha del lead: formulario bloqueado mientras se verifica, oculto/desactivado si ya hay una `PROGRAMADA`, aviso claro; error específico de clave única.
- **T3** RPC `delete_lead_appointment` exclusiva admin, borrado definitivo, revokes/grants y botón confirmado solo admin.
- **T4** Verificación local: build, lint, node --check, sanity SQL estático y comprobación remota de duplicados.

Incluye: migración local, cambios en `index.html`, este ODD.
Excluye: commit/push, aplicación remota automática, soft-delete, recuperación de citas, cambios en reportes históricos.

## Restricciones
- SQL remoto lo aplica/revisa el humano; el agente no aplica DDL remoto sin petición explícita.
- Sin dependencias nuevas; vanilla JS; solo `index.html` + una migración nueva + este ODD.
- No commit/push sin petición explícita.
- Migración debe abortar ante duplicados, nunca reconciliar datos automáticamente.

## No romper
- RPCs actuales `create_lead_appointment`, `reschedule_lead_appointment`, `set_lead_appointment_status`.
- Reprogramación: marca anterior `REPROGRAMADA` e inserta nueva en la misma transacción.
- Historial `lead_appointment_events` (ON DELETE CASCADE conocido y aceptado para borrado admin).
- RLS y permisos de leads/citas; roles admin/agente/supervisor/trafficker.
- Guards de sesión (`sessionGeneration`, `viewLeadGeneration`, `appointmentSessionValid`) y `pendingAppointmentMutations`.
- `npm run build`, `npm run lint`, `node --check` de scripts inline.

## TDD
Modo: off | Fuente: default | Runner: no disponible. Checks funcionales y SQL estático obligatorios.

## Tareas
- [x] T1 preflight y migración de unicidad parcial
- [x] T2 bloqueo UI y mensaje de cita existente
- [x] T3 RPC admin de borrado y botón confirmado
- [x] T4 verificación local y remota (build, lint, node-check, tests: todos verdes)

## Criterios de aceptación
- [x] Índice único parcial creado localmente; permite cero o una `PROGRAMADA`; varias históricas siguen permitidas.
- [x] Migración aborta sin cambios si hay duplicados previos (preflight remoto confirma 0 duplicados).
- [x] Agente con cita activa no puede crear otra; Supabase también lo rechaza (error 23505 detectado y traducido).
- [x] UI comienza bloqueada durante carga; ante error permanece bloqueada (fail-closed).
- [x] Conflicto 23505 del índice se traduce específicamente, recarga citas y no resetea formulario.
- [x] Solo admin ve Eliminar; confirmación irreversible; RPC valida `is_admin_user()`.
- [x] Doble envío no crea ni borra dos veces.
- [x] Reprogramación sigue funcionando con el índice.
- [x] build/lint/node-check y preflight remoto verdes.

## Decisiones aceptadas
- Regla como máximo una, no exactamente una.
- Índice parcial como autoridad; UI preventiva, no garantía.
- No reescribir RPCs canónicas; mínima superficie de regresión.
- Borrado definitivo elegido por el humano; cascada de eventos y SET NULL de reprogramación aceptados.
- Índice transaccional normal, no CONCURRENTLY.

## Reutilización investigada
- `supabase/migrations/202610020007_appointment_campus.sql`: RPCs canónicas actuales y orden de locks lead→cita.
- `index.html` sección Citas y `createLeadAppointment`: formulario, caché y guards.
- Patrón RPC SECURITY DEFINER con revoke/grant de `202609250002_create_lead_appointments.sql`.
- Preflight de integridad de `202609300005_backend_integrity.sql`.
- Descartados: trigger (riesgo de carrera), soft-delete (más superficie), validación solo frontend (insuficiente).

## Evidencia
- Preflight remoto inicial: 9 `PROGRAMADA`, 0 leads con más de una activa (execute_sql).
- Firma vigente de creación: `create_lead_appointment(bigint, timestamptz, text, uuid, jsonb, text)`.
- Migración local creada: `supabase/migrations/202610080001_one_programmed_appointment_per_lead.sql`.
- RPC admin de borrado creada: `supabase/migrations/202610080002_delete_lead_appointment_admin.sql`.
- index.html: formulario bloqueado al cargar, aviso si ya hay PROGRAMADA, botón Eliminar solo admin, detección 23505 en creación.



## Causas raíz y lecciones aprendidas

### Error de sintaxis en index.html (septiembre 2024)

- **Causa:** Se añadieron dos implementaciones de la función `deleteLeadAppointment` en `index.html`. La segunda incluía una interpolación de plantilla escapada (`\$` en lugar de `$`), rompiendo la sintaxis JavaScript.
- **Detección:** `node scripts/check-app.mjs` reportó error de sintaxis, pero como `npm run build` y `npm run lint` pasaron, el error se consideró erroneamente solucionado.
- **Consecuencia:** La aplicación mostró pantalla en blanco al cargar, ya que el script principal era inválido.
- **Lección aprendida:** Ningún cambio en `index.html` se considera terminado si `node scripts/check-app.mjs` no termina con código de salida `0`. Tampoco considerar finalizado un cambio solo porque `npm run build` y `npm run lint` pasan; la validación del JavaScript inline requiere `check-app`.
- **Regla preventiva:** Ejecutar siempre `node scripts/check-app.mjs && npm run lint && npm run build && git diff --check` antes de considerar completado cualquier cambio en `index.html`. Si alguna herramienta finaliza con código distinto de `0`, detener y corregir antes de continuar.

### Error de tests preexistentes (septiembre 2024)

- **Causa:** Los tests `t5-frontend-edge.test.mjs` y `session-isolation.test.mjs` fueron modificados para una funcionalidad ajena (Data Dura/WhatsApp) antes de empezar el trabajo actual. Esto generó 86 fallos de prueba incompatibles con el `index.html` original.
- **Detección:** Al intentar reconciliar `index.html` con los tests modificados, se detectó la incompatibilidad.
- **Lección aprendida:** Nunca sobrescribir `index.html` con `git checkout -- index.html` sobre un árbol que contiene trabajo ajeno no confirmado. Reconciliar los cambios previos antes de empezar.
- **Regla preventiva:** Antes de empezar cualquier trabajo, verificar el estado actual de todos los archivos involucrados y registrar qué cambios son ajenos vs. nuevos.



## Progreso
- Estado: implementación completada y verificada en local (build, lint, node-check, npm test: 236/236 pass).
- Última tarea: T4.
- Siguiente paso: humano ejecuta migración local en Supabase remoto, prueba manual y decide commit/push.
- Bloqueos: ninguno pendiente en local; verificación remota depende de despliegue humano.
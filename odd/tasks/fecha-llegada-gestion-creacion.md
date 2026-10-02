# Fecha de llegada editable + creación como gestión diaria

## Objetivo
- Al crear un lead, la **Fecha de llegada** es editable: hoy (Miami) por defecto, cualquier fecha pasada permitida, futuras rechazadas; `Mes` se calcula de esa fecha.
- Crear un lead registra **una** gestión inicial en `lead_gestiones` con la fecha real de creación, para que aparezca en el Reporte Diario del día trabajado.

## Problema y por qué
- Hoy `create_lead` fija `Fecha` a hoy: los leads llegados de noche/madrugada se registran al día siguiente con fecha incorrecta.
- La creación no genera `lead_gestiones` (solo hay trigger de UPDATE): crear no cuenta como gestión del día pese a ser trabajo real.

## Alcance (aprobado)
- Orden 0: commit+push del ajuste de Citas pendiente (RLS lectura equipo + quitar columna Medio).
- T1: `create_lead` valida `Fecha` (opcional; hoy Miami por defecto; futura o inválida → `appointment_date_invalid`), calcula `Mes` desde ella y registra la gestión inicial (autor = auth.uid, canal = Tipo de Última Gestión, Data Dura explícita vía regla actual).
- T2: formulario Nuevo Lead: campo Fecha de llegada (`max=hoy`), mes se actualiza solo.
- T3: tests + gates.
- T4: migración remota + commit/push con autorización.

## Fuera de alcance
- No cambiar `daily_management_report` (ya lee `lead_gestiones`).
- No registrar gestión en imports (`create_lead_record` queda sin registro; decision deliberada).
- No tabla students.

## No romper
- `create_lead_with_appointment` reutiliza `create_lead`: gestión inicial exactamente 1, sin duplicar al crear la cita.
- Reglas Data Dura por Mes/Fecha intactas para históricos.
- Formato `Fecha` almacenado DD/MM/YYYY.
- Agendado sin cita sigue bloqueado (`appointment_required_for_agendado_transition`).

## TDD
- Modo: off (default), checks funcionales y de contrato obligatorios (npm test, lint, build, diff-check, qa-gate + verificación SQL remota).
- Runner: `npm test`; lint; build.

## Tareas
- [x] T0 Commit/push ajuste Citas (RLS + Medio) → `d6a8f99..3edb877` en origin/main (ver git log).
- [x] T1 Migración `202610020004_create_lead_fecha_gestion.sql` + aplicada remoto (`create_lead_fecha_gestion` en list_migrations; valida fecha, deriva Mes, inserta gestión inicial).
- [x] T2 Frontend: campo `newFechaLlegada` (max=hoy), Mes deshabilitado y derivado (`syncNewLeadMes`), validación de fecha futura en `handleCreateLead`.
- [x] T3 Tests + gates: 194 Node + 11 Python, lint, build, diff-check, qa-gate.
- [ ] T4 Commit/push.

## Evidencia
- `npm test`: 194 pass / 0 fail; lint, build, `git diff --check` y qa-gate verdes.
- Remoto: `pg_get_functiondef(create_lead(jsonb))` contiene `fecha_llegada_invalida` y el insert en `lead_gestiones`.
- Correcciones durante implementación: edición de test que rompió la cabecera del test de citas (restaurada); `newMes` ahora deshabilitado con `syncNewLeadMes`.

## Progreso
- Estado: implementada y verificada; pendiente commit/push.

## Criterios de aceptación
- Lead recibido ayer creado hoy: Fecha/Mes = ayer, aparece en Creados hoy y Gestionados hoy, una sola gestión.
- Fecha futura rechazada en frontend y backend.
- Creación con cita no duplica gestión.
- Todos los tests previos siguen verdes.

## Reutilización investigada
- `create_lead` (202610010002) es la entrada canónica; `create_lead_record` queda para imports sin registro.
- Trigger existente `record_lead_gestion` es solo AFTER UPDATE; no se toca.
- `_daily_report_data_dura` ya discrimina Data Dura explícito vs histórico.

## Progreso
- Estado: en curso. Última: T0. Siguiente: T1.

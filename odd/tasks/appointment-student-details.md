# Feature: datos del estudiante en citas (nombre, correo de contacto, edad) con edición posterior

## Objetivo
Al agendar, el formulario pide Nombre del estudiante, Correo de contacto y Edad (los tres opcionales). Se muestran en la pestaña Citas y en la ficha del lead, y pueden corregirse después (asesor asignado o admin).

## Decisión (aprobada)
- Columnas tipadas en `lead_appointments`: `student_name text`, `contact_email text`, `student_age smallint`, todas NULL.
- RPC central de creación nueva firma: `create_lead_appointment(bigint,timestamptz,text,uuid,jsonb)` con `p_details`; wrappers compatibles mantienen la firma de 4 argumentos. `create_lead_with_appointment` y `update_lead_with_appointment` obtienen firma paralela con `p_details` y llaman a la central. Firmas viejas = wrappers.
- Validación server-side (solo si traen valor): nombre ≤200, correo ≤254 y formato, edad entera 0-120; vacío → NULL.
- Edición: `update_lead_appointment_details(p_id, p_details)` — asesor asignado o admin; no toca fecha/estado/reportes.
- Reschedule copia `is_data_dura` (BUG actual: no se copia) + los tres campos.

## Frontend
- Formulario de cita reutilizable en las 3 rutas: Nuevo lead, Editar lead (Agendado) y ficha del lead.
- Pestaña Citas: columnas Estudiante/Correo/Edad + botón "Editar datos".
- Ficha: tarjeta de cita muestra los tres datos + edición inline/modal.

## Tareas
- [x] T1 Migración `202610020002_appointment_student_details.sql` + aplicada remoto.
- [x] T2 Frontend: formularios, tabla, ficha, edición + tests.
- [x] T3 Gates (npm test, lint, build, diff-check, qa-gate).
- [ ] T4 Commit/push bajo decisión humana.

## Progreso
- Estado: implementada, pendiente commit/push.

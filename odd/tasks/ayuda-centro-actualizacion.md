# Centro de Ayuda: corregir contradicciones y documentar funciones nuevas

## Objetivo
Que la ayuda refleje el comportamiento real: Fecha de llegada con Mes derivado, citas compartidas con edición restringida, aviso de teléfono repetido, badge Nuevo, canal Llamada WhatsApp, Llamada Data Dura manual, datos del estudiante y creación como gestión del día.

## Problema y por qué
`HELP_SECTIONS` afirma que la asesora elige el Mes manualmente y que "el agente solo ve sus propias citas": ambas son falsas desde 202610020004 y 202610020003. Además no explica el aviso de teléfono, la etiqueta Nuevo ni los datos del estudiante, y la pestaña Campañas carece de guía.

## Alcance (aprobado)
- T1ayuda Crear/Gestionar: fecha de llegada, Mes automático, aviso de teléfono, gestión del día, badge Nuevo, canales manuales, teléfono editable.
- T2 Citas: lectura compartida, edición restringida, datos del estudiante, reprogramar conserva, sin columna Medio.
- T3 Reporte/Data Dura: crear cuenta como gestionado, Llamada WhatsApp cuenta una vez, Data Dura manual, ASISTIO=Visita.
- T4 Roles: lectura compartida vs. modificación de lo asignado.
- T5 Nueva sección Campañas.
- T6 Tests anti-desactualización + gates.

## No romper
Estructura del modal (búsqueda sin diacríticos, navegación por `?` contextual, foco y retorno). No se toca Supabase.

## Tareas
- [x] T1 Crear/Gestionar: fecha de llegada, Mes automático, aviso de teléfono, gestión del día, badge Nuevo, canales manuales, teléfono editable, edición de datos de cita.
- [x] T2 Citas: calendario compartido, edición restringida, datos del estudiante, reprogramar conserva, tabla sin Medio.
- [x] T3 Reporte/Data Dura: alta como gestión, Visita=ASISTIO, Agendados Data Dura, Llamada WhatsApp cuenta una vez.
- [x] T4 Roles: lectura compartida vs. gestión de lo asignado; filtro Asesor para admin y supervisor.
- [x] T5 Nueva sección `ayuda-campanas`.
- [x] T6 Test anti-desactualización (bloque HELP_SECTIONS) + gates: 198 Node + 11 Python, lint, build, diff-check, qa-gate.

## Evidencia
- Test nuevo: `ayuda: refleja el comportamiento actual y no repite reglas retiradas` (no permite "Elige el Mes de origen", "solo ve/gestiona sus propios leads", "solo ves tus propias citas"; exige fecha de llegada, aviso de teléfono, calendario completo, datos del estudiante, alta como gestión, badge Nuevo, Llamada WhatsApp y sección de campañas).
- Verificado en el formulario: `required` solo en newNombre y newTelefono; la ayuda mantiene "únicos campos obligatorios".

## Corrección durante la implementación
Un texto corrupto se coló al editar Reporte diario ("No.twitter NewmanMarks..."); detectado y corregido a "No asistió hoy" antes de los gates.

## Progreso
- Estado: implementada y verificada; pendiente commit/push.
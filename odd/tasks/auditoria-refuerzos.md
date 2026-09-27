# Auditoría adversarial y refuerzos (P0-P3)

Fecha: 2026-09-26 · Estado: implementado y verificado · Origen: revisión adversarial solicitada por el humano.

## Alcance
- P0: limpiar 4.797 gestiones fantasma creadas por la migración 202609260001 + blindar el trigger `record_lead_gestion` contra actores sin sesión.
- P1: cerrar el XSS almacenado en la matriz (onclick inline con datos de catálogo) y endurecer `escapeAttr`.
- P2: guardas anti-duplicado (nota nueva, ventana del modal de edición, authorize-user).
- P3: fallos silenciosos (catch en estado/reschedule de citas, `res.error` sin comprobar en loadCitas).

Fuera de alcance: idempotencia en alta de leads y debounce de filtros (P4, requiere decisión de diseño); teléfonos duplicados (intencionales según el humano).

## Tareas
- [x] T1 (P0) migración `202609260002_fix_lead_gestiones_fantasma.sql`: respaldo `_bkp_lead_gestiones_20260926` (sin grants para la API), borrado con doble predicado (sin autor + ventana exacta del lote) y blindaje del trigger (`auth.uid() is null → return NEW`).
- [x] T2 (P1) matriz sin onclick con datos: celdas con `data-matrix-gestion`/`data-matrix-campana` + listener delegado; `escapeAttr` ahora escapa `& < > " '`.
- [x] T3 (P1) `lead.id` escapado en la ficha (L3174).
- [x] T4 (P2/P3) guarda `force` en `closeEditLeadModal` (el camino de éxito pasa `true`), botón de nota deshabilitado durante el guardado, catch en `setLeadAppointmentStatus`/`rescheduleLeadAppointment`, chequeo `res.error` en `loadCitas`, guarda + catch en `handleAuthorizeUser`.

## Errores encontrados durante la implementación (corregidos)
- El primer edit de `filterFromMatrix` dejó un `}` huérfano (el oldString no incluía el cierre de la función): detectado con `sed` inmediatamente después y eliminado.
- El script de verificación SQL tenía una referencia rota (`migraciones_list`): corregido y reejecutado.

## Evidencia
- BD tras T1: `lead_gestiones` = 5 (todas con `autor_user_id` no nulo), 0 sin autor, `leads` = 5.815 intacto, respaldo = 4.797, `anon`/`authenticated` sin SELECT sobre el respaldo, guarda presente en el trigger, `list_migrations` registra `20260926235338`.
- PoC XSS reproducido en local antes del fix (entidades decodificadas dentro del atributo onclick inyectaban JS); tras el fix no queda ningún `onclick` que interpole datos (grep 0) y `escapeAttr` ya no deja pasar `&<>`.
- `node --check` sobre el script extraído (3.249 líneas) OK; `npm run build` OK; `npm run lint` OK; `git diff --check` limpio.

## Progreso
- Estado: implementado, verificado y subido a `origin/main` (`f3df141` migracion P0, `2367032` codigo P1-P3).
- Revision visual del humano pendiente: clic en celda de la matriz, doble clic en "anadir nota", cerrar el modal de edicion mientras guarda.

## Recordatorio abierto (decision del humano, no borrar sin preguntar)
- Tabla `public._bkp_lead_gestiones_20260926` (4.797 filas, ~520 kB, sin grants para `anon`/`authenticated`): contiene las 4.797 gestiones fantasma borradas por `202609260002`, por si el predicado del borrado hubiera sido demasiado amplio.
- El humano decide borrarla tras revisar el historial en la app. Fecha de revision acordada: **2026-10-03**.
- Si sigue ahí en esa fecha, preguntar antes de hacer nada; el `drop table` es irreversible.

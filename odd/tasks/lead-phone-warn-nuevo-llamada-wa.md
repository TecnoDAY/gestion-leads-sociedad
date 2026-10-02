# Leads: aviso teléfono existente, etiqueta "Nuevo" mensual y etiqueta "Llamada WhatsApp"

## Objetivo
1. Al teclear el teléfono en Nuevo Lead, avisar si ya existe en la base (sin bloquear: puede ser otra oportunidad).
2. Los leads muestran etiqueta "Nuevo" durante el mes/año de su Fecha de llegada (Miami).
3. El selector muestra "Llamada WhatsApp"; internamente y en conteos sigue `Llamada y WhatsApp`.

## Alcance (aprobado)
- T1 RPC `check_lead_phone_occurrences(p_phone)` → jsonb {total, actuales, historico, archivados}; solo CRM; sin PII; normaliza a dígitos.
- T2 Aviso debajo de newTelefono (debounce + blur, generación anti-obsolescencia); no bloquea.
- T3 Helper `isNuevoEsteMes(fechaTexto)` + badge en tabla operativa (fecha de llegada vs hoy Miami).
- T4 Renombrado de etiqueta visible en selector, reporte y CSV.
- T5 Tests + gates; T6 migración remota + commit/push con autorización.

## No romper
- Conteos del reporte (`llamada y whatsapp` canónico) intactos; suma una sola vez al total.
- Históricos y Data Dura; creación de leads duplicados sigue permitida por diseño.

## TDD: off (default). Runner: npm test; lint; build; diff-check; qa-gate.

## Tareas / Evidencia
- [x] T1 Migración `202610020005_check_lead_phone_occurrences.sql` aplicada remoto (solo conteos, guardas CRM, dígitos 7-15).
- [x] T2 Aviso bajo `newTelefono` (oninput debounce 450ms + blur, generación anti-obsolescencia y guardia de sesión); no bloquea el guardado; se limpia al abrir/cerrar el modal.
- [x] T3 `isNuevoEsteMes` + `nuevoBadge` esmeralda en la tabla operativa (Fecha vs mes/año Miami).
- [x] T4 Etiqueta "Llamada WhatsApp" en selector, historial, reporte y CSV; valor y conteo canónicos intactos.
- [x] T5 197 Node + 11 Python, lint, build, diff-check, qa-gate verdes.
- [ ] T6 commit/push.

## Correcciones durante implementación
- Harness de tests: faltaban `normalizePhone`, `newPhoneCheckGeneration`/`newPhoneCheckTimer` en el contexto vm.

## Progreso
- Estado: implementada y verificada; pendiente commit/push.

## Reutilización
- `normalizePhone` (frontend) y normalización de dígitos `lead_contacts` (backend).
- `parseFechaLead` para la fecha de llegada.

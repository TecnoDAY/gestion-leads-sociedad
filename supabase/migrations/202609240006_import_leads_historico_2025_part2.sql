-- Importacion de los 4.348 leads del CSV 2025 en public.leads_historico (odd/tasks/historico-2025.md, T2).
-- Origen: Gestion SAH 2025 - Leads Entrantes .csv (UTF-8, 4.348 filas de datos, 12 columnas).
-- Generado localmente con Python; NO ejecutado por el repositorio.
-- Revisar en el SQL editor de Supabase y ejecutar las partes en orden (part1 -> part3); cada parte es una transaccion.
-- Vacios -> NULL via NULLIF('',''); Nombre = trim(Nombre)+' '+trim(Apellido); source_year=2025 con source_file/source_row de auditoria.
-- Parte 2 de 3 (1411 filas).

begin;

-- ------------------------------------------------------------------
-- PII RETIRADA DEL REPOSITORIO (2026-10-19, auditoria de seguridad).
-- El payload original contenia 1.556 leads reales (nombre, telefono, campana
-- y observaciones). Se sustituye por esta nota para que la PII de produccion
-- no siga dentro del git.
-- Los datos ya estan en public.leads_historico; la migracion esta aplicada y
-- la version 202609240006 queda registrada en el historico remoto. Reconstruir el
-- historico desde cero exigiria el CSV original, que no se versiona por el
-- mismo motivo.
-- ------------------------------------------------------------------
commit;

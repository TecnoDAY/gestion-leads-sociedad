-- Cierre del acceso publico a la tabla de respaldo _bkp_leads_20261005.
-- Es un respaldo puntual de leads (Nombre, Telefono, OBSERVACIONES, Ciudad,
-- AGENTE) creado por una importacion; no la consume la aplicacion.
-- Estado verificado antes del cambio: RLS desactivado y ALL concedido a anon y
-- authenticated, asi que cualquier llamada con la clave publica podia leer y
-- modificar esas filas (comprobado por HTTP: SELECT devolvia 200 con 2 filas).
--
-- La tabla NO se borra: conserva sus datos. Solo se retira el acceso de los
-- roles de API. postgres y service_role conservan sus privilegios.
--
-- Verificacion esperada despues de aplicar:
--   - informacion_schema: sin privilegios para anon ni authenticated.
--   - HTTP con la clave publica: sin lectura ni escritura.
--   - select count(*) como postgres/service_role: 2 filas intactas.
--
-- Rollback manual (solo si se necesitara reabrir el acceso):
--   alter table public._bkp_leads_20261005 disable row level security;
--   grant select, insert, update, delete, references, trigger, truncate
--     on public._bkp_leads_20261005 to anon, authenticated;

begin;

revoke all on public._bkp_leads_20261005 from anon, authenticated;
alter table public._bkp_leads_20261005 enable row level security;

commit;

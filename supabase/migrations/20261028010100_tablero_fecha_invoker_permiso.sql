-- Corrección posterior a la migración del Tablero aplicada en remoto:
-- invoker requiere EXECUTE en el parser puro (sin acceso a tablas ni datos).
begin;
grant execute on function public._crm_fecha_ingreso(text) to authenticated;
commit;

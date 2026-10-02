-- Seguridad: activar RLS en la copia de seguridad de gestiones (2026-09-26).
-- Sin políticas: el resultado es fail-closed; nadie fuera del propietario
-- (y el admin/service_role por bypass RLS) puede leerla. Permisos ya revocados.
begin;

alter table public._bkp_lead_gestiones_20260926 enable row level security;

-- Defensa en profundidad: los privilegios permanecen restringidos incluso si
-- alguien invocase posteriormente GRANT por error.
revoke all on public._bkp_lead_gestiones_20260926 from anon, authenticated;

commit;

-- Rollback manual tras revisar: disable row level security (mantiene la tabla).

-- Preferencia por usuario del cierre automatico por inactividad.
-- El cierre (aviso a los 4 minutos, cierre a los 5) aplica solo a rol 'agente'
-- cuando idle_timeout_enabled es true. La desactivacion de cuenta (activo=false)
-- sigue invalidando el acceso en la siguiente validacion, con o sin preferencia.
-- Esta migracion es intencionalmente NO aplicada por este repositorio.
-- Revisarla en el SQL editor de Supabase antes de aplicarla al proyecto remoto.

begin;

alter table public.user_access
  add column if not exists idle_timeout_enabled boolean not null default true;

-- La firma no cambia: la accion 'set_idle_timeout' reutiliza p_activo como valor
-- de la preferencia para no crear una sobrecarga nueva de la funcion.
create or replace function public.admin_manage_user_access(
  p_action text,
  p_user_id uuid default null,
  p_activo boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  if p_action = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'email', email, 'nombre', nombre, 'role', role, 'activo', activo,
      'idle_timeout_enabled', idle_timeout_enabled
    ) order by lower(email)), '[]'::jsonb)
    into result
    from public.user_access;
    return result;
  elsif p_action = 'set_active' and p_user_id is not null then
    update public.user_access set activo = coalesce(p_activo, false), updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception using errcode = 'P0002', message = 'user_not_found'; end if;
    return jsonb_build_object('user_id', p_user_id, 'activo', coalesce(p_activo, false));
  elsif p_action = 'set_idle_timeout' and p_user_id is not null then
    update public.user_access set idle_timeout_enabled = coalesce(p_activo, true), updated_at = now()
    where user_id = p_user_id;
    if not found then raise exception using errcode = 'P0002', message = 'user_not_found'; end if;
    return jsonb_build_object('user_id', p_user_id, 'idle_timeout_enabled', coalesce(p_activo, true));
  end if;

  raise exception using errcode = '22023', message = 'unsupported_user_action';
end;
$$;

-- CREATE OR REPLACE conserva los privilegios existentes; se reafirma el contrato
-- para que la funcion nunca quede executable por anon/public (hallazgo 0028 del
-- linter de seguridad: el RPC era ejecutable por anon).
revoke all on function public.admin_manage_user_access(text, uuid, boolean) from public;
revoke all on function public.admin_manage_user_access(text, uuid, boolean) from anon;
grant execute on function public.admin_manage_user_access(text, uuid, boolean) to authenticated;

comment on column public.user_access.idle_timeout_enabled is
  'Preferencia por usuario del cierre automatico por inactividad (aviso 4 min, cierre 5 min); true por defecto. activo=false sigue invalidando el acceso con o sin preferencia.';

commit;

-- Rollback (manual, tras revision): alter table public.user_access drop column if exists idle_timeout_enabled;
-- y restaurar admin_manage_user_access desde 202609230001_secure_otp_roles_archiving.sql.
-- No ejecutar esto automaticamente contra el proyecto remoto.

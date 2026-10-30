-- 202609300001_sync_user_access_email
--
-- Mantiente sincronizado el correo de user_access con el de Auth.
-- El cambio de correo de una cuenta existente se confirma dentro de Supabase
-- Auth (enlace al correo nuevo) y no pasa por ninguna Edge Function, asi que
-- quien aplica el cambio es la propia base de datos: sin trigger, el panel
-- quedaria mostrando el correo antiguo para siempre.
--
-- Solo copia la direccion; user_id, role, activo y el historial no se tocan.
--
-- Estado: aplicada en el proyecto remoto el 2026-09-30 (ver ODD cambio-correo).

begin;

create or replace function public.sync_user_access_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target text := lower(btrim(new.email));
begin
  if target is null or target = lower(btrim(old.email)) then
    return new;
  end if;

  -- Si otra fila ya ocupa ese correo, se salta en lugar de fallar: abortar aqui
  -- romperia la verificacion de Auth dentro de la misma transaccion. La
  -- colision se evita validando antes de enviar el enlace.
  update public.user_access
     set email = target,
         updated_at = now()
   where user_id = new.id
     and email is distinct from target
     and not exists (
       select 1
         from public.user_access u
        where u.email = target
          and u.user_id is distinct from new.id
     );

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;
create trigger on_auth_user_email_sync
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_access_email();

revoke execute on function public.sync_user_access_email() from public;
revoke execute on function public.sync_user_access_email() from anon;
revoke execute on function public.sync_user_access_email() from authenticated;
grant execute on function public.sync_user_access_email() to service_role;

comment on function public.sync_user_access_email() is
  'Copia auth.users.email a user_access.email tras un cambio confirmado; no toca user_id, role ni activo.';

commit;

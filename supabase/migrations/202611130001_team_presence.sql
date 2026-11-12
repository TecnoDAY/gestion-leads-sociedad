-- Equipo: solo presencia del equipo activo, sin datos de cuenta privados.
begin;

create or replace function public.list_team_presence()
returns table(user_id uuid, nombre text, role text, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;

  return query
    select ua.user_id, coalesce(ua.nombre, '')::text, ua.role::text, p.last_seen_at
    from public.user_access ua
    left join public.crm_task_presence p on p.user_id = ua.user_id
    where ua.activo = true
    order by lower(coalesce(ua.nombre, '')), ua.user_id;
end;
$$;

revoke all on function public.list_team_presence() from public, anon;
grant execute on function public.list_team_presence() to authenticated;

commit;

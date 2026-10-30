-- Las asesoras y supervisoras leen solo sus tareas y la bandeja general.
-- Retirar una tarea (incluso completada) conserva la fila y el historial.
begin;

drop policy if exists crm_tasks_select on public.crm_tasks;
create policy crm_tasks_select on public.crm_tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.user_access ua
      where ua.user_id = (select auth.uid()) and ua.activo = true
        and ua.role in ('agente', 'supervisor', 'admin')
        and (ua.role = 'admin'
          or assignee_id = (select auth.uid())
          or (status = 'sin_asignar' and assignee_id is null))
    )
  );

create or replace function public.cancel_crm_task(p_task_id uuid)
returns public.crm_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  canceled public.crm_tasks;
begin
  select * into access from public.user_access
  where user_id = auth.uid() and activo = true;
  if access.id is null or access.role <> 'admin' then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;

  update public.crm_tasks
  set status = 'cancelada',
      updated_at = now(),
      history = history || jsonb_build_array(jsonb_build_object('type', 'canceled', 'by', auth.uid(), 'at', now()))
  where id = p_task_id and status in ('asignada', 'sin_asignar', 'completada')
  returning * into canceled;

  if canceled.id is null then
    raise exception using errcode = '40001', message = 'task_not_cancelable';
  end if;
  return canceled;
end;
$$;

revoke all on function public.cancel_crm_task(uuid) from public, anon, authenticated;
grant execute on function public.cancel_crm_task(uuid) to authenticated;
commit;

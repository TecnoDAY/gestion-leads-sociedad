-- Aviso informativo al crear un lead con un telefono que ya existe (no bloquea:
-- el mismo contacto puede traer otra oportunidad o campaña). Devuelve solo
-- conteos para no exponer datos del duplicado en el formulario.
begin;

create or replace function public.check_lead_phone_occurrences(p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_actual int := 0;
  v_archivado int := 0;
  v_historico int := 0;
begin
  if not public.is_active_user() or not public.is_crm_user() then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if length(v_digits) < 7 then
    return jsonb_build_object('total', 0, 'actuales', 0, 'archivados', 0, 'historico', 0);
  end if;
  if length(v_digits) > 15 then
    raise exception using errcode = '22023', message = 'telefono_invalido';
  end if;
  select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
  into v_actual, v_archivado
  from public.leads
  where regexp_replace(coalesce("Telefono", ''), '[^0-9]', '', 'g') = v_digits;
  select count(*) into v_historico
  from public.leads_historico
  where regexp_replace(coalesce("Telefono", ''), '[^0-9]', '', 'g') = v_digits;
  return jsonb_build_object('total', v_actual + v_archivado + v_historico, 'actuales', v_actual, 'archivados', v_archivado, 'historico', v_historico);
end;
$$;

revoke all on function public.check_lead_phone_occurrences(text) from public, anon;
grant execute on function public.check_lead_phone_occurrences(text) to authenticated;

commit;

-- Rollback manual: drop function public.check_lead_phone_occurrences(text).

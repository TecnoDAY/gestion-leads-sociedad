-- Additive, read-only history endpoint. Names are limited to metric authors;
-- this does not grant access to a user directory or change mutation contracts.
begin;

create or replace function public.list_campaign_metrics_with_authors_v2(p_campaign_name text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  return (
    select coalesce(jsonb_agg(
      to_jsonb(h) || jsonb_build_object('author_name', nullif(btrim(a.nombre), ''))
      order by h.start_date desc, h.created_at desc, h.id
    ), '[]'::jsonb)
    from public.campaign_metrics_history_v2 h
    left join public.user_access a on a.user_id = h.created_by
    where p_campaign_name is null or h.campaign_name = btrim(p_campaign_name)
  );
end;
$$;

revoke all on function public.list_campaign_metrics_with_authors_v2(text) from PUBLIC, anon;
grant execute on function public.list_campaign_metrics_with_authors_v2(text) to authenticated;

commit;

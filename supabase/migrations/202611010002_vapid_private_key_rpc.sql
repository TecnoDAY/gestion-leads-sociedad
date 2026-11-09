-- notify-lead-change read the VAPID private key with
-- .from('vault.decrypted_secrets'), which PostgREST resolves as the table
-- "public.vault.decrypted_secrets" (PGRST205), so every push failed with
-- vapid_secret_unavailable. Expose the key only to service_role through a
-- definer RPC; the secret stays in Vault.
-- plpgsql: the body is not validated at creation, so this also applies on a
-- local database without the Vault extension.
begin;

create or replace function public.get_vapid_private_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'vapid_private_key'
  limit 1;
  return v_key;
end;
$$;

revoke all on function public.get_vapid_private_key() from public, anon, authenticated;
grant execute on function public.get_vapid_private_key() to service_role;

commit;

-- Rollback (manual): drop function public.get_vapid_private_key();

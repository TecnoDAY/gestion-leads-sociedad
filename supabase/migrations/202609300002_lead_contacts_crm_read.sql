-- T2: RLS lead_contacts solo roles CRM (admin/agente/supervisor activos).
-- Antes: SELECT con solo is_active_user() -> un trafficker activo podia leer
-- PII (telefono/nombre/ciudad) por API. Despues: SELECT exige ademas
-- is_crm_user(), que excluye a trafficker (canonico en 202609290001/02).
-- La escritura sigue exclusiva por funciones del sistema (SECURITY DEFINER
-- lead_contact_id_for / leads_set_contact_id, revocadas a anon/authenticated):
-- esta migracion no toca grants de escritura ni helpers.

begin;

drop policy if exists lead_contacts_read_active_authorized on public.lead_contacts;
create policy lead_contacts_read_active_authorized
  on public.lead_contacts
  for select to authenticated
  using (public.is_active_user() and public.is_crm_user());

-- Grants de lectura intactos; escritura sigue sin grant directo.
revoke all on public.lead_contacts from anon, authenticated;
grant select on public.lead_contacts to authenticated;

commit;

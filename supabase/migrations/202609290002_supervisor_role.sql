-- Rol 'supervisor': supervisiona todo el CRM y actua como agente + trafficker,
-- sin ninguna accion exclusiva de administrador.
-- 1) Amplia el check de rol de user_access para admitir 'supervisor'.
-- 2) Helper is_supervisor(); 'supervisor' entra en is_crm_user() e is_campaign_editor().
-- 3) upsert_campaign_stat pasa a usar is_campaign_editor() como fuente unica de roles.
-- 4) Politicas de lectura de citas: el supervisor ve todas las citas (su pestana
--    Citas quedaria vacia si solo viera las suyas, al no ser asesor asignado).
-- No cambia is_admin_user(): todas las acciones exclusivas de admin siguen intactas.
-- Aplicada en el proyecto remoto (project_ref hkkuyomlcqyxtzblowle) el 2026-09-29.
-- Verificado tras aplicar: check con los 4 roles, indice user_access_email_key creado,
-- helpers con 'supervisor', guard de upsert_campaign_stat en is_campaign_editor() y las
-- dos politicas de lectura de citas con is_supervisor().

begin;

-- ---------------------------------------------------------------------------
-- 1. Rol 'supervisor' en user_access.
-- El check de role se definio inline en 202609230001 y PostgreSQL le asigno el
-- nombre automatico user_access_role_check.
-- ---------------------------------------------------------------------------
alter table public.user_access drop constraint if exists user_access_role_check;
alter table public.user_access
  add constraint user_access_role_check check (role in ('admin', 'agente', 'trafficker', 'supervisor'));

-- authorize-user hace el upsert con onConflict: 'email', pero el indice unico
-- existente es sobre lower(email) y Postgres no puede inferir ON CONFLICT (email)
-- a partir de el: el upsert fallaba con 42P10 y el alta se perdia en silencio.
-- Con el CHECK email = lower(btrim(email)) este indice es equivalente al de
-- lower(email), por lo que no cambia que filas son validas.
create unique index if not exists user_access_email_key on public.user_access (email);

-- ---------------------------------------------------------------------------
-- 2. Helpers de rol.
-- ---------------------------------------------------------------------------
-- ¿Supervisa? Supervisor activo. Solo aporta lectura ampliada en citas.
create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role = 'supervisor'
  );
$$;

-- ¿Puede editar campanas? Admin, trafficker o supervisor activo.
create or replace function public.is_campaign_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'trafficker', 'supervisor')
  );
$$;

-- ¿Puede acceder al CRM? Admin, agente o supervisor activo (excluye a trafficker).
create or replace function public.is_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'agente', 'supervisor')
  );
$$;

revoke all on function public.is_supervisor() from public;
revoke all on function public.is_campaign_editor() from public;
revoke all on function public.is_crm_user() from public;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.is_campaign_editor() to authenticated;
grant execute on function public.is_crm_user() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. upsert_campaign_stat: el guard pasa a is_campaign_editor() para no repetir
-- la lista de roles (se repetia en tres sitios y no incluia al supervisor).
-- El resto del cuerpo es identico al de 202609290001.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_campaign_stat(
  p_id bigint, p_campaign_name text, p_anio int, p_mes text, p_estado text,
  p_alcance int, p_gasto numeric, p_resultados int
)
returns public.campaign_stats
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  stat public.campaign_stats;
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  stat_name text;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if not public.is_campaign_editor() then
    raise exception using errcode = '42501', message = 'campaign_editor_required';
  end if;

  stat_name := btrim(coalesce(p_campaign_name, ''));
  if stat_name = '' then
    raise exception using errcode = '22023', message = 'campaign_name_required';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  if p_mes is null or not (upper(btrim(p_mes)) = any (month_names)) then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;
  if p_estado is null or p_estado not in ('activa', 'pausada', 'finalizada') then
    raise exception using errcode = '22023', message = 'invalid_estado';
  end if;
  if coalesce(p_alcance, 0) < 0 or coalesce(p_gasto, 0) < 0 or coalesce(p_resultados, 0) < 0 then
    raise exception using errcode = '22023', message = 'negative_value_not_allowed';
  end if;

  if p_id is null then
    -- Insert o correccion de la fila del mes existente (upsert por el unique).
    insert into public.campaign_stats (campaign_name, anio, mes, estado, alcance, gasto, resultados, creado_por)
    values (stat_name, p_anio, upper(btrim(p_mes)), p_estado,
            coalesce(p_alcance, 0), coalesce(p_gasto, 0), coalesce(p_resultados, 0), access.user_id)
    on conflict (campaign_name, anio, mes) do update
    set estado = excluded.estado,
        alcance = excluded.alcance,
        gasto = excluded.gasto,
        resultados = excluded.resultados,
        updated_at = now()
    where public.is_admin_user() or public.campaign_stats.creado_por = access.user_id
    returning * into stat;
    if stat.id is null then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
  else
    select * into stat from public.campaign_stats where id = p_id;
    if stat.id is null then
      raise exception using errcode = 'P0002', message = 'campaign_stat_not_found';
    end if;
    if access.role <> 'admin' and stat.creado_por is distinct from access.user_id then
      raise exception using errcode = '42501', message = 'own_campaign_stat_required';
    end if;
    update public.campaign_stats
    set campaign_name = stat_name,
        anio = p_anio,
        mes = upper(btrim(p_mes)),
        estado = p_estado,
        alcance = coalesce(p_alcance, 0),
        gasto = coalesce(p_gasto, 0),
        resultados = coalesce(p_resultados, 0),
        updated_at = now()
    where id = p_id
    returning * into stat;
  end if;

  return stat;
end;
$$;

comment on function public.upsert_campaign_stat(bigint, text, int, text, text, int, numeric, int) is
  'Admin/trafficker/supervisor (via is_campaign_editor()); upsert por (campaign_name, anio, mes); editar la fila de otro creador exige ser admin (42501 own_campaign_stat_required).';

-- ---------------------------------------------------------------------------
-- 4. Citas: el supervisor ve todas las filas (lectura). La escritura sigue
-- limitada a is_admin_user() o al asesor asignado en set_lead_appointment_status,
-- asi que el supervisor no gana ningun poder de escritura sobre citas ajenas.
-- ---------------------------------------------------------------------------
drop policy if exists "lead_appointments_read_active_authorized" on public.lead_appointments;
create policy "lead_appointments_read_active_authorized"
on public.lead_appointments for select to authenticated
using (public.is_active_user() and public.is_crm_user()
  and (public.is_admin_user() or public.is_supervisor() or advisor_user_id = auth.uid()));

drop policy if exists "lead_appointment_events_read_active_authorized" on public.lead_appointment_events;
create policy "lead_appointment_events_read_active_authorized"
on public.lead_appointment_events for select to authenticated
using (public.is_active_user() and public.is_crm_user()
  and (public.is_admin_user() or public.is_supervisor() or exists (
    select 1 from public.lead_appointments a
    where a.id = appointment_id and a.advisor_user_id = auth.uid()
  )));

comment on function public.is_supervisor() is 'Supervisor activo: lectura ampliada de citas; sin acciones admin.';
comment on function public.is_campaign_editor() is 'Admin/trafficker/supervisor activo: editores de campaign_stats.';
comment on function public.is_crm_user() is 'Admin/agente/supervisor activo; excluye a trafficker del CRM de leads.';

-- ---------------------------------------------------------------------------
-- Verificacion sugerida (no ejecutada por esta migracion):
--   select rolsuper, rolname from pg_roles where rolname = 'authenticated';
--   con sesion simulada de cada rol: contar filas visibles en leads,
--   lead_appointments y campaign_stats, y probar upsert_campaign_stat y
--   admin_manage_user_access para confirmar que el supervisor no es admin.
-- ---------------------------------------------------------------------------

commit;

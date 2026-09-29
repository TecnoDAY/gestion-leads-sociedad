-- Campañas: informe mensual de Meta por campaña y rol 'trafficker'.
-- 1) Amplia el check de rol de user_access para admitir 'trafficker'.
-- 2) Nuevos helpers is_campaign_editor() e is_crm_user().
-- 3) Tabla campaign_stats con RLS de lectura compartida y escrituras solo via RPC.
-- 4) RPCs upsert_campaign_stat / delete_campaign_stat / campaign_monthly_rollup.
-- 5) Endurecimiento CRM: trafficker no puede leer ni escribir datos de leads
--    (politicas select + guarda temprana 42501 en RPCs activos).
-- This migration is intentionally NOT applied by this repository.
-- Review it in the Supabase SQL editor before applying it to the remote project.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rol 'trafficker' en user_access.
-- El check de role se definio inline en 202609230001, por lo que PostgreSQL le
-- asigno el nombre automatico user_access_role_check.
-- Revision: admin_manage_user_access(text, uuid, boolean) no recibe ni valida
-- p_role (solo lista y activa/desactiva), asi que no requiere cambios; el alta
-- de rol ocurre en authorize-user.
-- ---------------------------------------------------------------------------
alter table public.user_access drop constraint if exists user_access_role_check;
alter table public.user_access
  add constraint user_access_role_check check (role in ('admin', 'agente', 'trafficker'));

-- ---------------------------------------------------------------------------
-- 2. Helpers de rol.
-- ---------------------------------------------------------------------------
-- ¿Puede editar campañas? Admin o trafficker activo.
create or replace function public.is_campaign_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'trafficker')
  );
$$;

-- ¿Puede acceder al CRM? Solo admin o agente activo (excluye a trafficker).
create or replace function public.is_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_access
    where user_id = auth.uid() and activo = true and role in ('admin', 'agente')
  );
$$;

revoke all on function public.is_campaign_editor() from public;
revoke all on function public.is_crm_user() from public;
grant execute on function public.is_campaign_editor() to authenticated;
grant execute on function public.is_crm_user() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Tabla campaign_stats.
-- Coste/resultado NO se guarda: se calcula en UI (gasto/resultados).
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_stats (
  id bigint generated always as identity primary key,
  campaign_name text not null,
  anio int not null check (anio between 2024 and 2100),
  mes text not null check (mes in ('ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE')),
  estado text not null default 'activa' check (estado in ('activa', 'pausada', 'finalizada')),
  alcance int not null default 0 check (alcance >= 0),
  gasto numeric not null default 0 check (gasto >= 0),
  resultados int not null default 0 check (resultados >= 0),
  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_stats_unique_period unique (campaign_name, anio, mes)
);

-- Indice unico normal (búsqueda por campaña).
create index if not exists campaign_stats_campaign_idx on public.campaign_stats (campaign_name);

alter table public.campaign_stats enable row level security;

-- Lectura para usuarios activos; escrituras solo via RPC (sin politica directa).
drop policy if exists "campaign_stats_read_active" on public.campaign_stats;
create policy "campaign_stats_read_active"
on public.campaign_stats for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.campaign_stats from anon, authenticated;
revoke select on public.campaign_stats from anon;
grant select on public.campaign_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs de campañas.
-- ---------------------------------------------------------------------------
-- Upsert por (campaign_name, anio, mes). Admin o trafficker; si la fila ya
-- existe con otro creado_por y el actor no es admin, 42501.
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
  if access.role not in ('admin', 'trafficker') then
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

-- Borrar una fila de campaña: solo admin.
create or replace function public.delete_campaign_stat(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  delete from public.campaign_stats where id = p_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'campaign_stat_not_found';
  end if;
end;
$$;

-- Recuento agregado del CRM por campaña y mes. Solo COUNTs (ninguna lectura
-- directa de leads por parte del cliente), accesible a cualquier usuario activo.
-- leads_nuevos/inscritos se atribuyen por el campo "Mes" del lead (patron del
-- reporte diario); las citas se atribuyen por scheduled_at dentro del mes.
create or replace function public.campaign_monthly_rollup(p_anio int, p_mes text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_names constant text[] := array['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  mes_idx int;
  month_name text;
  from_date date;
  result jsonb;
begin
  if not public.is_active_user() then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  mes_idx := array_position(month_names, upper(btrim(coalesce(p_mes, ''))));
  if mes_idx is null then
    raise exception using errcode = '22023', message = 'invalid_month';
  end if;
  if p_anio is null or p_anio < 2024 or p_anio > 2100 then
    raise exception using errcode = '22023', message = 'invalid_year';
  end if;
  month_name := month_names[mes_idx];
  from_date := make_date(p_anio, mes_idx, 1);

  with base_campaigns as (
    -- Campañas con leads del mes, con citas del mes o con fila de stats del mes.
    select distinct campaign_name from (
      select btrim(l."Campaña") as campaign_name
      from public.leads l
      where l.archived_at is null
        and btrim(coalesce(l."Campaña", '')) <> ''
        and upper(l."Mes") like '%' || month_name || '%'
      union
      select btrim(l."Campaña")
      from public.lead_appointments la
      join public.leads l on l.id = la.lead_id
      where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
        and btrim(coalesce(l."Campaña", '')) <> ''
      union
      select cs.campaign_name
      from public.campaign_stats cs
      where cs.anio = p_anio and cs.mes = month_name
    ) t
  ),
  lead_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as leads_nuevos,
           count(*) filter (where l."GESTION" ilike '%INSCRIT%') as inscritos
    from public.leads l
    where l.archived_at is null
      and btrim(coalesce(l."Campaña", '')) <> ''
      and upper(l."Mes") like '%' || month_name || '%'
    group by btrim(l."Campaña")
  ),
  appt_counts as (
    select btrim(l."Campaña") as campaign_name,
           count(*) as agendados,
           count(*) filter (where la.status = 'ASISTIO') as asistieron,
           count(*) filter (where la.status = 'PROGRAMADA') as pendientes,
           count(*) filter (where upper(coalesce(l."Mes", '')) not like '%' || month_name || '%') as agendados_previos
    from public.lead_appointments la
    join public.leads l on l.id = la.lead_id
    where la.scheduled_at >= from_date and la.scheduled_at < from_date + interval '1 month'
      and btrim(coalesce(l."Campaña", '')) <> ''
    group by btrim(l."Campaña")
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign_name', bc.campaign_name,
    'leads_nuevos', coalesce(lc.leads_nuevos, 0),
    'agendados', coalesce(ac.agendados, 0),
    'asistieron', coalesce(ac.asistieron, 0),
    'inscritos', coalesce(lc.inscritos, 0),
    'agendados_previos', coalesce(ac.agendados_previos, 0),
    'pendientes', coalesce(ac.pendientes, 0)
  ) order by lower(bc.campaign_name)), '[]'::jsonb)
  into result
  from base_campaigns bc
  left join lead_counts lc on lc.campaign_name = bc.campaign_name
  left join appt_counts ac on ac.campaign_name = bc.campaign_name;

  return result;
end;
$$;

revoke all on function public.upsert_campaign_stat(bigint, text, int, text, text, int, numeric, int) from public;
revoke all on function public.delete_campaign_stat(bigint) from public;
revoke all on function public.campaign_monthly_rollup(int, text) from public;
grant execute on function public.upsert_campaign_stat(bigint, text, int, text, text, int, numeric, int) to authenticated;
grant execute on function public.delete_campaign_stat(bigint) to authenticated;
grant execute on function public.campaign_monthly_rollup(int, text) to authenticated;

comment on table public.campaign_stats is 'Informe mensual de Meta por campaña: lectura compartida a activos, escrituras solo via RPC (admin/trafficker); coste/resultado se calcula en UI.';
comment on function public.upsert_campaign_stat(bigint, text, int, text, text, int, numeric, int) is 'Admin/trafficker; upsert por (campaign_name, anio, mes); editar la fila de otro creador exige ser admin (42501 own_campaign_stat_required).';
comment on function public.delete_campaign_stat(bigint) is 'Solo admin borra campañas.';
comment on function public.campaign_monthly_rollup(int, text) is 'Conteos agregados del CRM por campaña y mes; cualquier usuario activo, sin lectura directa de leads.';

-- ---------------------------------------------------------------------------
-- 5. Endurecimiento CRM para trafficker.
-- Las politicas de lectura pasan a exigir is_crm_user() (admin/agente).
-- Las politicas de escritura directa no se tocan: la escritura ya estaba
-- denegada por revocacion y solo es posible via RPC.
-- ---------------------------------------------------------------------------
drop policy if exists "leads_read_active_authorized" on public.leads;
create policy "leads_read_active_authorized"
on public.leads for select to authenticated
using (public.is_active_user() and public.is_crm_user() and archived_at is null);

drop policy if exists "leads_historico_read_active_authorized" on public.leads_historico;
create policy "leads_historico_read_active_authorized"
on public.leads_historico for select to authenticated
using (public.is_active_user() and public.is_crm_user());

drop policy if exists "lead_gestiones_read_active_authorized" on public.lead_gestiones;
create policy "lead_gestiones_read_active_authorized"
on public.lead_gestiones for select to authenticated
using (public.is_active_user() and public.is_crm_user());

drop policy if exists "lead_appointments_read_active_authorized" on public.lead_appointments;
create policy "lead_appointments_read_active_authorized"
on public.lead_appointments for select to authenticated
using (public.is_active_user() and public.is_crm_user()
  and (public.is_admin_user() or advisor_user_id = auth.uid()));

drop policy if exists "lead_notes_read_active_authorized" on public.lead_notes;
create policy "lead_notes_read_active_authorized"
on public.lead_notes for select to authenticated
using (public.is_active_user() and public.is_crm_user());

drop policy if exists "daily_report_notes_read_active_authorized" on public.daily_report_notes;
create policy "daily_report_notes_read_active_authorized"
on public.daily_report_notes for select to authenticated
using (public.is_active_user() and public.is_crm_user());

-- RPCs del CRM con guarda temprana: misma definicion vigente + rechazo de
-- trafficker (42501 crm_access_forbidden) tras el check de usuario activo.

create or replace function public.create_lead(p_lead jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.leads;
  access public.user_access;
begin
  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'lead_object_required';
  end if;
  if p_lead ?| array['id', 'archived_at', 'archived_by', 'created_at', 'updated_at'] then
    raise exception using errcode = '22023', message = 'protected_fields';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  insert into public.leads (
    "Mes", "Fecha", "Nombre", "Telefono", "Campaña", "Medio", "GESTION",
    "Ciudad", "AGENTE", "OBSERVACIONES "
  ) values (
    left(coalesce(p_lead->>'Mes', ''), 40),
    left(coalesce(p_lead->>'Fecha', ''), 40),
    left(coalesce(p_lead->>'Nombre', ''), 200),
    left(coalesce(p_lead->>'Telefono', ''), 80),
    left(coalesce(p_lead->>'Campaña', ''), 120),
    left(coalesce(p_lead->>'Medio', ''), 80),
    left(coalesce(p_lead->>'GESTION', 'Información '), 80),
    left(coalesce(p_lead->>'Ciudad', ''), 120),
    case when access.role = 'admin' then left(coalesce(p_lead->>'AGENTE', p_lead->>'Agente', p_lead->>'Agente ', access.nombre), 120) else left(access.nombre, 120) end,
    left(coalesce(p_lead->>'OBSERVACIONES', p_lead->>'OBSERVACIONES ', ''), 5000)
  ) returning * into created;

  return created;
end;
$$;

create or replace function public.update_lead_followup(p_id bigint, p_fields jsonb)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_fields - array['GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'followup_fields_only';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', current_lead."GESTION", '')));
  if previous_gestion not like 'AGENDAD%' and next_gestion like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'appointment_required_for_agendado_transition';
  end if;

  update public.leads
  set "GESTION" = left(coalesce(p_fields->>'GESTION', "GESTION"), 80),
      "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
      "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
      "ULTIMO AGENTE " = left(access.nombre, 120),
      "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
      updated_at = now()
  where id = p_id and archived_at is null
  returning * into updated;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;
  return updated;
end;
$$;

create or replace function public.update_lead_with_appointment(p_id bigint, p_fields jsonb, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.leads;
  access public.user_access;
  current_lead public.leads;
  previous_gestion text;
  next_gestion text;
begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'followup_object_required';
  end if;
  if p_scheduled_at is null then
    raise exception using errcode = '22023', message = 'scheduled_at_required';
  end if;
  if length(coalesce(p_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'notes_too_long';
  end if;

  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  select * into current_lead from public.leads where id = p_id and archived_at is null for update;
  if current_lead.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  previous_gestion := upper(btrim(coalesce(current_lead."GESTION", '')));
  next_gestion := upper(btrim(coalesce(p_fields->>'GESTION', '')));
  if previous_gestion like 'AGENDAD%' or next_gestion not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'agendado_transition_required';
  end if;

  if access.role = 'admin' then
    if p_fields - array[
      'Mes', 'Fecha', 'Nombre', 'Telefono', 'Campaña', 'Medio', 'Ciudad', 'AGENTE', 'Agente', 'Agente ',
      'Odoo', 'Fecha de Atencion', 'LANDING', 'GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ',
      'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '
    ] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'full_edit_fields_only';
    end if;
    update public.leads
    set "Mes" = left(coalesce(p_fields->>'Mes', "Mes"), 40),
        "Fecha" = left(coalesce(p_fields->>'Fecha', "Fecha"), 40),
        "Nombre" = left(coalesce(p_fields->>'Nombre', "Nombre"), 200),
        "Telefono" = left(coalesce(p_fields->>'Telefono', "Telefono"), 80),
        "Campaña" = left(coalesce(p_fields->>'Campaña', "Campaña"), 120),
        "Medio" = left(coalesce(p_fields->>'Medio', "Medio"), 80),
        "Ciudad" = left(coalesce(p_fields->>'Ciudad', "Ciudad"), 120),
        "AGENTE" = left(coalesce(p_fields->>'AGENTE', p_fields->>'Agente', p_fields->>'Agente ', "AGENTE"), 120),
        "Odoo" = left(coalesce(p_fields->>'Odoo', "Odoo"), 80),
        "Fecha de Atencion" = left(coalesce(p_fields->>'Fecha de Atencion', "Fecha de Atencion"), 40),
        "LANDING" = left(coalesce(p_fields->>'LANDING', "LANDING"), 500),
        "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  else
    if p_fields - array['GESTION', 'Fecha Última Gestión', 'Fecha Última Gestión ', 'ULTIMA GESTION', 'OBSERVACIONES', 'OBSERVACIONES '] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'followup_fields_only';
    end if;
    update public.leads
    set "GESTION" = left(p_fields->>'GESTION', 80),
        "Fecha Última Gestión " = left(coalesce(p_fields->>'Fecha Última Gestión', p_fields->>'Fecha Última Gestión ', "Fecha Última Gestión "), 40),
        "ULTIMA GESTION" = left(coalesce(p_fields->>'ULTIMA GESTION', "ULTIMA GESTION"), 80),
        "ULTIMO AGENTE " = left(access.nombre, 120),
        "OBSERVACIONES " = left(coalesce(p_fields->>'OBSERVACIONES', p_fields->>'OBSERVACIONES ', "OBSERVACIONES "), 5000),
        updated_at = now()
    where id = p_id and archived_at is null
    returning * into updated;
  end if;

  if updated.id is null then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  perform public.create_lead_appointment(updated.id, p_scheduled_at, p_notes, p_advisor_user_id);
  return updated;
end;
$$;

create or replace function public.create_lead_note(p_lead_id bigint, p_note text)
returns public.lead_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.lead_notes;
  access public.user_access;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception using errcode = '22023', message = 'note_required';
  end if;

  insert into public.lead_notes (lead_id, author_name, author_user_id, note)
  values (p_lead_id, left(access.nombre, 120), auth.uid(), left(btrim(p_note), 2000))
  returning * into created;
  return created;
end;
$$;

create or replace function public.create_lead_appointment(p_lead_id bigint, p_scheduled_at timestamptz, p_notes text default '', p_advisor_user_id uuid default null)
returns public.lead_appointments language plpgsql security definer set search_path = public as $$
declare
  created public.lead_appointments;
  access public.user_access;
  advisor public.user_access;
  lead_record public.leads;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true;
  if access.id is null then raise exception using errcode = '42501', message = 'active_user_required'; end if;
  if access.role = 'trafficker' then raise exception using errcode = '42501', message = 'crm_access_forbidden'; end if;
  if p_scheduled_at is null then raise exception using errcode = '22023', message = 'scheduled_at_required'; end if;
  if length(coalesce(p_notes, '')) > 2000 then raise exception using errcode = '22023', message = 'notes_too_long'; end if;
  select * into lead_record from public.leads where id = p_lead_id;
  if not found then raise exception using errcode = 'P0002', message = 'lead_not_found'; end if;
  if upper(btrim(coalesce(lead_record."GESTION", ''))) not like 'AGENDAD%' then
    raise exception using errcode = '22023', message = 'lead_not_agendado';
  end if;
  if access.role = 'admin' and p_advisor_user_id is not null then
    select * into advisor from public.user_access where user_id = p_advisor_user_id and activo = true;
    if advisor.id is null then raise exception using errcode = '22023', message = 'advisor_not_active'; end if;
  else advisor := access;
  end if;
  insert into public.lead_appointments (lead_id, scheduled_at, advisor_user_id, advisor_name, notes, created_by_user_id)
  values (p_lead_id, p_scheduled_at, advisor.user_id, left(advisor.nombre, 200), coalesce(p_notes, ''), auth.uid()) returning * into created;
  return created;
end;
$$;

create or replace function public.upsert_daily_report_note(p_report_date date, p_autor_name text, p_problemas text, p_observaciones text)
returns public.daily_report_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  miami_today date;
  target_name text;
  target_user_id uuid;
  existing public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  if p_report_date is null then
    raise exception using errcode = '22023', message = 'report_date_required';
  end if;

  miami_today := (now() at time zone 'America/New_York')::date;
  target_name := coalesce(nullif(btrim(p_autor_name), ''), access.nombre);

  if access.role <> 'admin' then
    if target_name <> access.nombre or p_report_date <> miami_today then
      raise exception using errcode = '42501', message = 'own_note_today_required';
    end if;
    target_user_id := access.user_id;
  else
    select user_id into target_user_id
    from public.user_access
    where btrim(nombre) = target_name and activo = true
    limit 1;
    if target_user_id is null then
      raise exception using errcode = 'P0002', message = 'advisor_not_found';
    end if;
  end if;

  insert into public.daily_report_notes (report_date, autor_name, autor_user_id, problemas, observaciones, updated_at)
  values (p_report_date, target_name, target_user_id, left(coalesce(p_problemas, ''), 5000), left(coalesce(p_observaciones, ''), 5000), now())
  on conflict (report_date, autor_user_id) do update
  set problemas = excluded.problemas,
      observaciones = excluded.observaciones,
      autor_name = excluded.autor_name,
      updated_at = now()
  returning * into existing;
  return existing;
end;
$$;

create or replace function public.delete_daily_report_note(p_note_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  access public.user_access;
  miami_today date;
  row public.daily_report_notes;
begin
  select * into access from public.user_access where user_id = auth.uid() and activo = true limit 1;
  if access.id is null then
    raise exception using errcode = '42501', message = 'active_user_required';
  end if;
  if access.role = 'trafficker' then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;

  miami_today := (now() at time zone 'America/New_York')::date;

  select * into row from public.daily_report_notes where id = p_note_id;
  if not found then
    return;
  end if;

  -- If not admin: deny when row is missing or does not belong to this agent for today.
  if access.role <> 'admin' and (row.autor_user_id is null or row.autor_user_id <> access.user_id or row.report_date <> miami_today) then
    raise exception using errcode = '42501', message = 'own_note_today_required';
  end if;

  delete from public.daily_report_notes where id = p_note_id;
end;
$$;

comment on function public.is_campaign_editor() is 'Trafficker/admin activo: editores de campaign_stats.';
comment on function public.is_crm_user() is 'Admin/agente activo; excluye a trafficker del CRM de leads.';
comment on function public.create_lead_appointment(bigint, timestamptz, text, uuid) is 'Creates appointments only for leads whose GESTION starts with AGENDAD; trafficker forbidden.';

commit;

-- Rollback (manual, after review): drop campaign_stats, los 3 RPCs nuevos y los
-- helpers is_campaign_editor/is_crm_user; restaurar el check original de role
-- ('admin', 'agente'); restaurar politicas y RPCs desde sus migraciones originales
-- (20260923-20260928). Do not run this automatically against the remote project.

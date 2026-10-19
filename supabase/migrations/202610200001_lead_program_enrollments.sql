-- Inscripciones por programa y nivel (Teatro Musical / Actuacion).
--
-- Modelo: una fila = una inscripcion de UNA persona en UN programa.
--   - La fila `activa = true` es la inscripcion vigente (un unico nivel por
--     programa: indice unico parcial (lead_id, programa) where activa).
--   - Las filas `activa = false` conservan el historial: cambio de nivel,
--     retiro de un programa o baja por cambio de estado. No se borran.
--   - `fecha_inscripcion` es la fecha real de inscripcion que declara la
--     asesora; puede quedar NULL (pendiente de completar). `created_at` es
--     el momento del registro y NO se usa para los reportes por periodo:
--     completar hoy una inscripcion antigua no puede contar como nueva de hoy.
--
-- Escritura: solo via la RPC `save_lead_enrollments` (security definer), que
-- valida programa/nivel, guarda estado e inscripciones de forma consistente y
-- cierra (no borra) lo que ya no se declara.

begin;

create table if not exists public.lead_program_enrollments (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  programa text not null check (programa in ('TEATRO_MUSICAL', 'ACTUACION')),
  nivel text not null check (
    (programa = 'TEATRO_MUSICAL' and nivel in ('MT Piojitos', 'MT Teens', 'MT Advance'))
    or
    (programa = 'ACTUACION' and nivel in ('Acting Piojitos', 'Acting Teens', 'Acting 101 (Teens)', 'Acting Advance'))
  ),
  fecha_inscripcion date,
  activa boolean not null default true,
  fecha_baja timestamptz,
  baja_motivo text,
  registrado_por uuid references auth.users(id) on delete set null,
  registrado_por_nombre text not null default '',
  actualizado_por uuid references auth.users(id) on delete set null,
  actualizado_por_nombre text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lead_program_enrollments is
  'Inscripciones por programa y nivel. Una fila activa por persona y programa; las filas dadas de baja conservan el historial.';

create index if not exists lead_program_enrollments_lead_idx
  on public.lead_program_enrollments (lead_id);

create unique index if not exists lead_program_enrollments_activa_unica
  on public.lead_program_enrollments (lead_id, programa) where activa;

alter table public.lead_program_enrollments enable row level security;

drop policy if exists "lead_program_enrollments_read_crm" on public.lead_program_enrollments;
create policy "lead_program_enrollments_read_crm" on public.lead_program_enrollments
  for select to authenticated
  using (public.is_active_user() and public.is_crm_user());

revoke insert, update, delete on public.lead_program_enrollments from anon, authenticated;
revoke select on public.lead_program_enrollments from anon;
grant select on public.lead_program_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- Guardado de inscripciones. Payload: [{"programa","nivel","fecha_inscripcion"}]
-- fecha_inscripcion: "YYYY-MM-DD" o null/vacio (pendiente de completar).
-- ---------------------------------------------------------------------------
create or replace function public.save_lead_enrollments(p_lead_id bigint, p_enrollments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_gestion text;
  v_es_inscrito boolean;
  v_item jsonb;
  v_programa text;
  v_nivel text;
  v_fecha date;
  v_actor text;
  v_motivo text;
  v_actual record;
  v_resultado jsonb;
begin
  if p_lead_id is null then
    raise exception using errcode='22023', message='lead_id_required';
  end if;
  if p_enrollments is null then p_enrollments := '[]'::jsonb; end if;
  if jsonb_typeof(p_enrollments) <> 'array' then
    raise exception using errcode='22023', message='enrollments_invalid';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode='42501', message='crm_access_forbidden';
  end if;

  select * into v_lead from public.leads where id = p_lead_id and archived_at is null for update;
  if not found then
    raise exception using errcode='P0002', message='lead_not_found';
  end if;
  v_gestion := upper(btrim(coalesce(v_lead."GESTION", '')));
  v_es_inscrito := v_gestion like 'INSCRIT%';

  if jsonb_array_length(p_enrollments) > 2 then
    raise exception using errcode='22023', message='enrollments_too_many';
  end if;
  if jsonb_array_length(p_enrollments) > 0 and not v_es_inscrito then
    raise exception using errcode='22023', message='lead_not_inscribed';
  end if;
  -- Programa repetido: no se admiten dos filas del mismo programa.
  if (
    select count(distinct upper(btrim(coalesce(x->>'programa',''))))
    from jsonb_array_elements(p_enrollments) x
  ) <> jsonb_array_length(p_enrollments) then
    raise exception using errcode='22023', message='programa_duplicado';
  end if;

  -- Validacion completa ANTES de escribir (fail closed): nada se toca si algo
  -- del payload es invalido.
  for v_item in select * from jsonb_array_elements(p_enrollments) loop
    v_programa := upper(btrim(coalesce(v_item->>'programa','')));
    v_nivel := btrim(coalesce(v_item->>'nivel',''));
    if v_programa not in ('TEATRO_MUSICAL','ACTUACION') then
      raise exception using errcode='22023', message='programa_invalido';
    end if;
    if (v_programa = 'TEATRO_MUSICAL' and v_nivel not in ('MT Piojitos','MT Teens','MT Advance'))
       or (v_programa = 'ACTUACION' and v_nivel not in ('Acting Piojitos','Acting Teens','Acting 101 (Teens)','Acting Advance')) then
      raise exception using errcode='22023', message='nivel_invalido';
    end if;
    if nullif(btrim(coalesce(v_item->>'fecha_inscripcion','')), '') is null then
      v_fecha := null;
    else
      begin
        v_fecha := btrim(v_item->>'fecha_inscripcion')::date;
      exception when others then
        raise exception using errcode='22023', message='fecha_inscripcion_invalida';
      end;
    end if;
  end loop;

  select coalesce(nombre,'') into v_actor from public.user_access where user_id = auth.uid() limit 1;
  v_motivo := case when v_es_inscrito then 'programa_retirado' else 'cambio_estado' end;

  -- 1) Cierre (no borrado) de las inscripciones activas que ya no se declaran.
  for v_actual in
    select e.id
    from public.lead_program_enrollments e
    where e.lead_id = p_lead_id and e.activa
      and e.programa <> all (
        select upper(btrim(coalesce(x->>'programa',''))) from jsonb_array_elements(p_enrollments) x
      )
    for update
  loop
    update public.lead_program_enrollments
       set activa = false,
           fecha_baja = now(),
           baja_motivo = v_motivo,
           actualizado_por = auth.uid(),
           actualizado_por_nombre = v_actor,
           updated_at = now()
     where id = v_actual.id;
  end loop;

  -- 2) Alta o actualizacion de lo declarado.
  for v_item in select * from jsonb_array_elements(p_enrollments) loop
    v_programa := upper(btrim(coalesce(v_item->>'programa','')));
    v_nivel := btrim(coalesce(v_item->>'nivel',''));
    if nullif(btrim(coalesce(v_item->>'fecha_inscripcion','')), '') is null then
      v_fecha := null;
    else
      v_fecha := btrim(v_item->>'fecha_inscripcion')::date;
    end if;

    select * into v_actual
      from public.lead_program_enrollments
     where lead_id = p_lead_id and programa = v_programa and activa
     for update;

    if not found then
      insert into public.lead_program_enrollments (
        lead_id, programa, nivel, fecha_inscripcion, activa,
        registrado_por, registrado_por_nombre, actualizado_por, actualizado_por_nombre
      ) values (
        p_lead_id, v_programa, v_nivel, v_fecha, true,
        auth.uid(), v_actor, auth.uid(), v_actor
      );
    elsif v_actual.nivel <> v_nivel then
      -- Cambio de nivel: la fila anterior se conserva como historial y se abre
      -- la nueva con la fecha de inscripcion declarada.
      update public.lead_program_enrollments
         set activa = false,
             fecha_baja = now(),
             baja_motivo = 'cambio_nivel',
             actualizado_por = auth.uid(),
             actualizado_por_nombre = v_actor,
             updated_at = now()
       where id = v_actual.id;
      insert into public.lead_program_enrollments (
        lead_id, programa, nivel, fecha_inscripcion, activa,
        registrado_por, registrado_por_nombre, actualizado_por, actualizado_por_nombre
      ) values (
        p_lead_id, v_programa, v_nivel, v_fecha, true,
        auth.uid(), v_actor, auth.uid(), v_actor
      );
    else
      -- Mismo nivel: se actualiza la fecha en sitio (completar una fecha
      -- pendiente no crea una inscripcion nueva) y se deja constancia.
      update public.lead_program_enrollments
         set fecha_inscripcion = v_fecha,
             actualizado_por = auth.uid(),
             actualizado_por_nombre = v_actor,
             updated_at = now()
       where id = v_actual.id;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'lead_id', e.lead_id,
             'programa', e.programa,
             'nivel', e.nivel,
             'fecha_inscripcion', e.fecha_inscripcion,
             'created_at', e.created_at
           ) order by e.programa), '[]'::jsonb)
    into v_resultado
    from public.lead_program_enrollments e
   where e.lead_id = p_lead_id and e.activa;

  return v_resultado;
end;
$$;

revoke all on function public.save_lead_enrollments(bigint, jsonb) from public, anon;
grant execute on function public.save_lead_enrollments(bigint, jsonb) to authenticated;
comment on function public.save_lead_enrollments(bigint, jsonb) is
  'Guarda las inscripciones (programa/nivel/fecha) de un lead inscrito. Cierra (no borra) lo retirado y conserva el historial.';

commit;

-- Rollback manual (solo tras revision):
-- drop function if exists public.save_lead_enrollments(bigint, jsonb);
-- drop table if exists public.lead_program_enrollments;

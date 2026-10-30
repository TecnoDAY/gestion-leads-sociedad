-- Programa de inscripcion: el programa (campaña del catálogo) donde la
-- persona se inscribe. Es OPCIONAL y va APARTE de la campaña de origen
-- ("Campaña"), que no se modifica.
--
-- Escritura: solo via la RPC set_lead_inscripcion_programa (security
-- definer), que valida que el programa exista en el catálogo de campañas.
-- Un programa desactivado se puede conservar (histórico) aunque la interfaz
-- ya no lo ofrezca como opción nueva.
--
-- La columna es nullable y sin valor por defecto: añadirla no reescribe la
-- tabla ni bloquea a nadie.

alter table public.leads add column if not exists "PROGRAMA INSCRIPCION" text;

comment on column public.leads."PROGRAMA INSCRIPCION" is
  'Programa del catálogo (campaña) donde la persona se inscribe. Opcional: NULL cuando no se ha elegido. No sustituye a la campaña de origen ("Campaña").';

create or replace function public.set_lead_inscripcion_programa(p_lead_id bigint, p_programa text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_programa text;
begin
  if p_lead_id is null then
    raise exception using errcode = '22023', message = 'lead_id_required';
  end if;
  if not public.is_active_user() or not public.is_crm_user() then
    raise exception using errcode = '42501', message = 'crm_access_forbidden';
  end if;
  if not exists (select 1 from public.leads where id = p_lead_id and archived_at is null) then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  v_programa := nullif(btrim(coalesce(p_programa, '')), '');
  if v_programa is not null then
    -- El programa debe existir en el catálogo de campañas (activo o no: uno
    -- desactivado se conserva como histórico).
    if not exists (
      select 1 from public.lead_catalogs
       where kind = 'campana' and lower(btrim(value)) = lower(v_programa)
    ) then
      raise exception using errcode = '22023', message = 'programa_invalido';
    end if;
  end if;

  update public.leads
     set "PROGRAMA INSCRIPCION" = v_programa,
         updated_at = now()
   where id = p_lead_id and archived_at is null;

  return v_programa;
end;
$$;

revoke all on function public.set_lead_inscripcion_programa(bigint, text) from public, anon;
grant execute on function public.set_lead_inscripcion_programa(bigint, text) to authenticated;
comment on function public.set_lead_inscripcion_programa(bigint, text) is
  'Guarda el programa de inscripción (campaña del catálogo) de un lead. Opcional: null lo deja sin programa. No toca la campaña de origen.';

commit;

-- Rollback manual (solo tras revision):
-- drop function if exists public.set_lead_inscripcion_programa(bigint, text);
-- alter table public.leads drop column if exists "PROGRAMA INSCRIPCION";

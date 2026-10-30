-- Unica cita PROGRAMADA por lead como restriccion real de base de datos.
-- T1 de odd/tasks/cita-unica-eliminacion-admin.md.
-- El indice parcial es la autoridad: admite cero o una PROGRAMADA por lead
-- y sigue permitiendo varias citas historicas (ASISTIO, NO_ASISTIO,
-- CANCELADA, REPROGRAMADA). UI preventiva, no garantia.
-- NO se aplica remotamente por el agente; revisar y ejecutar manualmente en Supabase.

begin;

-- Preflight de integridad: abortar sin modificar datos si ya existe
-- algun lead con mas de una cita PROGRAMADA. Nunca reconciliar automaticamente.
do $duplicate_preflight$
begin
  if exists (
    select 1 from public.lead_appointments
    where status = 'PROGRAMADA'
    group by lead_id
    having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'duplicate_programmed_appointments';
  end if;
end;
$duplicate_preflight$;

create unique index if not exists lead_appointments_one_programmed_per_lead_uidx
  on public.lead_appointments (lead_id)
  where status = 'PROGRAMADA';

comment on index public.lead_appointments_one_programmed_per_lead_uidx
  is 'Como maximo una cita PROGRAMADA por lead; varias historicas siguen permitidas.';

commit;

-- Rollback manual (tras revision): drop index lead_appointments_one_programmed_per_lead_uidx;
-- No ejecutar automaticamente contra el remoto.

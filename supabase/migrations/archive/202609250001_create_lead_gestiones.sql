-- Review it in the Supabase SQL editor before applying it.
-- Append-only history of lead status changes.

begin;

create table if not exists public.lead_gestiones (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id) on delete cascade,
  fecha_gestion date not null,
  gestion_anterior text,
  gestion_nueva text not null,
  canal text,
  autor_name text,
  autor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lead_gestiones_lead_fecha_created_idx
  on public.lead_gestiones (lead_id, fecha_gestion desc, created_at desc);

alter table public.lead_gestiones enable row level security;

drop policy if exists "lead_gestiones_read_active_authorized" on public.lead_gestiones;
create policy "lead_gestiones_read_active_authorized"
on public.lead_gestiones for select to authenticated
using (public.is_active_user());

revoke insert, update, delete on public.lead_gestiones from anon, authenticated;
revoke select on public.lead_gestiones from anon;
grant select on public.lead_gestiones to authenticated;

create or replace function public.record_lead_gestion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gestion_fecha text;
  fecha date;
  fecha_partes text[];
  autor text;
begin
  gestion_fecha := nullif(btrim(NEW."Fecha Última Gestión "), '');
  fecha_partes := regexp_match(gestion_fecha, '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{4})$');
  if fecha_partes is not null
     and fecha_partes[1]::int between 1 and 31
     and fecha_partes[2]::int between 1 and 12 then
    begin
      fecha := make_date(fecha_partes[3]::int, fecha_partes[2]::int, fecha_partes[1]::int);
    exception when others then
      fecha := current_date;
    end;
  else
    fecha := current_date;
  end if;

  select coalesce(ua.nombre, '') into autor
  from public.user_access ua
  where ua.user_id = auth.uid()
  limit 1;

  insert into public.lead_gestiones (
    lead_id, fecha_gestion, gestion_anterior, gestion_nueva, canal,
    autor_name, autor_user_id
  ) values (
    NEW.id, fecha, OLD."GESTION", NEW."GESTION", NEW."ULTIMA GESTION",
    coalesce(autor, ''), auth.uid()
  );
  return NEW;
end;
$$;

drop trigger if exists leads_record_gestion on public.leads;
create trigger leads_record_gestion
after update of "GESTION" on public.leads
for each row
when (OLD."GESTION" is distinct from NEW."GESTION")
execute function public.record_lead_gestion();

comment on table public.lead_gestiones is 'Append-only history of lead gestion changes; written by trigger.';
comment on function public.record_lead_gestion() is 'Records lead gestion changes with date, channel and current user attribution.';

commit;

-- Rollback (manual, after review): drop the trigger, function, policy, index and
-- table only if the recorded history does not need to be retained.
-- Do not run this automatically against the remote project.

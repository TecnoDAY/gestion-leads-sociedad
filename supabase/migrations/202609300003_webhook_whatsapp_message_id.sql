-- T3: idempotencia atomica del webhook de WhatsApp por message.id.
-- Antes: sin columna de idempotencia; el handler hacia select-then-insert por
-- telefono (carrera: dos entregas concurrentes del mismo message.id creaban
-- dos leads) y solo miraba messages[0] (perdia el resto del lote).
-- Despues: leads.whatsapp_message_id nullable con UNIQUE parcial (solo NOT NULL;
-- los leads no-WhatsApp con NULL no colisionan). El handler inserta con el
-- message.id y confirma el duplicado real tras una violacion 23505.
-- Idempotente y reejecutable; no modifica ni elimina filas existentes.

begin;

alter table public.leads
  add column if not exists whatsapp_message_id text;

-- Detiene la migracion si hay duplicados previos, sin modificar sus datos.
-- Una reconciliacion de esos registros requiere autorizacion independiente.
do $blk$
begin
  if exists (
    select 1 from public.leads
    where whatsapp_message_id is not null
    group by whatsapp_message_id having count(*) > 1
  ) then
    raise exception 'Duplicate whatsapp_message_id values: migration aborted; reconcile separately without automatic data removal';
  end if;
end;
$blk$;

create unique index if not exists leads_whatsapp_message_id_uidx
  on public.leads (whatsapp_message_id)
  where whatsapp_message_id is not null;

comment on column public.leads.whatsapp_message_id is 'Id de mensaje de Meta (value.messages[].id). UNIQUE parcial: idempotencia atomica del webhook; NULL para leads no-WhatsApp.';

commit;

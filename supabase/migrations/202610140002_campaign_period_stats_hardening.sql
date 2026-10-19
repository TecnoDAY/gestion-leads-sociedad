-- Endurecimiento de campaign_period_stats (compensatoria de 202610140001).
-- La migración original revocó solo insert/update/delete; el patrón por
-- defecto de Supabase deja REFERENCES, TRIGGER y TRUNCATE a anon/authenticated.
-- RLS no protege contra TRUNCATE (operación de tabla, no de fila): se revocan
-- también esos privilegios. Las escrituras siguen siendo solo via RPC.
-- Nota: campaign_stats, daily_report_notes y user_access arrastran el mismo
-- patrón de migraciones anteriores; su endurecimiento queda fuera de alcance
-- de esta feature y se reporta aparte.

begin;

revoke truncate, references, trigger on public.campaign_period_stats from anon, authenticated;
revoke insert, update, delete on public.campaign_period_stats from anon, authenticated;
revoke select on public.campaign_period_stats from anon;
grant select on public.campaign_period_stats to authenticated;

commit;

-- Verificación esperada tras aplicar:
--   anon: sin privilegios sobre la tabla.
--   authenticated: solo SELECT (y REFERENCES/TRIGGER si el entorno los
--   exige para FK propias; con la FK hacia auth.users no se necesitan).

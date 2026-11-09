# security-hardening

Security hardening from the 2026-11 project audit. Branch `fix/security-hardening`.
Order by verified real risk; one commit per task; push/deploy/migrations in production are the user's decision.

## Specs

- S1 Retire `kanban.html` (404 in production, not linked, stored-XSS in its renderer): remove the file and its Vite build input; `/kanban.html` redirects to `/`.
- S2 `aircall-dial`: authorize with the verified user's own id (active CRM user in `user_access`: admin/agente/supervisor), not `rpc('is_active_user')` on the service-role client (auth.uid() is null there). Dial the lead's stored `Telefono` resolved server-side; ignore client-supplied `phone`. Unknown lead -> 404.
- S3 `notify-lead-change`: require an active CRM user (role admin/agente/supervisor); `eventType` must be `created` or `updated` (else 400); lead must exist (else 404). No rate limiting (YAGNI). Same request contract as `index.html` already sends.
- S4 Revoke `EXECUTE` on unused legacy RPC `list_campaign_metrics(text)` from `authenticated` (SECURITY DEFINER without active-user guard). v2 untouched.
- S5 Patch-level dependency updates; move `vite` and `@tailwindcss/vite` to devDependencies; run `scripts/test-campaign-postgres.sh` in CI.
- S6 (optional) Revoke `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` from `anon, authenticated` + default privileges.

## Tasks

- T1 S1 inline — commit: pending
- T2 S2 inline — commit: pending
- T3 S3 inline — commit: pending
- T4 S4 inline — commit: pending
- T5 S5 inline — commit: pending
- T6 S6 — pending decision (no local Docker to verify DB changes)

## Log

- L1 User: "ejecuta el plan si encuentras errores corrigelos" (plan: paso 0 + pasos 1-6 from the improved plan).
- L2 Paso 0: production `/kanban.html` -> 404 (XSS not exposed); `/index.html` -> 200. Supabase logs unavailable (no MCP). Docker daemon unavailable locally: SQL migrations only statically verified.

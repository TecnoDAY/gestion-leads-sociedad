# security-hardening

Security hardening from the 2026-11 project audit. Branch `fix/security-hardening`.
Order by verified real risk; one commit per task; push/deploy/migrations in production are the user's decision.

## Specs

- S1 Retire `kanban.html` (404 in production, not linked, stored-XSS in its renderer): remove the file and its Vite build input; `/kanban.html` redirects to `/`.
- S2 `aircall-dial`: authorize with the verified user's own id (active CRM user in `user_access`: admin/agente/supervisor), not `rpc('is_active_user')` on the service-role client (auth.uid() is null there). Dial the lead's stored `Telefono` resolved server-side; ignore client-supplied `phone`. Unknown lead -> 404.
- S3 `notify-lead-change`: require an active CRM user (role admin/agente/supervisor); `eventType` must be `created` or `updated` (else 400); lead must exist (else 404). No rate limiting (YAGNI). Same request contract as `index.html` already sends.
- S4 Legacy RPC `list_campaign_metrics(text)` (SECURITY DEFINER without active-user guard) must reject inactive users with 42501 `active_user_required`, like the rest of the v1 module. Signature, rows and grants unchanged; v2 untouched. (Changed from REVOKE: revoking breaks `campaign_metrics_test.sql`, which calls v1 as `authenticated`.)
- S5 Patch-level dependency updates; move `vite` and `@tailwindcss/vite` to devDependencies; run `scripts/test-campaign-postgres.sh` in CI.
- S6 (optional) Revoke `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` from `anon, authenticated` + default privileges.

## Tasks

- T1 S1 inline — commit: fca6c5e
- T2 S2 inline — commit: 7948f81
- T3 S3 inline — commit: 5e93754
- T4 S4 inline — commit: 326f3b4 (SQL runtime unverified locally: no Docker)
- T5 S5 inline — commit: 27e3a60 (CI Postgres step verified only on first push)
- T6 S6 — pending decision (no local Docker to verify DB changes)

## Log

- L1 User: "ejecuta el plan si encuentras errores corrigelos" (plan: paso 0 + pasos 1-6 from the improved plan).
- L2 Paso 0: production `/kanban.html` -> 404 (XSS not exposed); `/index.html` -> 200. Supabase logs unavailable (no MCP). Docker daemon unavailable locally: SQL migrations only statically verified.
- L3 T4 approach changed from REVOKE to an active-user guard (REVOKE breaks the v1 SQL regression test). New SQL check added to campaign_metrics_test.sql; runs only via scripts/test-campaign-postgres.sh (Docker).
- L4 User: "no quiero que agregues aircall por ahora no lo necesitamos solo podemos dejarlo listo para cuando tengamos que conectarlo" -> T2 code stays (ready), aircall-dial is NOT deployed; pending question: hide the existing "Llamar con Aircall" UI button.
- L5 T5: lockfile regenerated with pnpm 11.28.5 (CI version); frozen install OK. Pre-existing unmet peer: vite wants esbuild ^0.27||^0.28, repo pins esbuild ^0.25 (tests only) -> separate upgrade.
- L6 Independent verify (gentle-ai-verify): S1 PASS, S2 PASS, S3 PASS, S4 static PASS / runtime UNVERIFIED (no Docker), S5 PASS static+build. Added verifier's role/projection/lookup-error test. Pre-existing finding (not caused here): notify-lead-change reads VAPID key with .from('vault.decrypted_secrets'), which PostgREST does not resolve to the vault schema; no migration exposes it -> push notifications likely fail with 500 vapid_secret_unavailable. Needs production evidence and a user decision.

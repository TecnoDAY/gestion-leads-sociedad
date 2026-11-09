# security-hardening

Security hardening from the 2026-11 project audit. Branch `fix/security-hardening`.
Order by verified real risk; one commit per task; push/deploy/migrations in production are the user's decision.

## Specs

- S1 Retire `kanban.html` (404 in production, not linked, stored-XSS in its renderer): remove the file and its Vite build input; `/kanban.html` redirects to `/`.
- S2 `aircall-dial`: authorize with the verified user's own id (active CRM user in `user_access`: admin/agente/supervisor), not `rpc('is_active_user')` on the service-role client (auth.uid() is null there). Dial the lead's stored `Telefono` resolved server-side; ignore client-supplied `phone`. Unknown lead -> 404.
- S3 `notify-lead-change`: require an active CRM user (role admin/agente/supervisor); `eventType` must be `created` or `updated` (else 400); lead must exist (else 404). No rate limiting (YAGNI). Same request contract as `index.html` already sends.
- S4 Legacy RPC `list_campaign_metrics(text)` (SECURITY DEFINER without active-user guard) must reject inactive users with 42501 `active_user_required`, like the rest of the v1 module. Signature, rows and grants unchanged; v2 untouched. (Changed from REVOKE: revoking breaks `campaign_metrics_test.sql`, which calls v1 as `authenticated`.)
- S5 Patch-level dependency updates; move `vite` and `@tailwindcss/vite` to devDependencies; run `scripts/test-campaign-postgres.sh` in CI.
- S7 `notify-lead-change` reads the VAPID private key through service_role-only RPC `get_vapid_private_key()` (migration 202611010002); missing key or RPC error -> 500 `vapid_secret_unavailable` without sending.
- S6 (optional) Revoke `TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` from `anon, authenticated` + default privileges.

## Tasks

- T1 S1 inline — commit: fca6c5e
- T2 S2 inline — commit: 7948f81
- T3 S3 inline — commit: 5e93754
- T4 S4 inline — commit: 326f3b4 (SQL runtime unverified locally: no Docker)
- T5 S5 inline — commit: 27e3a60 (CI Postgres step verified only on first push)
- T6 S6 — dropped (postponed by recommendation)
- T7 CI image pull retry + Docker Hub fallback — commit: 0a5a115
- T8 S7 inline — commit: this slice
- T10 apply migrations 202611010001/0002 + deploy notify-lead-change — blocked: Supabase MCP is read-only (supabase_read_only_user), no Supabase CLI

## Log

- L1 User: "ejecuta el plan si encuentras errores corrigelos" (plan: paso 0 + pasos 1-6 from the improved plan).
- L2 Paso 0: production `/kanban.html` -> 404 (XSS not exposed); `/index.html` -> 200. Supabase logs unavailable (no MCP). Docker daemon unavailable locally: SQL migrations only statically verified.
- L3 T4 approach changed from REVOKE to an active-user guard (REVOKE breaks the v1 SQL regression test). New SQL check added to campaign_metrics_test.sql; runs only via scripts/test-campaign-postgres.sh (Docker).
- L4 User: "no quiero que agregues aircall por ahora no lo necesitamos solo podemos dejarlo listo para cuando tengamos que conectarlo" -> T2 code stays (ready), aircall-dial is NOT deployed; pending question: hide the existing "Llamar con Aircall" UI button.
- L5 T5: lockfile regenerated with pnpm 11.28.5 (CI version); frozen install OK. Pre-existing unmet peer: vite wants esbuild ^0.27||^0.28, repo pins esbuild ^0.25 (tests only) -> separate upgrade.
- L6 Independent verify (gentle-ai-verify): S1 PASS, S2 PASS, S3 PASS, S4 static PASS / runtime UNVERIFIED (no Docker), S5 PASS static+build. Added verifier's role/projection/lookup-error test. Pre-existing finding (not caused here): notify-lead-change reads VAPID key with .from('vault.decrypted_secrets'), which PostgREST does not resolve to the vault schema; no migration exposes it -> push notifications likely fail with 500 vapid_secret_unavailable. Needs production evidence and a user decision.
- L7 User: "si ocultalo hasta que lo conectemos" -> AIRCALL_ENABLED=false in src/legacy/leads.js hides the lead-sheet call button; tel: link kept; flip to true to connect.
- L8 Push of main paused: origin/main..main has 12 commits with 7 migrations; production DB probe shows campaign v2 RPCs may be missing and production frontend lacks the campaign WIP code. Vercel git auto-deploy unknown.
- L9 Supabase MCP (read-only) evidence: prod applied migrations stop at 202610300001; campaign 0002-0005 (and v2 RPCs) NOT applied -> pushing main would break campaigns if Vercel auto-deploys. Tasks module applied. Edge logs: notify-lead-change v1 deployed, 121 calls/24h, logs 'No se pudo leer la clave VAPID: PGRST205 public.vault.decrypted_secrets' -> push broken in prod (confirmed). vault secret vapid_private_key exists; push_subscriptions=0 rows. First CI run failed at docker pull: ECR 'toomanyrequests'.

# authorize-user

Server-only authorization endpoint. It accepts an email, display name, and `admin|agente` role. The Supabase service-role key is read only from the Edge Function environment and is never returned or sent to the browser.

## Safe bootstrap

- Normal administration: call from an authenticated admin session. The function validates the JWT with the server-side client and confirms that the caller has an active `user_access.role = 'admin'` record before provisioning.
- First admin: configure a random `AUTHORIZE_BOOTSTRAP_TOKEN` (at least 32 characters) in the function environment and call once with `x-bootstrap-token`. Bootstrap is accepted only while there is no active admin. Remove the token after the first admin is created.
- The endpoint intentionally returns `202 { "accepted": true }` for all validation/provisioning outcomes. This avoids exposing whether an email is allow-listed or already exists.
- The browser still calls Supabase OTP with `shouldCreateUser: false`. Provisioning must happen before requesting the OTP.

Example from an authenticated admin UI (the JWT is supplied automatically by `supabase.functions.invoke`):

```js
await supabase.functions.invoke('authorize-user', {
  body: { email, nombre, role: 'agente' },
});
```

Do not call this endpoint with a service-role key from the frontend, and do not put any service key or bootstrap token in tracked files.

## Variables and deployment

Configure these as Edge Function secrets/environment variables in the Supabase dashboard or CLI; never commit them:

- `SUPABASE_URL` (required)
- `SUPABASE_SECRET_KEYS` (formato JSON real de Supabase actual, por ejemplo `{"default":"..."}`; la función acepta `default` y las variantes `service_role`, `serviceRole` y `secret`), o fallback legacy `SUPABASE_SERVICE_ROLE_KEY`
- `AUTHORIZE_BOOTSTRAP_TOKEN` (required only for first-admin bootstrap; random, at least 32 characters)

Deploy the function with the Supabase CLI or dashboard, configure the secrets, then bootstrap the first admin once. The function validates subsequent admin calls with the caller's JWT using the server-side client. Remove `AUTHORIZE_BOOTSTRAP_TOKEN` after bootstrap.

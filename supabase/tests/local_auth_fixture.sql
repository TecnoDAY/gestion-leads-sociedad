\set ON_ERROR_STOP on
-- Isolated PostgreSQL fixture only. Authentication functions model JWT claims;
-- this does not validate Supabase Auth/PostgREST or any remote database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user::text)
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(),auth.role() to anon,authenticated,service_role;
create extension if not exists btree_gist;

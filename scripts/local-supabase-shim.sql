-- Local test-harness shim for the pieces of a real Supabase project that
-- the migrations, the RLS policies and tests/rls.spec.ts assume exist.
--
-- ⚠️  NEVER RUN THIS AGAINST A REAL SUPABASE PROJECT. A real project has
-- the genuine `auth` schema, the genuine `auth.uid()`, and the three
-- roles, provisioned by Supabase itself. This file creates deliberately
-- naive stand-ins so a throwaway local Postgres can run the suite. It is
-- not a migration and must never become one: shipping a fake `auth`
-- schema into a real project's migration history would be actively
-- harmful.
--
-- Idempotent, and safe to run BOTH before and after `npm run db:migrate`
-- — before, so the roles and default privileges exist while tables are
-- created; after, so tables created by the migration get their grants.
--
--   createdb afd_crm_test
--   export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/afd_crm_test
--   psql "$DATABASE_URL" -f scripts/local-supabase-shim.sql
--   npm run db:migrate
--   psql "$DATABASE_URL" -f scripts/local-supabase-shim.sql
--   npm run db:seed
--   npm test
--
-- See docs/DECISIONS.md, 2026-08-29 [testing].

-- ---------------------------------------------------------------------
-- The three roles every Supabase project has.
--
-- RLS policies are meant to be the ONLY real gate on top of broad table
-- grants, exactly as in production. A previous run of this suite failed
-- everywhere with "permission denied for table X" because the grants
-- below were missing — which looks like an RLS failure and is not one.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant anon, authenticated, service_role to postgres;

-- ---------------------------------------------------------------------
-- The `auth` schema. Only the two things this codebase actually touches:
-- `auth.users`, which `profiles.id` has a real FK to, and `auth.uid()`,
-- which every RLS policy is built on.
-- ---------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Reads `sub` out of the request.jwt.claims GUC — exactly what
-- tests/rls.spec.ts's asUser() sets before each simulated request, and
-- the same contract as Supabase's own auth.uid().
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- The broad grants Supabase provisions automatically. Run this file
-- again after a migration adds tables, or add the default privileges
-- below before one.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;
grant usage, select on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

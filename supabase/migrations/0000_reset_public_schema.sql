-- ─────────────────────────────────────────────────────────────
-- SnapBack — reset the public schema.
--
-- This project reuses an existing Supabase project (formerly "TaskMesh")
-- whose public schema held an unrelated task/worker marketplace. Per explicit
-- user authorization (2026-07-16), we drop the entire public schema and its
-- prior tables, then recreate it with the standard Supabase role grants so
-- the API layer (anon/authenticated/service_role) keeps working. The SnapBack
-- schema is created by the following migration (0001_init.sql).
-- ─────────────────────────────────────────────────────────────

drop schema if exists public cascade;
create schema public;

-- Restore default Supabase grants for the recreated schema.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

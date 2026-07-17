-- ─────────────────────────────────────────────────────────────
-- SnapBack — enable Row Level Security, default-deny.
--
-- This app's auth is custom (Circle email OTP + a signed session cookie), not
-- Supabase Auth — there is no `auth.uid()` to key classic per-row policies off.
-- All application reads/writes go through the service-role client (server-only,
-- gated by our own session + ownership checks in code); the Postgres
-- `service_role` role has BYPASSRLS, so it is unaffected by anything here.
--
-- Enabling RLS with zero policies makes every table unreadable/unwritable via
-- the `anon` and `authenticated` roles (i.e. any direct-from-browser query
-- using the publishable key) — strictly tighter than "scoped to own rows",
-- since those roles get nothing at all. This is the correct default given the
-- app never issues direct browser-to-Postgrest queries against these tables.
-- ─────────────────────────────────────────────────────────────

alter table users               enable row level security;
alter table wallets             enable row level security;
alter table policies            enable row level security;
alter table tasks               enable row level security;
alter table quotes              enable row level security;
alter table payments            enable row level security;
alter table disputes            enable row level security;
alter table judge_votes         enable row level security;
alter table reputation          enable row level security;
alter table app_wallets         enable row level security;
alter table estimator_sessions  enable row level security;
alter table estimator_attempts  enable row level security;
alter table listings            enable row level security;
alter table validations         enable row level security;

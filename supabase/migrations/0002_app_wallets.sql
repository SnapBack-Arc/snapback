-- ─────────────────────────────────────────────────────────────
-- SnapBack — app-level system wallets.
--
-- Distinct from per-user `wallets`. Holds singleton dev-controlled wallets the
-- app operates itself:
--   * delegate — a single EOA that signs Gateway BurnIntents (EIP-712) on behalf
--     of the SCA wallets, since Gateway does not accept smart-contract signatures.
--   * treasury — destination for quote-phase escrow sweeps (Phase 4).
-- ─────────────────────────────────────────────────────────────

do $$ begin
  create type app_wallet_role as enum ('delegate', 'treasury');
exception when duplicate_object then null; end $$;

create table if not exists app_wallets (
  id                uuid primary key default gen_random_uuid(),
  role              app_wallet_role not null unique,
  circle_wallet_id  text unique not null,
  address           text not null,
  blockchain        text not null default 'ARC-TESTNET',
  account_type      text not null default 'EOA',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger app_wallets_updated_at before update on app_wallets
  for each row execute function set_updated_at();

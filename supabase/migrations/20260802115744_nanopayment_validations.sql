-- ─────────────────────────────────────────────────────────────
-- SnapBack — nanopayment validation + reliability-weighted insurance.
--
-- Replaces the dispute/judge-panel path for this app's actual core loop:
-- an agent-to-agent nanopayment happens (real x402 spend, e.g. Parallel
-- search), SnapBack validates the paid-for answer, and pays the user back
-- if it's wrong — no escrow, no dispute filing, no judge panel. One row per
-- validation run, real across every wallet/site so a site's aggregate
-- correctness rate (derived live from this table, not a separate rollup)
-- can price the payout: a rare wrong answer on an otherwise-reliable site
-- pays more than a wrong answer on a site that's wrong all the time.
-- ─────────────────────────────────────────────────────────────

do $$ begin
  create type validation_verdict as enum ('correct', 'incorrect');
exception when duplicate_object then null; end $$;

create table if not exists nanopayment_validations (
  id                        uuid primary key default gen_random_uuid(),
  wallet_id                 uuid not null references wallets(id) on delete cascade,
  -- Identifies the paid data source this nanopayment went to (e.g.
  -- "parallel.ai") — the unit reliability is aggregated per, across every
  -- wallet that's ever validated a nanopayment to it.
  site                      text not null,
  instruction               text not null,
  nanopayment_usdc          numeric(20, 6) not null default 0,
  validation_fee_usdc       numeric(20, 6) not null default 0,
  verdict                   validation_verdict not null,
  -- Real insurance payout to this wallet, priced off the site's aggregate
  -- correctness rate at the moment of this validation — 0 when verdict is
  -- 'correct'.
  payout_usdc               numeric(20, 6) not null default 0,
  nanopayment_payment_id    uuid references payments(id) on delete set null,
  validation_fee_payment_id uuid references payments(id) on delete set null,
  payout_payment_id         uuid references payments(id) on delete set null,
  created_at                timestamptz not null default now()
);
create index if not exists nanopayment_validations_wallet_idx on nanopayment_validations(wallet_id);
create index if not exists nanopayment_validations_site_idx on nanopayment_validations(site);

alter table nanopayment_validations enable row level security;

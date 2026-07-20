-- ─────────────────────────────────────────────────────────────
-- SnapBack — real, mainnet Research & Sourcing payment.
--
-- Research & Sourcing's real-web-search deliverable now backs one search
-- with a genuine, non-simulated x402 payment to Parallel
-- (parallelmpp.dev/api/search) — real USDC on Base mainnet, not Arc
-- Testnet like everything else in this app. A new singleton admin-only
-- Circle wallet (`parallel_payer`, Base mainnet EOA — see
-- lib/app-wallets.ts) pays it non-interactively via Circle's
-- signTypedData API, same automation model as delegate/treasury/arbiter.
--
-- `marketplace_payment` records that real payment on the same `payments`
-- ledger every other transfer in this app uses, distinguished from the
-- Arc-Testnet rows only by `chain_id` (8453, not Arc's default) — no new
-- column needed. Applied directly against the production database via the
-- Supabase SQL Editor (confirmed live) since `supabase db push` is
-- currently blocked by pre-existing, unrelated migration-history drift;
-- this file exists so local history matches what's actually live.
-- ─────────────────────────────────────────────────────────────

alter type app_wallet_role add value if not exists 'parallel_payer';
alter type payment_kind add value if not exists 'marketplace_payment';

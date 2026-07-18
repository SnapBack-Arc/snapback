-- ─────────────────────────────────────────────────────────────
-- SnapBack — Phase A validator cost-recovery fix.
--
-- The buyer-agent validator (lib/validator.ts) runs one real LLM call on
-- every submission — approval or rejection — costing ~$0.016-0.02/call
-- measured live. Nothing in the fee model recovered this: the happy-path
-- platform skim is a % of the seller's quoted amount (badly undershoots a
-- roughly-fixed per-call cost on small tasks), and the disclosed contingent
-- arbitration fee is never actually charged in real code (no judge-payout
-- path exists yet — see admin-data.ts).
--
-- Adds a new fixed, always-charged fee (`ESTIMATOR_VALIDATION_FEE_USDC`,
-- default $0.03) folded into `guaranteed_total_usdc` the same way
-- `happy_path_fee_usdc` already is — a separate disclosed line item, not
-- folded into the % happy-path rate. Routed to Treasury as its own
-- `payments` row (`validation_fee` kind), mirroring `platform_fee`.
-- ─────────────────────────────────────────────────────────────

alter type payment_kind add value if not exists 'validation_fee';

alter table estimator_sessions
  add column if not exists validation_fee_usdc numeric(20, 6);

alter table tasks
  add column if not exists validation_fee_usdc numeric(20, 6);

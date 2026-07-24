-- SnapBack — dispute-insurance premium: a small, disclosed, non-refundable
-- charge on every task that funds the platform's full-refund guarantee on a
-- buyer-won standard dispute.
--
-- Real Claude+Parallel execution cost hits SnapBack's own operational
-- accounts immediately at delivery time (lib/agents/research-sourcing.ts),
-- completely independent of and before any dispute outcome. On a buyer-won
-- standard dispute, the entire job-cost escrow (including the existing 1.5x
-- cost buffer) refunds to the buyer on-chain — that real infra spend is
-- never recovered. Measured organic buyer-win rate: 37.5% (3 of 8 real,
-- non-test disputes) — above the ~33.3% rate the existing buffer alone
-- breaks even against. This premium closes that gap. See
-- lib/estimator/fees.ts's disputeInsurancePremiumPct for the sizing math and
-- its provisional-not-permanent framing.
--
-- Structurally belongs with platform_fee/validation_fee (unconditional,
-- always collected, never refunded) — NOT with dispute_contingency, despite
-- the similar name; the contingency is a refundable holdback, this isn't.

alter type payment_kind add value if not exists 'dispute_insurance_premium';

-- Stored on the session at quote time (same reason happy_path_fee_usdc and
-- validation_fee_usdc are stored, not recomputed at funding time): the rate
-- is an env-configurable global, and storing the quote-time amount is what
-- guarantees funding time charges the exact same number the buyer saw on
-- screen — recomputing independently later risked exactly the "two
-- different prices on one screen" bug already fixed once for the seller
-- price (see lib/estimator/marketplace.ts's docblock).
alter table estimator_sessions
  add column if not exists dispute_insurance_premium_usdc numeric(20, 6);


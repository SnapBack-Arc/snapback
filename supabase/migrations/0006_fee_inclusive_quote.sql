-- ─────────────────────────────────────────────────────────────
-- SnapBack — fee-inclusive Estimator quote.
--
-- The Estimator quote now carries two figures, computed once per spec:
--   * guaranteed_total_usdc — seller_cost_estimate_usdc (averaged across 2-3
--     comparable active Marketplace listings) + happy_path_fee_usdc (the
--     platform's expected happy-path skim). This is the headline number used
--     for budget-ceiling checks against the buyer's standing policy, and the
--     figure the final task payment is credited against.
--   * disclosed_contingent_fee_pct — the arbitration fee rate (micro vs large
--     transaction tier) disclosed alongside, NOT folded into guaranteed_total.
--     It only applies if a dispute occurs, and does not affect the refundable
--     base amount.
--
-- Both are stored on the estimator_sessions row (the quote-phase record) and
-- copied onto the tasks row once a session is credited to a task, so actual
-- settlement can later be compared against what was quoted.
-- ─────────────────────────────────────────────────────────────

-- Buyer-side happy-path platform skim, collected on top of the seller's
-- quoted amount so seller payouts stay predictable (seller receives their
-- full quoted amount; the skim never comes out of it).
alter type payment_kind add value if not exists 'platform_fee';

alter table estimator_sessions
  add column if not exists seller_cost_estimate_usdc numeric(20, 6),
  add column if not exists happy_path_fee_usdc numeric(20, 6),
  add column if not exists guaranteed_total_usdc numeric(20, 6),
  add column if not exists disclosed_contingent_fee_pct numeric(6, 4),
  add column if not exists matched_listing_ids jsonb not null default '[]'::jsonb;

comment on column estimator_sessions.seller_cost_estimate_usdc is
  'Average price_usdc across 2-3 comparable active Marketplace listings.';
comment on column estimator_sessions.happy_path_fee_usdc is
  'seller_cost_estimate_usdc * ESTIMATOR_HAPPY_PATH_FEE_PCT — buyer-side, added on top.';
comment on column estimator_sessions.guaranteed_total_usdc is
  'seller_cost_estimate_usdc + happy_path_fee_usdc. The headline quote number.';
comment on column estimator_sessions.disclosed_contingent_fee_pct is
  'Contingent arbitration fee rate (micro/large tier), disclosed but not folded into guaranteed_total_usdc.';

alter table tasks
  add column if not exists guaranteed_total_usdc numeric(20, 6),
  add column if not exists disclosed_contingent_fee_pct numeric(6, 4);

comment on column tasks.guaranteed_total_usdc is
  'Copied from the estimator_sessions quote at credit time — the fee-inclusive figure actual settlement is compared against.';
comment on column tasks.disclosed_contingent_fee_pct is
  'Copied from the estimator_sessions quote at credit time — the contingent arbitration fee rate disclosed to the buyer.';

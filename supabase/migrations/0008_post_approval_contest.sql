-- ─────────────────────────────────────────────────────────────
-- SnapBack — post-approval contest path.
--
-- Auto-approve was previously final. A buyer now has a window after
-- auto-approve (matching the accept window) to file a "post-approval
-- contest" — reuses the same `disputes` + `judge_votes` records and the
-- same 3-judge (2-of-3, 5-judge escalation) panel as a standard dispute,
-- tagged distinctly because the validator already found no fault and the
-- seller has already been paid:
--
--   * result upheld  → contest fee forfeited, seller's payout stands, no
--     fund movement. Counts as a LOSS in buyer_dispute_stats.
--   * buyer wins     → refunded from the Treasury's dispute-insurance pool
--     (never clawed back from the seller's wallet — this project deliberately
--     avoids issuer-style clawback). Counts as a WIN.
--     Also generates educational feedback (spec-vs-delivery gap + 2-3
--     rewritten sample specs) using the same Claude structured-output
--     pattern as the Estimator's spec parser.
-- ─────────────────────────────────────────────────────────────

alter type payment_kind add value if not exists 'insurance_payout';

do $$ begin
  create type dispute_kind as enum ('standard', 'post_approval_contest');
exception when duplicate_object then null; end $$;

alter table disputes
  add column if not exists dispute_kind dispute_kind not null default 'standard',
  add column if not exists validator_reasoning_snapshot jsonb,
  add column if not exists insurance_payout_usdc numeric(20, 6),
  add column if not exists insurance_payout_payment_id uuid references payments(id) on delete set null,
  add column if not exists educational_feedback jsonb;

comment on column disputes.validator_reasoning_snapshot is
  'Post-approval contests only: snapshot of the validator run that auto-approved the task (criteria, rationale) so judges review it alongside the delivered payload.';
comment on column disputes.insurance_payout_usdc is
  'Post-approval contests only, buyer-win: amount refunded from Treasury''s dispute-insurance pool. Never a seller clawback.';
comment on column disputes.educational_feedback is
  'Post-approval contests only, buyer-win: { gap_summary, rewritten_specs[] } comparing the original task spec against the delivery.';

-- The actual delivered payload was never persisted (only a hash column that
-- nothing wrote to) — post-approval contests need the real content to compare
-- against the original spec, so validations now stores it.
alter table validations
  add column if not exists deliverable jsonb;

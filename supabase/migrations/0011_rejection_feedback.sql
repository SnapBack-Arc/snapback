-- ─────────────────────────────────────────────────────────────
-- SnapBack — buyer-facing feedback on validator rejection (Phase 3B).
--
-- disputes.educational_feedback (added in 0008) previously held only the
-- post-approval-contest, buyer-win shape ({ gap_summary, rewritten_specs[] }).
-- It's now also populated immediately when the validator auto-files a
-- *standard* dispute on rejection — { gap_summary, resubmission_context } —
-- so a rejected buyer sees the SLA-vs-delivery gap and carry-forward text for
-- a resubmission right away, not only if/when a contest resolves in their
-- favor. No new column: same jsonb, shape distinguished by dispute_kind +
-- presence of resubmission_context (lib/disputes/feedback.ts).
--
-- Comment-only migration — no schema change.
-- ─────────────────────────────────────────────────────────────

comment on column disputes.educational_feedback is
  'Buyer-facing feedback, shape varies by dispute_kind: post_approval_contest buyer-win -> { gap_summary, rewritten_specs[] } (spec-vs-delivery gap); standard (validator-rejected) -> { gap_summary, resubmission_context } (SLA-vs-delivery gap + carry-forward text for a resubmission). See lib/disputes/feedback.ts.';

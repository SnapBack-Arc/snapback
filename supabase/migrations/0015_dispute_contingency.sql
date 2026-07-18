-- ─────────────────────────────────────────────────────────────
-- SnapBack — Phase 4: real fee revenue routing to Treasury.
--
-- The happy-path fee, validation fee, and disclosed contingent arbitration
-- fee were all `payments` rows with no matching on-chain transfer —
-- Treasury's real balance stayed 0 regardless of attributed ledger revenue.
-- The first two are unconditional and now collected for real, upfront, at
-- task-funding time. The third — the ~2% "if a dispute occurs" fee already
-- disclosed to buyers at quote time (disclosed_contingent_fee_pct) — is also
-- now collected for real at the same time, but held (not kept) until the
-- outcome is known: refunded on clean completion or a buyer-won dispute,
-- kept as real Treasury revenue only on a buyer-lost dispute.
-- ─────────────────────────────────────────────────────────────

alter type payment_kind add value if not exists 'dispute_contingency';

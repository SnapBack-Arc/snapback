-- SnapBack — retry-safe settlement state for real money-moving dispute
-- calls, and a distinct terminal status for when they can't complete.
--
-- Four legs move real funds/state during dispute resolution: the on-chain
-- SnapBackEscrow.resolveDispute arbiter call, the filing-fee refund, the
-- dispute-contingency refund (when triggered from a resolved dispute — the
-- sweepUncontestedContingencies path has no dispute row and is out of scope
-- here, see the README's Known limitations), and the insurance-pool payout
-- on a contest win. All four share one risk: Circle's
-- createContractExecutionTransaction was never called with a
-- caller-controlled idempotencyKey, so a lost response after a real
-- submission had no safe way to retry without risking a second real
-- submission. settlement_state persists a UUID idempotency key and the
-- returned Circle tx id BEFORE waiting on confirmation, so a retry can
-- resume (reuse the same key to submit, or re-poll the same tx id) instead
-- of blind-resubmitting. See lib/disputes/settlement.ts.

alter type dispute_status add value if not exists 'settlement_failed';

alter table disputes
  add column if not exists settlement_state jsonb not null default '{}'::jsonb;

comment on column disputes.settlement_state is
  'Per-leg retry state for real settlement calls, keyed by leg name (onchain_resolve, filing_fee_refund, dispute_contingency_refund, insurance_payout). Each leg: { idempotency_key, circle_tx_id, attempt, status }. Written before the corresponding Circle submit/confirm call — see lib/disputes/settlement.ts:runSettlementLeg.';

-- SnapBack — close the sweep-path contingency-refund concurrency race.
--
-- sweepUncontestedContingencies (src/lib/disputes/service.ts) runs on every
-- /api/estimator/quote submission for a buyer with qualifying tasks, not
-- just on retry-after-failure — two overlapping requests for the same buyer
-- could both read the same dispute_contingency payment as 'escrowed' and
-- both submit a real transferUsdc before either write landed. refund_pending
-- is an atomic claim marker: `UPDATE payments SET status = 'refund_pending'
-- WHERE id = $1 AND status = 'escrowed' RETURNING *` either claims the row
-- or returns zero rows, so a second overlapping call bails out before ever
-- calling transferUsdc. refund_failed is the distinct terminal state for
-- exhausted retries, so a stuck refund is visible instead of parked at
-- refund_pending forever. See lib/disputes/settlement.ts's runPaymentRefundLeg
-- and the README's Known limitations for the remaining refund_pending
-- staleness gap (a process killed between claim and first attempt has no
-- automatic recovery — surfaced on /admin, not auto-healed).

alter type payment_status add value if not exists 'refund_pending';
alter type payment_status add value if not exists 'refund_failed';

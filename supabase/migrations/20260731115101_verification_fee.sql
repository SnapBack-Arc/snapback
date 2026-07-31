-- SnapBack — the home page's "Verify" step (VerifyFlow.tsx): a small, real,
-- always-kept fee charged when the user clicks Verify (not for the free
-- "Get Answer" step). Charged regardless of the CORRECT/INCORRECT judged
-- outcome — see /api/demo/verify.
--
-- Deliberately its own payment_kind, not reused from platform_fee: this is a
-- genuinely different revenue stream (a flat per-verify charge with no
-- escrow/task/seller behind it at all), not the same thing as the escrow
-- flow's happy-path skim — it deserves its own accurate line in admin
-- Treasury reporting rather than being silently folded into that one.

alter type payment_kind add value if not exists 'verification_fee';

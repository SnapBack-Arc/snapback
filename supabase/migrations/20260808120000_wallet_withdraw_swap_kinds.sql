-- ─────────────────────────────────────────────────────────────
-- Two new payment_kind values for the /wallet redesign's real
-- Withdraw and Swap actions — a user moving their own USDC out to an
-- external address (transferUsdc, same shape as insurance payouts), or
-- swapping between real Arc Testnet assets (USDC/EURC/cirBTC) via
-- Circle's App Kit. Neither is a deposit or a payout-to-user in the
-- insurance sense, so they deliberately don't match any existing
-- isCompletedDepositLeg/isPaidBackToWallet filter.
-- ─────────────────────────────────────────────────────────────

alter type payment_kind add value if not exists 'withdrawal';
alter type payment_kind add value if not exists 'swap';

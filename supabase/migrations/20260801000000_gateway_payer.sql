-- ─────────────────────────────────────────────────────────────
-- SnapBack — app-funded verification payment (demo).
--
-- The demo verify flow charges a real Arc Testnet fee via the Gateway
-- x402 path. Because the buyer must be EOA-compatible, the app uses a
-- dedicated singleton Circle-managed wallet (`gateway_payer`) instead of
-- the logged-in SCA user wallet. Treasury remains the payTo receiver.
--
-- This wallet mirrors the existing `delegate` / `treasury` / `arbiter`
-- pattern: a server-controlled app wallet that signs signed-data
-- requests via Circle. It is backend-funded for verification only; it is
-- not a user wallet or a marketplace buyer wallet.
-- ─────────────────────────────────────────────────────────────

alter type app_wallet_role add value if not exists 'gateway_payer';

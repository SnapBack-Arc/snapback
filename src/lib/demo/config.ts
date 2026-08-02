/**
 * Demo mode: two fixed mock accounts for judge/demo access, gated behind
 * NEXT_PUBLIC_DEMO_MODE. See lib/demo/reset.ts and lib/demo/seed.ts.
 *
 * Emails are stored lowercase, matching the normalization the real
 * email-OTP path applies before upserting `users` (see
 * /api/auth/session) — comparisons against session.email must lowercase
 * first too.
 */

export const DEMO_TEST_ACCOUNT_EMAIL = "testaccount@snapback.com";
export const DEMO_NEW_ACCOUNT_EMAIL = "newaccount@snapback.com";
export const DEMO_ADMIN_ACCOUNT_EMAIL = "adminaccount@snapback.com";

/** Circle wallet `metadata.refId` tags — let the demo personas reuse the same
 * on-chain wallet across resets instead of minting (and abandoning) a fresh
 * one every time, which would strand any faucet funding on the old address. */
export const DEMO_TEST_WALLET_REF_ID = "demo-test-account";
export const DEMO_NEW_WALLET_REF_ID = "demo-new-account";
export const DEMO_ADMIN_WALLET_REF_ID = "demo-admin-account";

export type DemoPersona = "test" | "new" | "admin";

export function isDemoModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function demoPersonaEmail(persona: DemoPersona): string {
  if (persona === "test") return DEMO_TEST_ACCOUNT_EMAIL;
  if (persona === "admin") return DEMO_ADMIN_ACCOUNT_EMAIL;
  return DEMO_NEW_ACCOUNT_EMAIL;
}

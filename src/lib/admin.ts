import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import type { Session } from "@/lib/session";
import type { WalletRow } from "@/lib/supabase/types";

/**
 * Admin gating: a comma-separated wallet-address allowlist (ADMIN_WALLET_ADDRESSES).
 *
 * This app's auth is custom (Circle email OTP + a signed session cookie), not
 * Supabase Auth — there is no `auth.uid()` for Postgres RLS to key off. All
 * server-side reads already go through the service-role client, which bypasses
 * RLS entirely; access control lives here, in application code.
 */
function adminAddresses(): Set<string> {
  return new Set(
    (process.env.ADMIN_WALLET_ADDRESSES ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminAddress(address: string): boolean {
  return adminAddresses().has(address.toLowerCase());
}

/** Redirects away unless the caller is logged in with an allowlisted admin wallet. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  if (!wallet || !isAdminAddress(wallet.address)) redirect("/dashboard");

  return { session, wallet };
}

export type AdminApiAuth =
  | { ok: true; session: Session; wallet: WalletRow }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Same allowlist check as requireAdmin(), shaped for API routes: returns a
 * result instead of redirecting (a redirect makes no sense for a POST
 * handler a client expects JSON back from). Every /api/admin/* route calls
 * this first, so admin gating is enforced server-side on every request —
 * not just hidden behind the /admin UI, which itself also calls
 * requireAdmin() via its layout.
 */
export async function requireAdminApi(): Promise<AdminApiAuth> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "unauthenticated" };

  const wallet = await getUserWallet(session.uid);
  if (!wallet || !isAdminAddress(wallet.address)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, session, wallet };
}

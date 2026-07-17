import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

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

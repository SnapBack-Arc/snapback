import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/circle-wallets";
import { getAdminSeq } from "@/lib/admin";
import { formatUserId } from "@/lib/user-id";

/**
 * The signed-in user's own display ID — an admin's own independent
 * "a1, a2..." sequence if their wallet is on ADMIN_WALLET_ADDRESSES,
 * otherwise their plain signup-order users.user_seq. Shared by Nav/AdminNav
 * (so anyone can see their own ID at a glance) and the Profile page.
 */
export async function getMyUserId(userId: string): Promise<string> {
  const supabase = createServiceSupabase();
  const [{ data: user }, wallet] = await Promise.all([
    supabase.from("users").select("user_seq").eq("id", userId).maybeSingle(),
    getUserWallet(userId),
  ]);

  const adminSeq = wallet ? getAdminSeq(wallet.address) : null;
  if (adminSeq !== null) return formatUserId(adminSeq, true);
  return formatUserId(user?.user_seq ?? 0, false);
}

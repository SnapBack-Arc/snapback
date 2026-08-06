import "server-only";
import { getUserControlledWalletsClient } from "@/lib/circle";
import { createServiceSupabase } from "@/lib/supabase/server";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";
import type { WalletRow } from "@/lib/supabase/types";

/**
 * After a user completes Circle's hosted PIN-setup challenge (started by
 * createUserPinWithWallets in /api/auth/session), the resulting wallet
 * exists on Circle's side but not yet in Supabase. Fetch it via the
 * user-controlled wallets API and persist it — same wallets table/columns
 * as createArcWalletForUser's developer-controlled path; control: "user" is
 * the only difference.
 */
export async function persistUserControlledWallet(
  userId: string,
  userToken: string,
): Promise<WalletRow> {
  const client = getUserControlledWalletsClient();
  const res = await client.listWallets({ userToken, blockchain: CIRCLE_ARC_BLOCKCHAIN });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error("Circle did not return a user-controlled wallet");
  }

  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("wallets")
    .insert({
      user_id: userId,
      circle_wallet_id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? CIRCLE_ARC_BLOCKCHAIN,
      account_type: wallet.accountType ?? "SCA",
      control: "user",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to persist wallet: ${error.message}`);
  return data as WalletRow;
}

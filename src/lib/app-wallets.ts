import "server-only";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { ensureWalletSet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";
import type { Database } from "@/lib/supabase/types";

type AppWalletRow = Database["public"]["Tables"]["app_wallets"]["Row"];
type AppWalletRole = Database["public"]["Enums"]["app_wallet_role"];

/**
 * Get-or-create a singleton app-level wallet for a role.
 *
 * The `delegate` wallet is an EOA (Gateway BurnIntents require EIP-712 / EOA
 * signatures and reject smart-contract signatures). Treasury is likewise an EOA
 * so it can be operated directly. Both are dev-controlled on ARC-TESTNET.
 */
export async function ensureAppWallet(
  role: AppWalletRole,
): Promise<AppWalletRow> {
  const supabase = createServiceSupabase();
  const { data: existing } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", role)
    .maybeSingle();
  if (existing) return existing;

  const client = getDeveloperControlledWalletsClient();
  const walletSetId = await ensureWalletSet();
  const res = await client.createWallets({
    walletSetId,
    blockchains: [CIRCLE_ARC_BLOCKCHAIN],
    accountType: "EOA",
    count: 1,
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error(`Circle did not return an EOA wallet for ${role}`);
  }

  const { data, error } = await supabase
    .from("app_wallets")
    .insert({
      role,
      circle_wallet_id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? CIRCLE_ARC_BLOCKCHAIN,
      account_type: wallet.accountType ?? "EOA",
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to persist ${role} wallet: ${error?.message}`);
  }
  return data;
}

export const ensureDelegateWallet = () => ensureAppWallet("delegate");
export const ensureTreasuryWallet = () => ensureAppWallet("treasury");

/**
 * SnapBackEscrow's on-chain `arbiter` — the only address resolveDispute()
 * accepts calls from. Provisioned as a Circle-managed EOA like
 * delegate/treasury; SnapBackEscrow.arbiter is repointed at its address via
 * a one-time owner-gated setArbiter() call (see
 * contracts/script/SetArbiterToAppWallet.s.sol), not embedded as a raw key.
 */
export const ensureArbiterWallet = () => ensureAppWallet("arbiter");

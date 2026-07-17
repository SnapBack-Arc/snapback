import "server-only";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { createServiceSupabase } from "@/lib/supabase/server";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";
import type { WalletRow } from "@/lib/supabase/types";

const WALLET_SET_NAME = "SnapBack";

/**
 * Find or create the app's dev-controlled wallet set. All SnapBack SCA wallets
 * live under a single wallet set for the entity. Idempotent by name.
 */
export async function ensureWalletSet(): Promise<string> {
  const client = getDeveloperControlledWalletsClient();
  const existing = await client.listWalletSets();
  // `name` is returned by the API but not surfaced on the SDK's union type.
  const found = existing.data?.walletSets?.find(
    (ws) => (ws as { name?: string }).name === WALLET_SET_NAME,
  );
  if (found?.id) return found.id;

  const created = await client.createWalletSet({ name: WALLET_SET_NAME });
  const id = created.data?.walletSet?.id;
  if (!id) throw new Error("Failed to create wallet set");
  return id;
}

/**
 * Create one ARC-TESTNET SCA wallet for a user and persist it to Supabase.
 * Returns the stored wallet row. Assumes the user has no wallet yet (callers
 * should check first via getUserWallet).
 */
export async function createArcWalletForUser(
  userId: string,
): Promise<WalletRow> {
  const client = getDeveloperControlledWalletsClient();
  const walletSetId = await ensureWalletSet();

  const res = await client.createWallets({
    walletSetId,
    blockchains: [CIRCLE_ARC_BLOCKCHAIN],
    accountType: "SCA",
    count: 1,
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error("Circle did not return a wallet");
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
      control: "developer",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to persist wallet: ${error.message}`);
  return data as WalletRow;
}

/** Get the user's ARC-TESTNET wallet from Supabase, or null if none yet. */
export async function getUserWallet(userId: string): Promise<WalletRow | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .eq("blockchain", CIRCLE_ARC_BLOCKCHAIN)
    .maybeSingle();

  if (error) throw new Error(`Failed to load wallet: ${error.message}`);
  return (data as WalletRow | null) ?? null;
}

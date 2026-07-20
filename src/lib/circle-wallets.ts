import "server-only";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { createServiceSupabase } from "@/lib/supabase/server";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";
import type { WalletRow } from "@/lib/supabase/types";

const WALLET_SET_NAME = "SnapBack";

/**
 * Find or create the app's dev-controlled wallet set. All SnapBack SCA wallets
 * live under a single wallet set for the entity. Idempotent by name.
 *
 * Accepts an explicit client because the `parallel_payer` wallet lives under
 * Circle's live/production entity (getLiveDeveloperControlledWalletsClient),
 * a wallet set entirely separate from the sandbox one every other wallet
 * uses — same name, different Circle environment.
 */
export async function ensureWalletSet(
  client: ReturnType<typeof getDeveloperControlledWalletsClient> = getDeveloperControlledWalletsClient(),
): Promise<string> {
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
 * Look up a previously created Circle wallet by its `metadata.refId` tag
 * (set at creation, see `createArcWalletForUser`). Used by demo mode to
 * reuse the same on-chain wallet across resets instead of minting a new one
 * (and stranding faucet funds on the abandoned address) every time.
 */
async function findWalletByRefId(
  refId: string,
): Promise<{ id: string; address: string; blockchain?: string; accountType?: string } | null> {
  const client = getDeveloperControlledWalletsClient();
  const walletSetId = await ensureWalletSet();
  const res = await client.listWallets({ refId, walletSetId });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) return null;
  return {
    id: wallet.id,
    address: wallet.address,
    blockchain: wallet.blockchain,
    accountType: wallet.accountType,
  };
}

/**
 * Create one ARC-TESTNET SCA wallet for a user and persist it to Supabase.
 * Returns the stored wallet row. Assumes the user has no wallet yet (callers
 * should check first via getUserWallet).
 *
 * @param refId Optional stable reference tag (demo mode only). When set and
 *   a Circle wallet already carries that tag, the existing on-chain wallet is
 *   reused (only the Supabase row is (re)created) instead of minting a new
 *   one. Real users never pass this — every real wallet is freshly minted.
 */
export async function createArcWalletForUser(
  userId: string,
  refId?: string,
): Promise<WalletRow> {
  const supabase = createServiceSupabase();
  let wallet: { id: string; address: string; blockchain?: string; accountType?: string } | undefined;

  if (refId) {
    wallet = (await findWalletByRefId(refId)) ?? undefined;
  }

  if (!wallet) {
    const client = getDeveloperControlledWalletsClient();
    const walletSetId = await ensureWalletSet();
    const res = await client.createWallets({
      walletSetId,
      blockchains: [CIRCLE_ARC_BLOCKCHAIN],
      accountType: "SCA",
      count: 1,
      ...(refId ? { metadata: [{ refId }] } : {}),
    });
    const created = res.data?.wallets?.[0];
    if (!created?.id || !created.address) {
      throw new Error("Circle did not return a wallet");
    }
    wallet = created;
  }

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

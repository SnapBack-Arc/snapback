import "server-only";
import { getDeveloperControlledWalletsClient, getLiveDeveloperControlledWalletsClient } from "@/lib/circle";
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
 * signatures and reject smart-contract signatures). Treasury and arbiter are
 * likewise EOAs so they can be operated directly. All three are
 * dev-controlled on ARC-TESTNET.
 *
 * `blockchain` defaults to ARC-TESTNET — `parallel_payer` is the one
 * exception, created on real Base mainnet (see ensureParallelPayerWallet)
 * since that's the only role that ever moves real, non-testnet funds. It
 * also passes the live Circle client (`client` param) since Circle's
 * sandbox entity can't create or see real mainnet wallets.
 */
export async function ensureAppWallet(
  role: AppWalletRole,
  blockchain: string = CIRCLE_ARC_BLOCKCHAIN,
  client: ReturnType<typeof getDeveloperControlledWalletsClient> = getDeveloperControlledWalletsClient(),
): Promise<AppWalletRow> {
  const supabase = createServiceSupabase();
  const { data: existing } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", role)
    .maybeSingle();
  if (existing) return existing;

  const walletSetId = await ensureWalletSet(client);
  const res = await client.createWallets({
    walletSetId,
    blockchains: [blockchain as Parameters<typeof client.createWallets>[0]["blockchains"][number]],
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
      blockchain: wallet.blockchain ?? blockchain,
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

/**
 * Admin-only wallet that pays Parallel's real x402 endpoint
 * (parallelmpp.dev/api/search) for the Research & Sourcing agent's one real
 * paid search per task. Real Base mainnet, real USDC — every other wallet
 * in this app is Arc Testnet. Never exposed to buyers: no listing, no
 * buyer-reachable route references it.
 */
export const ensureParallelPayerWallet = () =>
  ensureAppWallet("parallel_payer", "BASE", getLiveDeveloperControlledWalletsClient());

/**
 * One-shot provisioning for the real Parallel marketplace payment: creates
 * (or reuses) the singleton `parallel_payer` app wallet — a Circle-managed
 * EOA on real Base mainnet (not Arc Testnet like every other wallet in this
 * app) — and persists it to `app_wallets`. This wallet's only job is
 * signing real x402 payments to Parallel's search API
 * (lib/agents/parallel-client.ts). Run once; safe to re-run (get-or-create
 * by role, same as ensureAppWallet).
 *
 * Uses CIRCLE_LIVE_API_KEY/CIRCLE_LIVE_ENTITY_SECRET, not the sandbox
 * CIRCLE_API_KEY/CIRCLE_ENTITY_SECRET every other wallet in this app is
 * created with — Circle's sandbox entity can't create real mainnet wallets.
 * Also get-or-creates the wallet set rather than requiring it to already
 * exist, since this is the first wallet ever provisioned under the live
 * entity (the sandbox "SnapBack" wallet set doesn't carry over).
 *
 * Deliberately does not import lib/app-wallets.ts or lib/circle.ts: both
 * pull in `server-only`, which throws outside Next's bundler (see
 * scripts/circle-webhooks-setup.ts's docblock for why). Re-declares the
 * handful of calls it needs instead — same as provision-arbiter-wallet.ts.
 *
 * Usage: npx tsx scripts/provision-parallel-payer-wallet.ts
 */
import { createClient } from "@supabase/supabase-js";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const WALLET_SET_NAME = "SnapBack";
const BASE_BLOCKCHAIN = "BASE";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", "parallel_payer")
    .maybeSingle();
  if (existing) {
    console.log("parallel_payer wallet already provisioned:", existing.address);
    return;
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_LIVE_API_KEY!,
    entitySecret: process.env.CIRCLE_LIVE_ENTITY_SECRET!,
  });

  const walletSets = await client.listWalletSets();
  let walletSetId = walletSets.data?.walletSets?.find(
    (ws) => (ws as { name?: string }).name === WALLET_SET_NAME,
  )?.id;
  if (!walletSetId) {
    const created = await client.createWalletSet({ name: WALLET_SET_NAME });
    walletSetId = created.data?.walletSet?.id;
    if (!walletSetId) throw new Error("Failed to create live wallet set");
    console.log(`Created live wallet set "${WALLET_SET_NAME}" (${walletSetId})`);
  }

  const res = await client.createWallets({
    walletSetId,
    blockchains: [BASE_BLOCKCHAIN],
    accountType: "EOA",
    count: 1,
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error("Circle did not return an EOA wallet for parallel_payer");
  }

  const { data, error } = await supabase
    .from("app_wallets")
    .insert({
      role: "parallel_payer",
      circle_wallet_id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? BASE_BLOCKCHAIN,
      account_type: wallet.accountType ?? "EOA",
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to persist parallel_payer wallet: ${error?.message}`);
  }

  console.log("Provisioned parallel_payer wallet:", data.address, `(circle_wallet_id=${data.circle_wallet_id})`);
  console.log("Fund this address on BASE MAINNET with a small amount of ETH (gas, if ever needed) and USDC before live-testing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

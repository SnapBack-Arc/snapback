/**
 * One-shot provisioning for the priority fix: force-resolve didn't actually
 * resolve on-chain because SnapBackEscrow.arbiter pointed at JudgeRegistry,
 * which nothing calls (zero staked judges, finalize() gated by a local
 * Foundry keystore this app doesn't hold).
 *
 * Creates (or reuses) the singleton `arbiter` app wallet — a Circle-managed
 * EOA, same shape as delegate/treasury — and persists it to `app_wallets`.
 * Run once; safe to re-run (get-or-create by role, same as ensureAppWallet).
 *
 * Deliberately does not import lib/app-wallets.ts or lib/circle.ts: both
 * pull in `server-only`, which throws outside Next's bundler (see
 * scripts/circle-webhooks-setup.ts's docblock for why). Re-declares the
 * handful of calls it needs instead.
 *
 * Usage: npx tsx scripts/provision-arbiter-wallet.ts
 */
import { createClient } from "@supabase/supabase-js";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { CIRCLE_ARC_BLOCKCHAIN } from "../src/lib/arc";

const WALLET_SET_NAME = "SnapBack";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", "arbiter")
    .maybeSingle();
  if (existing) {
    console.log("arbiter wallet already provisioned:", existing.address);
    return;
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY!,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
  });

  const walletSets = await client.listWalletSets();
  const walletSetId = walletSets.data?.walletSets?.find(
    (ws) => (ws as { name?: string }).name === WALLET_SET_NAME,
  )?.id;
  if (!walletSetId) throw new Error(`Wallet set "${WALLET_SET_NAME}" not found`);

  const res = await client.createWallets({
    walletSetId,
    blockchains: [CIRCLE_ARC_BLOCKCHAIN],
    accountType: "EOA",
    count: 1,
  });
  const wallet = res.data?.wallets?.[0];
  if (!wallet?.id || !wallet.address) {
    throw new Error("Circle did not return an EOA wallet for arbiter");
  }

  const { data, error } = await supabase
    .from("app_wallets")
    .insert({
      role: "arbiter",
      circle_wallet_id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain ?? CIRCLE_ARC_BLOCKCHAIN,
      account_type: wallet.accountType ?? "EOA",
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to persist arbiter wallet: ${error?.message}`);
  }

  console.log("Provisioned arbiter wallet:", data.address, `(circle_wallet_id=${data.circle_wallet_id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

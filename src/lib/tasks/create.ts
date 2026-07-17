import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { creditSessionToTask } from "@/lib/estimator/service";
import {
  createEscrowJob,
  setJobBudget,
  lockFunds,
  waitForTxHash,
  getJobIdFromTxHash,
  SNAPBACK_ESCROW,
} from "@/lib/escrow";

/**
 * Buyer commissions a task from an accepted Marketplace listing: creates the
 * `tasks` row, credits the Estimator's quote-phase escrow toward it, then
 * creates and funds the matching ERC-8183 job on-chain.
 *
 * This is the flow every other piece of SnapBack assumes exists (the
 * Estimator's `creditSessionToTask`, the validator's `tasks.metadata.
 * erc8183_job_id` lookup) but that nothing wired end-to-end before now.
 *
 * IMPORTANT — two things outside this code currently block the on-chain
 * steps from succeeding against the live testnet deployment:
 *   1. SnapBackEscrow must declare ERC-165 support for IACPHook (fixed in
 *      contracts/src/SnapBackEscrow.sol, but the deployed contract needs to
 *      be redeployed for the fix to take effect on-chain).
 *   2. Even after redeploying, the new SnapBackEscrow address must be
 *      whitelisted as a hook by AgenticCommerce's ADMIN_ROLE holder — a
 *      separate, shared contract this project does not administer.
 * See the redeploy/whitelist note surfaced alongside this feature.
 */

const DEFAULT_JOB_EXPIRY_DAYS = 7;

export type CreateTaskParams = {
  buyerWalletId: string;
  estimatorSessionId: string;
  listingId: string;
  title: string;
  description?: string;
  policyId?: string | null;
};

export type CreateTaskResult = {
  task_id: string;
  job_id: string;
  amount_usdc: number;
};

export async function createAndFundTask(
  params: CreateTaskParams,
): Promise<CreateTaskResult> {
  const supabase = createServiceSupabase();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", params.listingId)
    .eq("active", true)
    .single();
  if (!listing) throw new Error("Listing not found or inactive");
  if (listing.price_usdc === null) throw new Error("Listing has no price set");

  const { data: buyerWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", params.buyerWalletId)
    .single();
  if (!buyerWallet) throw new Error("Buyer wallet not found");

  const { data: sellerWallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", listing.seller_wallet_id)
    .single();
  if (!sellerWallet) throw new Error("Seller wallet not found");

  const amountUsdc = String(listing.price_usdc);

  // 1. Task row — amount_usdc is the seller's quoted amount. The fee-inclusive
  //    guaranteed_total_usdc/disclosed_contingent_fee_pct land on it next.
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      payer_wallet_id: params.buyerWalletId,
      payee_wallet_id: listing.seller_wallet_id,
      listing_id: listing.id,
      policy_id: params.policyId ?? null,
      title: params.title,
      description: params.description ?? null,
      status: "assigned",
      amount_usdc: listing.price_usdc,
    })
    .select()
    .single();
  if (taskError || !task) {
    throw new Error(`Failed to create task: ${taskError?.message}`);
  }

  // 2. Credit the Estimator's quote-phase escrow + write the fee-inclusive
  //    figures onto the task. Seller still gets `amountUsdc` in full — the
  //    happy-path skim is charged separately, to Treasury, in that call.
  await creditSessionToTask(params.estimatorSessionId, task.id);

  // 3. Create the ERC-8183 job. `evaluator` MUST be SnapBackEscrow itself,
  //    not the buyer — AgenticCommerce.complete()/reject() are gated to
  //    `msg.sender == job.evaluator`, and SnapBackEscrow calls those directly
  //    as its own contract identity (verified against the live contract
  //    source; this is not documented anywhere in this repo).
  const expiredAt = Math.floor(Date.now() / 1000) + DEFAULT_JOB_EXPIRY_DAYS * 86_400;
  const createTxId = await createEscrowJob({
    buyerCircleWalletId: buyerWallet.circle_wallet_id,
    sellerAddress: sellerWallet.address as Address,
    evaluatorAddress: SNAPBACK_ESCROW,
    expiredAt,
    description: params.title,
  });
  if (!createTxId) throw new Error("createJob transaction did not return an id");

  const createTxHash = await waitForTxHash(createTxId);
  const jobId = await getJobIdFromTxHash(createTxHash);

  await supabase
    .from("tasks")
    .update({
      metadata: { ...((task.metadata as Record<string, unknown>) ?? {}), erc8183_job_id: jobId },
    })
    .eq("id", task.id);

  // 4. Seller sets the budget — setBudget is gated to job.provider on-chain.
  //    Must confirm before the buyer funds: unlike the approve→fund pair
  //    below (same wallet, nonce-ordered), this and the next step are
  //    different wallets, so only an explicit wait prevents fund() from
  //    landing first and escrowing a zero budget.
  const setBudgetTxId = await setJobBudget(sellerWallet.circle_wallet_id, jobId, amountUsdc);
  if (!setBudgetTxId) throw new Error("setBudget transaction did not return an id");
  await waitForTxHash(setBudgetTxId);

  // 5. Buyer locks funds: approve then fund, both from the buyer wallet.
  await lockFunds(buyerWallet.circle_wallet_id, jobId, amountUsdc);

  await supabase.from("tasks").update({ status: "in_progress" }).eq("id", task.id);

  return { task_id: task.id, job_id: jobId, amount_usdc: Number(listing.price_usdc) };
}

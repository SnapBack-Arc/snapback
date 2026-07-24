import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { creditSessionToTask } from "@/lib/estimator/service";
import { ARC_CHAIN_ID } from "@/lib/arc";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { estimateResearchSourcingCostUsdc } from "@/lib/agents/research-sourcing-pricing";
import { isWalletFlagged } from "@/lib/wallet-flags";
import {
  createEscrowJob,
  setJobBudget,
  lockFunds,
  waitForTxHash,
  getJobIdFromTxHash,
} from "@/lib/escrow";

/**
 * Buyer commissions a task from an accepted Marketplace listing: creates the
 * `tasks` row, credits the Estimator's quote-phase escrow toward it, then
 * creates and funds the matching job directly on SnapBackEscrow.
 *
 * This is the flow every other piece of SnapBack assumes exists (the
 * Estimator's `creditSessionToTask`, the validator's `tasks.metadata.
 * erc8183_job_id` lookup) but that nothing wired end-to-end before now.
 *
 * This used to create the job on AgenticCommerce with SnapBackEscrow as an
 * ERC-8183 hook — every real call reverted with HookNotWhitelisted(),
 * verified on-chain to be gated by a third-party admin role this project
 * doesn't control, with no documented self-service whitelisting path.
 * SnapBackEscrow is now standalone (contracts/src/SnapBackEscrow.sol): the
 * job is created directly on it, no external job-settlement contract or
 * "evaluator" role is involved.
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
  if (await isWalletFlagged(params.buyerWalletId)) {
    throw new Error("This account is paused by an administrator and can't fund new tasks.");
  }

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

  // Research & Sourcing's listing price is a real, dynamically-computed
  // amount (see research-sourcing-pricing.ts) driven by this task's own
  // difficulty/scope_quantity, not the listing's static seed price — a
  // small, easy request and a large, complex one genuinely cost different
  // amounts to actually run. Every other listing is simulated inventory
  // with no execution behind it, so its static price_usdc is used as-is.
  let priceUsdc = Number(listing.price_usdc);
  if (isResearchSourcingListing(listing.sla)) {
    const { data: session } = await supabase
      .from("estimator_sessions")
      .select("difficulty, scope_quantity")
      .eq("id", params.estimatorSessionId)
      .single();
    if (!session) {
      throw new Error("Estimator session not found for Research & Sourcing pricing");
    }
    priceUsdc = estimateResearchSourcingCostUsdc(session.difficulty, session.scope_quantity);
  }
  const amountUsdc = String(priceUsdc);

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
      amount_usdc: priceUsdc,
    })
    .select()
    .single();
  if (taskError || !task) {
    throw new Error(`Failed to create task: ${taskError?.message}`);
  }

  // 2. Credit the Estimator's quote-phase escrow + write the fee-inclusive
  //    figures onto the task. Seller still gets `amountUsdc` in full — the
  //    happy-path fee, validation fee, and dispute contingency are collected
  //    for real from the buyer's own wallet in that call (Phase 4).
  await creditSessionToTask(params.estimatorSessionId, task.id, buyerWallet.circle_wallet_id);

  // 3. Create the job directly on SnapBackEscrow.
  const expiredAt = Math.floor(Date.now() / 1000) + DEFAULT_JOB_EXPIRY_DAYS * 86_400;
  const createTxId = await createEscrowJob({
    buyerCircleWalletId: buyerWallet.circle_wallet_id,
    sellerAddress: sellerWallet.address as Address,
    expiredAt,
    description: params.title,
  });
  if (!createTxId) throw new Error("createJob transaction did not return an id");

  const createTxHash = await waitForTxHash(createTxId);
  const jobId = await getJobIdFromTxHash(createTxHash);

  await supabase
    .from("tasks")
    .update({
      metadata: {
        ...((task.metadata as Record<string, unknown>) ?? {}),
        erc8183_job_id: jobId,
        // Free — already computed above for the createJob call itself. Lets
        // the task detail page show "refund available after [date]" and gate
        // the claimExpired button without a live on-chain read on every
        // load (lib/tasks/claim-expired.ts, getJobExpiredAt fallback).
        escrow_expired_at: expiredAt,
      },
    })
    .eq("id", task.id);

  // 4. Seller sets the budget — setBudget is gated to job.provider on-chain.
  //    Must confirm before the buyer funds, same reason lockFunds itself now
  //    waits between its own approve and fund calls: Circle estimates gas
  //    for the next call at submission time, against whatever's already
  //    mined — an unconfirmed prior step reads as if it never happened.
  const setBudgetTxId = await setJobBudget(sellerWallet.circle_wallet_id, jobId, amountUsdc);
  if (!setBudgetTxId) throw new Error("setBudget transaction did not return an id");
  await waitForTxHash(setBudgetTxId);

  // 5. Buyer locks funds: approve then fund, both from the buyer wallet.
  const { fundId } = await lockFunds(buyerWallet.circle_wallet_id, jobId, amountUsdc);

  // Record the lock itself — nothing else in this flow writes a payments row
  // for the escrow lock, so without this the task detail page would have no
  // Arcscan-linkable record of it ever happening.
  const fundTxHash = fundId ? await waitForTxHash(fundId) : null;
  await supabase.from("payments").insert({
    task_id: task.id,
    from_wallet_id: params.buyerWalletId,
    kind: "escrow",
    status: "escrowed",
    amount_usdc: priceUsdc,
    tx_hash: fundTxHash,
    chain_id: ARC_CHAIN_ID,
    metadata: { erc8183_job_id: jobId, reason: "task_funding_lock" },
  });

  await supabase.from("tasks").update({ status: "in_progress" }).eq("id", task.id);

  return { task_id: task.id, job_id: jobId, amount_usdc: priceUsdc };
}

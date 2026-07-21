import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ensureTreasuryWallet, ensureArbiterWallet } from "@/lib/app-wallets";
import { generateEducationalFeedback } from "@/lib/disputes/feedback";
import { ARC_CHAIN_ID } from "@/lib/arc";
import { resolveJobDispute, transferUsdc, waitForTxHash } from "@/lib/escrow";
import type { Database } from "@/lib/supabase/types";

/**
 * Buyer dispute-abuse tracking.
 *
 * PRIORITY FIX: a filing fee only ever applies to a buyer *choosing* to
 * contest something — today that's exactly one path,
 * filePostApprovalContest in lib/disputes/contest.ts. A standard dispute
 * (dispute_kind: "standard") is always system auto-filed — the validator
 * rejecting a bad delivery, not a buyer decision — see validator-service.ts's
 * only call site. It never carries a fee at all, so nothing in this module
 * computes one for it; recordDisputeFiling below is simply never called on
 * that path. See computeContestFee for the contest-only fee formula: a flat
 * 50% of the task's initial quote, no per-buyer escalation.
 *
 * Every resolved dispute (either kind) still settles whatever fee it did
 * collect — forfeited to Treasury on a loss, refunded on a win — and updates
 * the buyer's rolling win/loss record. Separately, a buyer whose loss rate
 * over their last N resolved disputes crosses a harder threshold gets
 * flagged for tighter validator scrutiny on future tasks — that flag is
 * unrelated to any fee and applies across both dispute kinds.
 */

type StatsRow = Database["public"]["Tables"]["buyer_dispute_stats"]["Row"];

export function disputeLookbackN(): number {
  return Number(process.env.DISPUTE_ABUSE_LOOKBACK_N ?? "5");
}

/** A harder threshold — crossing this flags the buyer for tighter validator scrutiny. */
export function hardAbuseLossRateThreshold(): number {
  return Number(process.env.DISPUTE_HARD_ABUSE_LOSS_RATE ?? "0.8");
}

async function getOrCreateStats(walletId: string): Promise<StatsRow> {
  const supabase = createServiceSupabase();
  const { data: existing } = await supabase
    .from("buyer_dispute_stats")
    .select("*")
    .eq("wallet_id", walletId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("buyer_dispute_stats")
    .insert({ wallet_id: walletId })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create buyer_dispute_stats: ${error?.message}`);
  }
  return data;
}

/** Loss rate over the buyer's last N *resolved* disputes (any kind). */
async function recentLossRate(
  walletId: string,
  n: number,
): Promise<{ loss_rate: number; sample_size: number }> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("disputes")
    .select("outcome")
    .eq("opened_by_wallet", walletId)
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(n);

  const sample = data ?? [];
  const losses = sample.filter((d) => d.outcome === "favor_payee").length;
  return {
    loss_rate: sample.length ? losses / sample.length : 0,
    sample_size: sample.length,
  };
}

/** Flat share of the task's initial quote charged as a contest filing fee — no escalation, no per-buyer state. */
export const CONTEST_FEE_PCT = 0.5;

/**
 * Contest filing fee: a flat deterrent against contesting lightly, not a
 * risk-priced charge — 50% of the task's initial quote (guaranteed_total_usdc,
 * the fee-inclusive figure the buyer actually saw at quote time), refunded in
 * full on a win, kept as Treasury revenue only on a loss. Applies only to
 * filePostApprovalContest (lib/disputes/contest.ts) — the one path where a
 * buyer is actively choosing to contest a result, as opposed to the system
 * auto-filing on a validator rejection, which never charges anything.
 */
export function computeContestFee(guaranteedTotalUsdc: number): number {
  return Number((guaranteedTotalUsdc * CONTEST_FEE_PCT).toFixed(6));
}

export async function isFlaggedForScrutiny(walletId: string): Promise<boolean> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("buyer_dispute_stats")
    .select("scrutiny_flagged")
    .eq("wallet_id", walletId)
    .maybeSingle();
  return data?.scrutiny_flagged ?? false;
}

/**
 * Records the filing fee for a newly-opened dispute and bumps the buyer's
 * filed counter. Call this at the same time the `disputes` row is inserted.
 *
 * This is a real Circle transfer, buyer -> Treasury, collected upfront at
 * filing time — not just a ledger row. The transfer must confirm before any
 * row is written: a fee that failed to actually collect shouldn't look like
 * it was collected. If it fails, this throws and the caller's dispute filing
 * fails with it, same as any other funding step in this app.
 */
export async function recordDisputeFiling(params: {
  disputeId: string;
  walletId: string;
  buyerCircleWalletId: string;
  amountUsdc: number;
}): Promise<void> {
  const supabase = createServiceSupabase();
  const stats = await getOrCreateStats(params.walletId);

  const treasury = await ensureTreasuryWallet();
  const collectTxId = await transferUsdc(
    params.buyerCircleWalletId,
    treasury.address as Address,
    String(params.amountUsdc),
  );
  if (!collectTxId) {
    throw new Error("Filing fee collection transfer did not return a transaction id");
  }
  const collectTxHash = await waitForTxHash(collectTxId);

  const { data: payment } = await supabase
    .from("payments")
    .insert({
      from_wallet_id: params.walletId,
      kind: "filing_fee",
      status: "escrowed",
      amount_usdc: params.amountUsdc,
      tx_hash: collectTxHash,
      chain_id: ARC_CHAIN_ID,
      metadata: { dispute_id: params.disputeId },
    })
    .select("id")
    .single();

  await supabase
    .from("disputes")
    .update({
      filing_fee_usdc: params.amountUsdc,
      filing_fee_payment_id: payment?.id ?? null,
    })
    .eq("id", params.disputeId);

  await supabase
    .from("buyer_dispute_stats")
    .update({ disputes_filed: stats.disputes_filed + 1 })
    .eq("wallet_id", params.walletId);
}

/**
 * Resolves a dispute: settles the filing fee (forfeit on a loss, refund on a
 * win) and updates the buyer's win/loss record and scrutiny flag.
 *
 * `favor_payer` = buyer wins (refund); `favor_payee` = buyer loses (seller
 * keeps the payment, filing fee forfeited).
 *
 * PRIORITY FIX: a `standard` dispute means the job is frozen on-chain
 * (SnapBackEscrow.dispute() set `disputed = true`) — settling it here means
 * actually calling SnapBackEscrow.resolveDispute(jobId, favorBuyer, reason)
 * as the contract's `arbiter`, not just flipping this row. That call is made
 * first and must succeed (its tx must confirm, not just submit) before any
 * off-chain row changes below: a call that reverts throws out of this
 * function entirely, leaving the dispute `open` rather than recording a
 * "resolved" outcome the chain never actually applied — which is exactly the
 * bug this fixes (force-resolve used to only ever touch this table, so the
 * on-chain job stayed frozen and funds never moved). `post_approval_contest`
 * disputes never froze anything on-chain (the seller was already paid,
 * auto-approved) — a buyer win there is settled from Treasury's insurance
 * pool by settleContestWin below, not the escrow contract, so no on-chain
 * call happens for that kind.
 */
export async function resolveDispute(
  disputeId: string,
  outcome: "favor_payer" | "favor_payee",
): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: dispute } = await supabase
    .from("disputes")
    .select("*")
    .eq("id", disputeId)
    .single();
  if (!dispute) throw new Error("Dispute not found");
  if (dispute.status === "resolved") throw new Error("Dispute already resolved");

  const buyerWon = outcome === "favor_payer";
  const walletId = dispute.opened_by_wallet;

  if (dispute.dispute_kind !== "post_approval_contest") {
    const { data: task } = await supabase
      .from("tasks")
      .select("metadata")
      .eq("id", dispute.task_id)
      .single();
    const jobId = (task?.metadata as { erc8183_job_id?: string } | null)?.erc8183_job_id;
    if (!jobId) {
      throw new Error(
        "Dispute's task has no on-chain job id (erc8183_job_id) — cannot force-resolve a job that was never created on-chain.",
      );
    }

    const arbiter = await ensureArbiterWallet();
    const reason =
      "0x" + Buffer.from("admin-force-resolve").toString("hex").padEnd(64, "0");
    const txId = await resolveJobDispute(arbiter.circle_wallet_id, jobId, buyerWon, reason);
    if (!txId) {
      throw new Error("resolveDispute did not return a transaction id");
    }
    // Rejects if the tx enters a terminal failure state (including a revert
    // that still produced a txHash) — see lib/escrow.ts's waitForTxHash.
    await waitForTxHash(txId);
  }

  // Both holdbacks below must fully settle — including a real refund
  // transfer on a win — BEFORE the dispute is marked "resolved". Same
  // reasoning as the on-chain call above: if a refund fails or reverts, the
  // dispute must stay in a recoverable, unresolved state rather than record
  // an outcome the money never actually caught up with.
  if (dispute.filing_fee_payment_id) {
    await refundOrReleaseHeldPayment({
      paymentId: dispute.filing_fee_payment_id,
      buyerWalletId: walletId,
      buyerWon,
      wonReason: "dispute_won_refunded",
      lostReason: "dispute_lost_forfeited",
    });
  }

  // Applies to both dispute kinds — the contingency is collected at
  // task-funding time regardless of whether a dispute ever happens, so its
  // settlement isn't tied to the on-chain job-resolution branch above.
  await settleDisputeContingency(dispute.task_id, walletId, buyerWon);

  await supabase
    .from("disputes")
    .update({
      status: "resolved",
      outcome,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  const stats = await getOrCreateStats(walletId);
  const consecutiveLosses = buyerWon ? 0 : stats.consecutive_losses + 1;

  // Recompute against the lookback window now that this dispute is resolved.
  const { loss_rate, sample_size } = await recentLossRate(walletId, disputeLookbackN());
  const hardAbuse =
    sample_size >= disputeLookbackN() && loss_rate >= hardAbuseLossRateThreshold();

  await supabase
    .from("buyer_dispute_stats")
    .update({
      disputes_won: stats.disputes_won + (buyerWon ? 1 : 0),
      disputes_lost: stats.disputes_lost + (buyerWon ? 0 : 1),
      consecutive_losses: consecutiveLosses,
      scrutiny_flagged: hardAbuse,
    })
    .eq("wallet_id", walletId);

  // Post-approval contests: the seller has already been paid, so a buyer win
  // is settled from the Treasury's dispute-insurance pool, never clawed back
  // from the seller. A loss needs no fund movement beyond the forfeited fee
  // above — the auto-approved payout simply stands.
  if (dispute.dispute_kind === "post_approval_contest" && buyerWon) {
    await settleContestWin(disputeId, dispute.task_id, walletId);
  }
}

/**
 * Settles a held (`status: "escrowed"`) payment that was collected upfront
 * and may need to go back to the buyer depending on the outcome — the
 * filing fee and the dispute-contingency holdback both follow this exact
 * lifecycle, so this is the one place that implements it.
 *
 * Buyer wins -> a real refund transfer, Treasury's wallet -> the buyer's
 * wallet. This is a genuinely new transfer, not just a ledger flip — the
 * money is sitting in Treasury's real wallet from collection time.
 *
 * Buyer loses -> no transfer needed at all. The money is already in
 * Treasury's wallet from collection time; "losing" just means it's
 * confirmed as kept revenue instead of a refundable holdback.
 *
 * Throws (does not silently no-op) if the buyer's wallet can't be found, or
 * the refund transfer fails to submit or fails to confirm — callers must not
 * treat the settlement as done, or mark anything "resolved", if this throws.
 * Safe to call twice: a payment that's already left "escrowed" is a no-op.
 */
async function refundOrReleaseHeldPayment(params: {
  paymentId: string;
  buyerWalletId: string;
  buyerWon: boolean;
  wonReason: string;
  lostReason: string;
}): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", params.paymentId)
    .single();
  if (!payment) throw new Error(`Held payment ${params.paymentId} not found`);
  if (payment.status !== "escrowed") return;

  if (!params.buyerWon) {
    await supabase
      .from("payments")
      .update({
        status: "released",
        metadata: {
          ...((payment.metadata as Record<string, unknown>) ?? {}),
          settled_reason: params.lostReason,
        },
      })
      .eq("id", payment.id);
    return;
  }

  const { data: buyerWallet } = await supabase
    .from("wallets")
    .select("address")
    .eq("id", params.buyerWalletId)
    .single();
  if (!buyerWallet) {
    throw new Error(
      `Buyer wallet ${params.buyerWalletId} not found — cannot refund held payment ${payment.id}`,
    );
  }

  const treasury = await ensureTreasuryWallet();
  const refundTxId = await transferUsdc(
    treasury.circle_wallet_id,
    buyerWallet.address as Address,
    String(payment.amount_usdc),
  );
  if (!refundTxId) {
    throw new Error(`Refund transfer for held payment ${payment.id} did not return a transaction id`);
  }
  // Rejects on a terminal failure state, including a revert that still
  // produced a txHash — see lib/escrow.ts's waitForTxHash.
  const refundTxHash = await waitForTxHash(refundTxId);

  await supabase
    .from("payments")
    .update({
      status: "refunded",
      tx_hash: refundTxHash,
      metadata: {
        ...((payment.metadata as Record<string, unknown>) ?? {}),
        collected_tx_hash: payment.tx_hash,
        settled_reason: params.wonReason,
      },
    })
    .eq("id", payment.id);
}

/**
 * Settles the ~2% dispute-contingency holdback (Phase 4) collected for real
 * at task-funding time (lib/estimator/service.ts's creditSessionToTask).
 *
 * No-op if this task never had a contingency payment (e.g. all task-level
 * fee rates configured to 0) or it's already been settled — safe to call
 * from both resolveDispute() and sweepUncontestedContingencies() below
 * without double-settling.
 */
async function settleDisputeContingency(
  taskId: string,
  buyerWalletId: string,
  buyerWon: boolean,
): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("task_id", taskId)
    .eq("kind", "dispute_contingency")
    .eq("status", "escrowed")
    .maybeSingle();
  if (!payment) return;

  await refundOrReleaseHeldPayment({
    paymentId: payment.id,
    buyerWalletId,
    buyerWon,
    wonReason: "dispute_won_refunded",
    lostReason: "dispute_lost_forfeited",
  });
}

function contestWindowHoursForSweep(): number {
  // Re-declared rather than imported from lib/disputes/contest.ts, which
  // itself imports from this file — importing the other way would create a
  // cycle. Same env var, same default.
  return Number(process.env.POST_APPROVAL_CONTEST_WINDOW_HOURS ?? "24");
}

/**
 * Refunds the dispute-contingency holdback for any of this buyer's tasks
 * that completed cleanly — auto-approved, no contest ever filed, and the
 * post-approval contest window has safely elapsed. There's no cron/keeper
 * anywhere in this app (same constraint documented throughout this
 * project), so this uses the same "check on the next natural touchpoint"
 * pattern already established for abandoned Estimator sessions — called
 * from submitQuoteRequest so it fires the next time this buyer does
 * anything, rather than never firing at all.
 */
export async function sweepUncontestedContingencies(buyerWalletId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const cutoff = new Date(Date.now() - contestWindowHoursForSweep() * 3_600_000).toISOString();

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id")
    .eq("payer_wallet_id", buyerWalletId)
    .eq("status", "accepted")
    .not("accepted_at", "is", null)
    .lt("accepted_at", cutoff);

  for (const task of tasks ?? []) {
    // settleDisputeContingency is itself a no-op if there's no
    // still-escrowed contingency row (e.g. a contest was filed and this
    // task already settled through resolveDispute instead).
    await settleDisputeContingency(task.id, buyerWalletId, true);
  }
}

/**
 * Buyer-won post-approval contest: pay the buyer out of the Treasury's
 * dispute-insurance pool (the seller's payout is untouched), then generate
 * educational feedback comparing the original spec against the delivery.
 */
async function settleContestWin(
  disputeId: string,
  taskId: string,
  buyerWalletId: string,
): Promise<void> {
  const supabase = createServiceSupabase();

  const { data: task } = await supabase.from("tasks").select("*, listings(*)").eq("id", taskId).single();
  if (!task) return;

  const payoutAmount = Number(task.amount_usdc ?? task.guaranteed_total_usdc ?? 0);
  if (payoutAmount > 0) {
    const treasury = await ensureTreasuryWallet();
    const { data: payment } = await supabase
      .from("payments")
      .insert({
        task_id: taskId,
        to_wallet_id: buyerWalletId,
        kind: "insurance_payout",
        status: "released",
        amount_usdc: payoutAmount,
        chain_id: ARC_CHAIN_ID,
        metadata: {
          dispute_id: disputeId,
          treasury_address: treasury.address,
          reason: "post_approval_contest_won",
        },
      })
      .select("id")
      .single();

    await supabase
      .from("disputes")
      .update({
        insurance_payout_usdc: payoutAmount,
        insurance_payout_payment_id: payment?.id ?? null,
      })
      .eq("id", disputeId);
  }

  const { data: validation } = await supabase
    .from("validations")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    const feedback = await generateEducationalFeedback({
      originalSpec: (task.metadata as { criteria?: unknown } | null)?.criteria ?? task.description,
      sellerSla: (task.listings as { sla: unknown } | null)?.sla ?? {},
      delivered: validation?.deliverable ?? null,
      validatorRationale: validation?.rationale ?? null,
    });
    await supabase
      .from("disputes")
      .update({ educational_feedback: feedback as never })
      .eq("id", disputeId);
  } catch {
    // Feedback is a value-add, not settlement-critical — the payout above
    // already completed. Leave educational_feedback null rather than fail
    // the resolution if the model call errors.
  }
}

import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ensureTreasuryWallet } from "@/lib/app-wallets";
import { generateEducationalFeedback } from "@/lib/disputes/feedback";
import { ARC_CHAIN_ID } from "@/lib/arc";
import type { Database } from "@/lib/supabase/types";

/**
 * Buyer dispute-abuse tracking.
 *
 * Every resolved dispute (standard, or later a post-approval contest) settles
 * a filing fee — forfeited to Treasury on a loss, refunded on a win — and
 * updates the buyer's rolling win/loss record. A buyer whose loss rate over
 * their last N resolved disputes crosses a threshold pays a scaled-up filing
 * fee on their next filing; crossing a harder threshold flags them for
 * tighter validator scrutiny on future tasks.
 */

type StatsRow = Database["public"]["Tables"]["buyer_dispute_stats"]["Row"];

export function disputeLookbackN(): number {
  return Number(process.env.DISPUTE_ABUSE_LOOKBACK_N ?? "5");
}

/** Loss rate over the lookback window at/above this scales up the *next* filing fee. */
export function feeEscalationLossRateThreshold(): number {
  return Number(process.env.DISPUTE_FEE_ESCALATION_LOSS_RATE ?? "0.6");
}

/** A harder threshold — crossing this flags the buyer for tighter validator scrutiny. */
export function hardAbuseLossRateThreshold(): number {
  return Number(process.env.DISPUTE_HARD_ABUSE_LOSS_RATE ?? "0.8");
}

export function baseFilingFeeUsdc(): number {
  return Number(process.env.DISPUTE_FILING_FEE_USDC ?? "2");
}

export function escalatedFeeMultiplier(): number {
  return Number(process.env.DISPUTE_ESCALATED_FEE_MULTIPLIER ?? "2.5");
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

export type FilingFeeQuote = {
  amount_usdc: number;
  escalated: boolean;
  loss_rate: number;
  sample_size: number;
};

/** Escalating filing fee: flat base fee, scaled up once the buyer's recent loss rate crosses the threshold. */
export async function computeFilingFee(walletId: string): Promise<FilingFeeQuote> {
  const n = disputeLookbackN();
  const { loss_rate, sample_size } = await recentLossRate(walletId, n);
  const escalated = sample_size >= n && loss_rate >= feeEscalationLossRateThreshold();
  const base = baseFilingFeeUsdc();
  return {
    amount_usdc: escalated
      ? Number((base * escalatedFeeMultiplier()).toFixed(6))
      : base,
    escalated,
    loss_rate,
    sample_size,
  };
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
 */
export async function recordDisputeFiling(params: {
  disputeId: string;
  walletId: string;
  amountUsdc: number;
}): Promise<void> {
  const supabase = createServiceSupabase();
  const stats = await getOrCreateStats(params.walletId);

  const { data: payment } = await supabase
    .from("payments")
    .insert({
      from_wallet_id: params.walletId,
      kind: "filing_fee",
      status: "escrowed",
      amount_usdc: params.amountUsdc,
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

  await supabase
    .from("disputes")
    .update({
      status: "resolved",
      outcome,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  const buyerWon = outcome === "favor_payer";
  const walletId = dispute.opened_by_wallet;

  if (dispute.filing_fee_payment_id) {
    await supabase
      .from("payments")
      .update({
        status: buyerWon ? "refunded" : "released",
        metadata: {
          dispute_id: disputeId,
          settled_reason: buyerWon ? "dispute_won_refunded" : "dispute_lost_forfeited",
        },
      })
      .eq("id", dispute.filing_fee_payment_id);
  }

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

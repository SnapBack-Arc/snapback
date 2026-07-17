import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createEscrowJob, setJobBudget, lockFunds } from "@/lib/escrow";
import { ARC_CHAIN_ID } from "@/lib/arc";
import type { Address } from "viem";

/**
 * x402 settlement, redirected into task escrow.
 *
 * Default x402 settles a payment authorization straight to the resource
 * server (here: the seller). SnapBack intercepts that step: settlement instead
 * creates + funds a job directly on the standalone SnapBackEscrow, so the
 * seller is never paid on authorization alone. Release requires validator
 * approval (release) or a judge verdict (resolveDispute).
 *
 * Scope: one escrow lock per task (not per-call metering). Quote-phase fees are
 * a separate concern — see lib/estimator (QuoteEscrow), untouched by this path.
 *
 * Note: unused anywhere in the app currently (grepped — no callers). Kept in
 * sync with lib/escrow.ts's interface anyway rather than left to bit-rot.
 */

export type SettlementResult = {
  taskId: string;
  jobTxId?: string;
  budgetTxId?: string;
  approveTxId?: string;
  fundTxId?: string;
};

/**
 * Settle an x402-authorized payment for a task into escrow.
 *
 * @param jobId Optional pre-created SnapBackEscrow jobId. When omitted the job is
 *        created here (jobId then arrives via the JobCreated event, so callers
 *        that need it immediately should create the job first and pass it in).
 */
export async function settleX402ToEscrow(params: {
  taskId: string;
  buyerWalletId: string;
  sellerAddress: Address;
  amountUsdc: string;
  expiredAt: number;
  description: string;
  jobId?: string;
}): Promise<SettlementResult> {
  const supabase = createServiceSupabase();
  const result: SettlementResult = { taskId: params.taskId };

  const jobId = params.jobId;
  if (!jobId) {
    result.jobTxId = await createEscrowJob({
      buyerCircleWalletId: params.buyerWalletId,
      sellerAddress: params.sellerAddress,
      expiredAt: params.expiredAt,
      description: params.description,
    });
  }

  if (jobId) {
    result.budgetTxId = await setJobBudget(params.buyerWalletId, jobId, params.amountUsdc);
    // THE LOCK — approve + fund. Funds land in SnapBackEscrow, not the seller.
    const { approveId, fundId } = await lockFunds(
      params.buyerWalletId,
      jobId,
      params.amountUsdc,
    );
    result.approveTxId = approveId;
    result.fundTxId = fundId;
  }

  // Ledger: an escrow lock, explicitly NOT a seller payment.
  await supabase.from("payments").insert({
    task_id: params.taskId,
    from_wallet_id: params.buyerWalletId,
    kind: "escrow",
    status: "escrowed",
    amount_usdc: Number(params.amountUsdc),
    chain_id: ARC_CHAIN_ID,
    circle_tx_id: result.fundTxId ?? null,
    metadata: {
      via: "x402",
      note: "x402 settlement redirected into a SnapBackEscrow job",
      job_id: jobId ?? null,
      seller: params.sellerAddress,
    },
  });

  await supabase
    .from("tasks")
    .update({ status: "in_progress", metadata: { erc8183_job_id: jobId ?? null } })
    .eq("id", params.taskId);

  return result;
}

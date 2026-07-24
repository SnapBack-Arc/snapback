import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { claimExpiredRefund, getJobExpiredAt } from "@/lib/escrow";
import { runPaymentRefundLeg, RefundFailedError } from "@/lib/disputes/settlement";

/**
 * Thrown when a buyer tries to claim before the on-chain expiry window has
 * actually elapsed — a clean 4xx at the route, not an on-chain attempt (the
 * contract would revert with NotExpired anyway, but there's no reason to
 * spend a real Circle call finding that out).
 */
export class TaskNotExpiredError extends Error {}

/**
 * Returns a task's on-chain escrow expiry (unix seconds), preferring the
 * value persisted at creation time (tasks/create.ts). Tasks created before
 * that persistence existed have no stored value — this falls back to a
 * live on-chain read (getJobExpiredAt, a cheap view call, no wallet/gas)
 * and self-heals by writing the result back to metadata so it's never
 * re-fetched on a future page load. Called only from the buyer-facing task
 * detail page, not the admin history page — nothing else needs this value.
 */
export async function resolveEscrowExpiredAt(
  taskId: string,
  metadata: Record<string, unknown>,
  jobId: string,
): Promise<number> {
  const existing = metadata.escrow_expired_at as number | undefined;
  if (existing !== undefined) return existing;

  const expiredAt = await getJobExpiredAt(jobId);
  const supabase = createServiceSupabase();
  await supabase
    .from("tasks")
    .update({ metadata: { ...metadata, escrow_expired_at: expiredAt } })
    .eq("id", taskId);
  return expiredAt;
}

/**
 * Buyer reclaims escrow for a task whose seller never submitted before
 * expiry (SnapBackEscrow.claimExpired) — the one real, currently-live gap
 * this closes: a funded task with no submission had a sound on-chain refund
 * guarantee but zero application-layer wiring (see README's Known
 * limitations). Retry-safe via the same CAS-claim + runPaymentRefundLeg
 * pattern as the sweep-path contingency refund
 * (refundOrReleaseHeldPayment, lib/disputes/service.ts) — state lives at
 * payments.metadata.refund_state on the task's own `escrow`-kind payment
 * row, no dispute row involved.
 *
 * Unlike the sweep path, this is a foreground buyer action: on exhausted
 * retries the payment is marked 'refund_failed' (durable, admin-visible)
 * but the error is RETHROWN rather than swallowed — the buyer clicked a
 * button and needs a real answer, not a silent background failure.
 */
export async function claimExpiredTaskRefund(
  taskId: string,
  buyerWalletId: string,
): Promise<{ tx_hash: string }> {
  const supabase = createServiceSupabase();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, payer_wallet_id, metadata")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.payer_wallet_id !== buyerWalletId) {
    throw new Error("Only the buyer who commissioned this task can claim its expired escrow");
  }

  const metadata = (task.metadata as Record<string, unknown> | null) ?? {};
  const jobId = metadata.erc8183_job_id as string | undefined;
  if (!jobId) {
    throw new Error(`Task ${taskId} has no on-chain job id — cannot claim an escrow that was never created on-chain`);
  }

  const expiredAtSec = metadata.escrow_expired_at as number | undefined;
  if (expiredAtSec !== undefined && Date.now() < expiredAtSec * 1000) {
    throw new TaskNotExpiredError(
      `This task's refund window isn't open yet — available after ${new Date(expiredAtSec * 1000).toISOString()}`,
    );
  }

  const { data: escrowPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("task_id", taskId)
    .eq("kind", "escrow")
    .eq("status", "escrowed")
    .maybeSingle();
  if (!escrowPayment) return { tx_hash: "" }; // already settled by some other path — safe to call twice, nothing to do

  const { data: claimed } = await supabase
    .from("payments")
    .update({ status: "refund_pending" })
    .eq("id", escrowPayment.id)
    .eq("status", "escrowed")
    .select("id")
    .maybeSingle();
  if (!claimed) return { tx_hash: "" }; // lost the race — another call already claimed or settled this refund

  const { data: buyerWallet } = await supabase
    .from("wallets")
    .select("circle_wallet_id")
    .eq("id", buyerWalletId)
    .single();
  if (!buyerWallet) {
    throw new Error(`Buyer wallet ${buyerWalletId} not found — cannot claim expired escrow for task ${taskId}`);
  }

  try {
    const txHash = await runPaymentRefundLeg(claimed.id, (idempotencyKey) =>
      claimExpiredRefund(buyerWallet.circle_wallet_id, jobId, idempotencyKey),
    );

    await supabase.from("payments").update({ status: "refunded", tx_hash: txHash }).eq("id", claimed.id);
    await supabase.from("tasks").update({ status: "cancelled" }).eq("id", taskId).neq("status", "cancelled");

    return { tx_hash: txHash };
  } catch (err) {
    if (err instanceof RefundFailedError) {
      await supabase.from("payments").update({ status: "refund_failed" }).eq("id", claimed.id);
    }
    throw err;
  }
}

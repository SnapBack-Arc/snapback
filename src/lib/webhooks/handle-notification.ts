import "server-only";
import type { Hex } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { decodeContractEvent } from "@/lib/webhooks/events";
import { SNAPBACK_ESCROW, JUDGE_REGISTRY } from "@/lib/escrow";

export type CircleNotificationEnvelope = {
  subscriptionId?: string;
  notificationId: string;
  notificationType: string;
  notification: Record<string, unknown>;
  timestamp?: string;
  version?: number;
};

/**
 * Dispatches one Circle webhook notification. Idempotent by notificationId
 * (Circle's delivery is at-least-once) via webhook_notifications_log: a
 * previously *processed* notificationId short-circuits immediately: a
 * previously *errored* or half-finished one is retried rather than silently
 * skipped forever.
 *
 * Two notification families matter here:
 *   - `contracts.eventLog` — decoded against SnapBackEscrow/JudgeRegistry's
 *     ABIs (lib/webhooks/events.ts) and used to advance task/payment state.
 *     This is the authoritative signal: it proves the specific on-chain
 *     action actually took effect, not just that some transaction didn't
 *     revert.
 *   - `transactions.*` — wallet-level tx status. Only correlated against
 *     payments rows that already carry a `circle_tx_id` (populated today by
 *     lib/x402.ts, the Gateway deposit route, and validator-service.ts's
 *     submitDeliverable() call via its `kind: 'submission'` payments row);
 *     used to catch failed transactions that would otherwise leave a payment
 *     silently stuck 'escrowed'/'pending' forever, and to backfill tx_hash.
 *     It is deliberately NOT used to drive business-logic state transitions —
 *     validator-service.ts's release()/dispute() calls still don't record a
 *     circle_tx_id anywhere, so there's nothing to correlate those against;
 *     the contracts.eventLog side covers them instead. (submitDeliverable()
 *     is different: it also awaits confirmation synchronously and throws —
 *     surfacing a submission failure immediately rather than only via this
 *     async webhook path — see validator-service.ts.)
 */
export async function handleCircleNotification(envelope: CircleNotificationEnvelope): Promise<void> {
  const supabase = createServiceSupabase();

  const { error: insertError } = await supabase.from("webhook_notifications_log").insert({
    notification_id: envelope.notificationId,
    notification_type: envelope.notificationType,
    status: "received",
  });

  if (insertError) {
    // Unique violation = we've seen this notificationId before. Only skip
    // if it already finished successfully — an 'error' or stuck 'received'
    // row means a prior attempt didn't complete, so let this retry through.
    const { data: existing } = await supabase
      .from("webhook_notifications_log")
      .select("status")
      .eq("notification_id", envelope.notificationId)
      .maybeSingle();
    if (existing?.status === "processed") return;
  }

  try {
    if (envelope.notificationType === "contracts.eventLog") {
      await handleContractEvent(envelope.notification);
    } else if (envelope.notificationType.startsWith("transactions.")) {
      await handleTransactionEvent(envelope.notification);
    }
    // Any other notificationType: nothing to do, but not an error either —
    // we ask Circle to restrict the subscription to these two families
    // (see scripts/circle-webhooks-setup.ts), so this is just defensive.

    await supabase
      .from("webhook_notifications_log")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("notification_id", envelope.notificationId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("webhook_notifications_log")
      .update({ status: "error", error: message })
      .eq("notification_id", envelope.notificationId);
    throw err; // surfaces as a 500 so Circle's own retry policy re-delivers
  }
}

async function handleContractEvent(notification: Record<string, unknown>): Promise<void> {
  const supabase = createServiceSupabase();

  const contractAddress = String(notification.contractAddress ?? "").toLowerCase();
  const topics = (notification.topics as string[] | undefined) ?? [];
  const data = (notification.data as string | undefined) ?? "0x";
  const txHash = (notification.txHash as string | undefined) ?? null;
  const blockHeight =
    typeof notification.blockHeight === "number" ? notification.blockHeight : null;

  const decoded = decodeContractEvent(topics as Hex[], data as Hex);
  if (!decoded) return; // an event this app doesn't recognize — nothing to do

  const contractName =
    contractAddress === SNAPBACK_ESCROW.toLowerCase()
      ? "SnapBackEscrow"
      : contractAddress === JUDGE_REGISTRY.toLowerCase()
        ? "JudgeRegistry"
        : "unknown";

  const { data: task } = await supabase
    .from("tasks")
    .select("id")
    .eq("metadata->>erc8183_job_id", decoded.jobId)
    .maybeSingle();

  await supabase.from("job_events").insert({
    task_id: task?.id ?? null,
    job_id: decoded.jobId,
    contract: contractName,
    event_name: decoded.eventName,
    tx_hash: txHash,
    block_height: blockHeight,
    payload: decoded.args as never,
  });

  if (!task) return; // no matching task (job wasn't created through this app) — nothing to reconcile

  switch (decoded.eventName) {
    case "Released":
    case "AutoReleased":
      await supabase
        .from("payments")
        .update({ status: "released" })
        .eq("task_id", task.id)
        .eq("kind", "escrow")
        .eq("status", "escrowed");
      break;
    case "SnappedBack":
      await supabase
        .from("payments")
        .update({ status: "snapped_back" })
        .eq("task_id", task.id)
        .eq("kind", "escrow")
        .eq("status", "escrowed");
      break;
    case "ExpiredClaimed":
      await supabase
        .from("payments")
        .update({ status: "refunded" })
        .eq("task_id", task.id)
        .eq("kind", "escrow")
        .eq("status", "escrowed");
      break;
    case "Disputed":
      await supabase
        .from("tasks")
        .update({ status: "disputed" })
        .eq("id", task.id)
        .neq("status", "disputed");
      break;
    case "DisputeResolved":
      // On-chain settlement moved funds already — reconcile the escrow
      // payment row the same way Released/SnappedBack do. NOTE: this does
      // NOT touch the `disputes` row (status/outcome) or buyer_dispute_stats
      // — those are only ever updated by the admin force-resolve route
      // (lib/disputes/service.ts:resolveDispute), since the real judge pool
      // has zero staked judges today and nothing else calls
      // SnapBackEscrow.resolveDispute yet. See README's "Event-driven state"
      // section for the known reconciliation gap this leaves.
      await supabase
        .from("payments")
        .update({ status: decoded.args.favorBuyer ? "refunded" : "released" })
        .eq("task_id", task.id)
        .eq("kind", "escrow")
        .eq("status", "escrowed");
      break;
    default:
      // Funded, Submitted, and every JudgeRegistry event
      // (PanelSelected/PanelEscalated/VoteCast/VerdictReached): observed via
      // the job_events row above only. JudgeRegistry's panel-draw path is
      // owner-gated by a local Foundry deployer key and the real judge pool
      // has zero staked judges — this webhook observes and reflects
      // on-chain state, it never calls selectPanel itself (confirmed
      // approach, see the Phase 3 audit).
      break;
  }
}

async function handleTransactionEvent(notification: Record<string, unknown>): Promise<void> {
  const circleTxId = notification.id as string | undefined;
  const state = notification.state as string | undefined;
  const txHash = notification.txHash as string | undefined;
  if (!circleTxId || !state) return;

  const supabase = createServiceSupabase();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, tx_hash")
    .eq("circle_tx_id", circleTxId)
    .maybeSingle();
  if (!payment) return; // not a transaction this app is tracking by circle_tx_id

  if (state === "FAILED" || state === "CANCELLED" || state === "DENIED") {
    if (payment.status !== "failed") {
      await supabase
        .from("payments")
        .update({ status: "failed", error: `Circle transaction ${state.toLowerCase()}` })
        .eq("id", payment.id);
    }
    return;
  }

  if (state === "COMPLETE" && !payment.tx_hash && txHash) {
    await supabase.from("payments").update({ tx_hash: txHash }).eq("id", payment.id);
  }
}

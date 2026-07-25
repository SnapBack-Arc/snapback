import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { runJudgePanel } from "@/lib/disputes/judge-panel";

/**
 * Evidence/rebuttal submission during an open dispute — symmetric for both
 * buyer and seller, on both dispute kinds (standard and post-approval
 * contest). This is pure additional context the judge panel weighs, not a
 * new automatic accept/reject rule, same as how the contest objection
 * (disputes.reason) already works.
 *
 * Why a window exists at all: before this, both filing paths (validator-
 * service.ts's auto-file, contest.ts's filePostApprovalContest) called
 * runJudgePanel synchronously in the same request as filing — zero gap for
 * either party to add anything before judges voted. There's no cron/keeper
 * anywhere in this app, so the only way to give both sides a real window is
 * to defer the panel invocation to the next natural touchpoint that
 * revisits the dispute — the task detail page, which TaskLiveUpdates
 * already polls every 6s while a dispute is open. See
 * maybeRunJudgePanelForDispute below.
 */

const MIN_EVIDENCE_LENGTH = 20;

export type EvidenceRole = "buyer" | "seller";

export type DisputeRebuttal = { text: string; submitted_at: string };
export type DisputeRebuttals = Partial<Record<EvidenceRole, DisputeRebuttal>>;

/** Env-configurable, mirrors POST_APPROVAL_CONTEST_WINDOW_HOURS's pattern. */
export function disputeEvidenceWindowMinutes(): number {
  return Number(process.env.DISPUTE_EVIDENCE_WINDOW_MINUTES ?? "30");
}

export function computeEvidenceWindowDeadline(): string {
  return new Date(Date.now() + disputeEvidenceWindowMinutes() * 60_000).toISOString();
}

/**
 * One immutable submission per party per dispute — mirrors the contest
 * objection's one-shot shape (dispute.reason is set once at filing time),
 * not a back-and-forth thread. Free: unlike filePostApprovalContest's fee,
 * this isn't a party choosing to escalate anything — it's supporting a
 * dispute/contest that's already real and already being reviewed, so a
 * second deterrent charge would be an odd double-charge unrelated to the
 * act of contesting itself.
 */
export async function submitDisputeEvidence(params: {
  disputeId: string;
  taskId: string;
  role: EvidenceRole;
  text: string;
}): Promise<void> {
  const trimmed = params.text.trim();
  if (trimmed.length < MIN_EVIDENCE_LENGTH) {
    throw new Error(`Evidence must be at least ${MIN_EVIDENCE_LENGTH} characters`);
  }

  const supabase = createServiceSupabase();
  const { data: dispute } = await supabase
    .from("disputes")
    .select("id, task_id, status, evidence, evidence_window_deadline")
    .eq("id", params.disputeId)
    .maybeSingle();
  if (!dispute) throw new Error("Dispute not found");
  if (dispute.task_id !== params.taskId) throw new Error("Dispute does not belong to this task");

  // Genuinely open only: status='open' AND (no deadline yet elapsed). A
  // dispute already claimed for voting, or resolved, rejects rather than
  // silently accepting — evidence submitted after resolution must not look
  // like it was ever weighed.
  if (dispute.status !== "open") {
    throw new Error("This dispute is no longer open for evidence submission");
  }
  if (
    dispute.evidence_window_deadline &&
    Date.now() > new Date(dispute.evidence_window_deadline).getTime()
  ) {
    throw new Error("The evidence submission window for this dispute has closed");
  }

  const evidence = (dispute.evidence as Record<string, unknown>) ?? {};
  const rebuttals = (evidence.rebuttals as DisputeRebuttals) ?? {};
  if (rebuttals[params.role]) {
    throw new Error(
      `${params.role === "buyer" ? "Buyer" : "Seller"} evidence has already been submitted for this dispute`,
    );
  }

  const { error } = await supabase
    .from("disputes")
    .update({
      evidence: {
        ...evidence,
        rebuttals: {
          ...rebuttals,
          [params.role]: { text: trimmed, submitted_at: new Date().toISOString() },
        },
      } as never,
    })
    .eq("id", params.disputeId)
    .eq("status", "open");
  if (error) throw new Error(`Failed to record evidence: ${error.message}`);
}

/**
 * Opportunistically invoked from the task detail page's data load (the only
 * touchpoint that reliably revisits an open dispute -- see this file's
 * docblock). No-op unless the dispute is still 'open' and its evidence
 * window has genuinely elapsed.
 *
 * The atomic `status='open' -> 'voting'` claim below is the concurrency
 * guard: two overlapping page loads (or a request landing mid-poll) can't
 * both invoke the panel for the same dispute -- only whichever call's
 * UPDATE actually matches a still-'open' row proceeds, the same
 * escrowed -> refund_pending CAS pattern already used in
 * lib/disputes/service.ts's settleHeldPaymentSafely/refundOrReleaseHeldPayment.
 * runJudgePanel itself still sets status='voting' again once it starts --
 * redundant with the claim, but harmless (same value), and keeps
 * runJudgePanel correct if it's ever invoked directly again.
 */
export async function maybeRunJudgePanelForDispute(disputeId: string): Promise<void> {
  const supabase = createServiceSupabase();
  const { data: dispute } = await supabase
    .from("disputes")
    .select("status, evidence_window_deadline")
    .eq("id", disputeId)
    .maybeSingle();
  if (!dispute || dispute.status !== "open" || !dispute.evidence_window_deadline) return;
  if (Date.now() < new Date(dispute.evidence_window_deadline).getTime()) return;

  const { data: claimed } = await supabase
    .from("disputes")
    .update({ status: "voting" })
    .eq("id", disputeId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (!claimed) return; // lost the race, or another request already claimed it

  await runJudgePanel(disputeId);
}

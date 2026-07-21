import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { computeContestFee, recordDisputeFiling } from "@/lib/disputes/service";
import { runJudgePanel } from "@/lib/disputes/judge-panel";
import { isWalletFlagged } from "@/lib/wallet-flags";

/**
 * Post-approval contest filing.
 *
 * Distinct from a standard dispute: the validator already auto-approved the
 * task (seller already paid), so this reuses the same disputes/judge_votes
 * records and the same real judge panel (lib/disputes/judge-panel.ts),
 * tagged `dispute_kind = 'post_approval_contest'` so resolution knows to
 * settle from the Treasury's insurance pool rather than expecting an
 * on-chain escrow reversal.
 *
 * This is the one place in the app a buyer actively chooses to contest a
 * result (as opposed to a standard dispute, always system auto-filed on a
 * validator rejection — see validator-service.ts) — which is exactly why
 * it's the only path that charges computeContestFee at all.
 */

/** Contest window after auto-approve — matches the existing accept window by default. */
export function contestWindowHours(): number {
  return Number(process.env.POST_APPROVAL_CONTEST_WINDOW_HOURS ?? "24");
}

export type ContestFilingResult = {
  dispute_id: string;
  fee_usdc: number;
};

export async function filePostApprovalContest(
  taskId: string,
  buyerWalletId: string,
  reason: string,
): Promise<ContestFilingResult> {
  if (await isWalletFlagged(buyerWalletId)) {
    throw new Error("This account is paused by an administrator and can't file contests.");
  }

  const supabase = createServiceSupabase();

  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).single();
  if (!task) throw new Error("Task not found");
  if (task.payer_wallet_id !== buyerWalletId) {
    throw new Error("Only the buyer who commissioned this task can file a contest");
  }
  if (task.status !== "accepted") {
    throw new Error("Only an auto-approved task can be contested");
  }
  if (!task.accepted_at) {
    throw new Error("Task has no acceptance timestamp");
  }

  const deadline = new Date(task.accepted_at);
  deadline.setHours(deadline.getHours() + contestWindowHours());
  if (Date.now() > deadline.getTime()) {
    throw new Error("The post-approval contest window has closed");
  }

  const { data: existing } = await supabase
    .from("disputes")
    .select("id")
    .eq("task_id", taskId)
    .eq("dispute_kind", "post_approval_contest")
    .maybeSingle();
  if (existing) {
    throw new Error("A post-approval contest has already been filed for this task");
  }

  // Judges review the validator's own reasoning/pass criteria alongside the
  // task spec, seller SLA, and delivered payload — snapshot it at filing time.
  const { data: validation } = await supabase
    .from("validations")
    .select("*")
    .eq("task_id", taskId)
    .eq("outcome", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: disputeRow, error } = await supabase
    .from("disputes")
    .insert({
      task_id: taskId,
      opened_by_wallet: buyerWalletId,
      status: "open",
      dispute_kind: "post_approval_contest",
      reason,
      evidence: { contest_reason: reason } as never,
      validator_reasoning_snapshot: validation
        ? ({
            rationale: validation.rationale,
            policy_pass: validation.policy_pass,
            task_pass: validation.task_pass,
            sla_pass: validation.sla_pass,
            failures: validation.failures,
          } as never)
        : null,
    })
    .select("id")
    .single();
  if (error || !disputeRow) {
    throw new Error(`Failed to file contest: ${error?.message}`);
  }

  await supabase.from("tasks").update({ status: "disputed" }).eq("id", taskId);

  const { data: buyerWallet } = await supabase
    .from("wallets")
    .select("circle_wallet_id")
    .eq("id", buyerWalletId)
    .single();
  if (!buyerWallet) throw new Error("Buyer has no wallet on file — cannot collect the contest filing fee");

  // Flat 50% of the task's initial quote — a deterrent against contesting
  // lightly, not a risk-priced charge. See computeContestFee's docblock.
  const feeUsdc = computeContestFee(Number(task.guaranteed_total_usdc ?? 0));
  await recordDisputeFiling({
    disputeId: disputeRow.id,
    walletId: buyerWalletId,
    buyerCircleWalletId: buyerWallet.circle_wallet_id,
    amountUsdc: feeUsdc,
  });

  // Real AI judge panel -- the default resolution path. Synchronous, same
  // as the standard-dispute call site in validator-service.ts; left to
  // throw rather than swallowed, since resolving this contest is the point.
  await runJudgePanel(disputeRow.id);

  return { dispute_id: disputeRow.id, fee_usdc: feeUsdc };
}

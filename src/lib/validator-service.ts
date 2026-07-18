import "server-only";
import { keccak256, stringToHex } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { validateDelivery, type StandingPolicy } from "@/lib/validator";
import {
  escrowAction,
  getJobStatus,
  submitDeliverable,
  waitForTxHash,
  JOB_STATUS,
} from "@/lib/escrow";
import { ARC_CHAIN_ID } from "@/lib/arc";
import {
  computeFilingFee,
  isFlaggedForScrutiny,
  recordDisputeFiling,
} from "@/lib/disputes/service";
import { generateRejectionFeedback } from "@/lib/disputes/feedback";

/**
 * Runs the buyer-agent validator for a delivered task and acts on the outcome:
 *   pass → auto-approve (release escrow to the seller)
 *   fail → auto-file a dispute (freezes escrow; judges are drawn separately)
 *
 * No human is involved here. Person review only enters later, if the dispute
 * escalates to judges.
 */
export async function runValidation(taskId: string, deliverable: unknown) {
  const supabase = createServiceSupabase();

  const { data: task, error } = await supabase
    .from("tasks")
    .select("*, policies(*), listings(*)")
    .eq("id", taskId)
    .single();
  if (error || !task) throw new Error(`Task not found: ${error?.message}`);

  const jobId = (task.metadata as { erc8183_job_id?: string } | null)?.erc8183_job_id;
  const policyRow = task.policies as { accuracy_tolerance: number | null } | null;

  // NOTE: max_amount_usdc / auto_release_hours are a spend cap and a timing
  // parameter, not delivery-quality dimensions — they don't belong in the
  // SLA-narrowed criteria set (see lib/validator.ts). Budget-ceiling admission
  // control belongs at escrow-funding time, upstream of this validator.
  const policy: StandingPolicy = {
    accuracy_tolerance: policyRow?.accuracy_tolerance ?? null,
  };

  const listing = task.listings as { sla: unknown } | null;
  const buyerWalletId = task.payer_wallet_id as string;
  const sellerWalletId = task.payee_wallet_id as string;

  // escrowAction below talks to Circle's API, which needs Circle's own wallet
  // id — NOT this row's internal `wallets.id` PK used everywhere else here
  // for DB references (opened_by_wallet, buyer_dispute_stats, ...).
  const { data: buyerWallet } = await supabase
    .from("wallets")
    .select("circle_wallet_id")
    .eq("id", buyerWalletId)
    .single();
  const buyerCircleWalletId = buyerWallet?.circle_wallet_id;

  const { data: sellerWallet } = await supabase
    .from("wallets")
    .select("circle_wallet_id")
    .eq("id", sellerWalletId)
    .single();
  const sellerCircleWalletId = sellerWallet?.circle_wallet_id;

  // Move the job Funded -> Submitted on-chain BEFORE anything else below.
  // Both release() and dispute() require Status.Submitted and revert
  // otherwise — this used to not exist anywhere in the app, so every real
  // validation run attempted an on-chain call guaranteed to revert (confirmed
  // live: dispute() on a real job failed with ESTIMATION_ERROR/"execution
  // reverted"), and nothing surfaced it. Checking on-chain status first
  // (rather than unconditionally calling submit) makes this safe to run on
  // every validation, including an admin "revalidate" re-run against a job
  // that's already past Funded — submit is only attempted once per job.
  //
  // On failure: stop immediately, before any validations/disputes row or
  // tasks.status change exists to make this task look like normal in-flight
  // state. tasks.metadata.submission_error is set and this throws, which
  // both callers (api/validate, api/tasks/[id]/deliver) already surface as a
  // 502 with the error message.
  if (jobId && sellerCircleWalletId) {
    const status = await getJobStatus(jobId);
    if (status === JOB_STATUS.Open) {
      throw new Error(
        `Job ${jobId} is not funded on-chain yet (status=Open) — cannot validate a task whose escrow was never locked.`,
      );
    }
    if (status === JOB_STATUS.Funded) {
      const deliverableHash = keccak256(stringToHex(JSON.stringify(deliverable)));

      // Recorded up front (amount_usdc: 0 — no funds move here) purely so
      // this action has a circle_tx_id from the moment it's submitted: the
      // existing lib/webhooks/handle-notification.ts transactions.* handler
      // already flips a payments row to 'failed' when it sees a FAILED
      // notification correlated by circle_tx_id — it previously had nothing
      // to correlate against for this call.
      const { data: submissionPayment } = await supabase
        .from("payments")
        .insert({
          task_id: taskId,
          from_wallet_id: sellerWalletId,
          kind: "submission",
          status: "pending",
          amount_usdc: 0,
          chain_id: ARC_CHAIN_ID,
          metadata: { erc8183_job_id: jobId, reason: "on_chain_submit" },
        })
        .select("id")
        .single();

      let submitTxId: string | undefined;
      try {
        submitTxId = await submitDeliverable(sellerCircleWalletId, jobId, deliverableHash);
        if (!submitTxId) {
          throw new Error("submitDeliverable did not return a transaction id");
        }
        if (submissionPayment) {
          await supabase
            .from("payments")
            .update({ circle_tx_id: submitTxId })
            .eq("id", submissionPayment.id);
        }
        const submitTxHash = await waitForTxHash(submitTxId);
        if (submissionPayment) {
          await supabase
            .from("payments")
            .update({ status: "released", tx_hash: submitTxHash })
            .eq("id", submissionPayment.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (submissionPayment) {
          await supabase
            .from("payments")
            .update({ status: "failed", error: message, circle_tx_id: submitTxId ?? null })
            .eq("id", submissionPayment.id);
        }
        await supabase
          .from("tasks")
          .update({
            metadata: {
              ...((task.metadata as Record<string, unknown>) ?? {}),
              submission_error: {
                message,
                circle_tx_id: submitTxId ?? null,
                failed_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", taskId);
        throw new Error(
          `On-chain delivery submission failed — task marked with a submission_error, no validation was recorded: ${message}`,
        );
      }
    }
    // Submitted/Completed/Rejected: already past this step (e.g. an admin
    // revalidate re-run) — nothing to do here, proceed straight to
    // validation/release/dispute below as normal.
  }

  const result = await validateDelivery({
    policy,
    taskCriteria: (task.metadata as { criteria?: unknown } | null)?.criteria ?? task.description,
    // No listing ⇒ no SLA ⇒ the seller promised nothing checkable.
    sellerSla: listing?.sla ?? {},
    deliverable,
    heightenedScrutiny: await isFlaggedForScrutiny(buyerWalletId),
  });

  await supabase.from("validations").insert({
    task_id: taskId,
    erc8183_job_id: jobId ?? null,
    outcome: result.outcome,
    policy_pass: result.policy_pass,
    task_pass: result.task_pass,
    sla_pass: result.sla_pass,
    failures: result.failures as never,
    rationale: result.rationale,
    // Persisted so a later post-approval contest can compare the delivered
    // payload against the original spec (previously only a hash column
    // existed here, and nothing wrote to it).
    deliverable: deliverable as never,
  });

  let txId: string | undefined;

  if (result.outcome === "approved") {
    // Release now — the buyer agent approved, no need to wait out the
    // accept window. (This used to call autoRelease, the keeper/timeout
    // path, which unconditionally requires the window to have already
    // elapsed — calling it immediately after submission, which is exactly
    // when the validator runs, would always have reverted. See
    // lib/escrow.ts's escrowAction docblock.)
    if (jobId && buyerCircleWalletId) {
      txId = await escrowAction(buyerCircleWalletId, "release(uint256,bytes32)", [
        jobId,
        "0x" + Buffer.from("validator-approve").toString("hex").padEnd(64, "0"),
      ]);
    }
    await supabase.from("tasks").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", taskId);
  } else {
    // Auto-file: freeze the escrow. Judges are drawn by the panel keeper.
    if (jobId && buyerCircleWalletId) {
      txId = await escrowAction(buyerCircleWalletId, "dispute(uint256,bytes32)", [
        jobId,
        "0x" + Buffer.from("validator-fail").toString("hex").padEnd(64, "0"),
      ]);
    }
    await supabase.from("tasks").update({ status: "disputed" }).eq("id", taskId);
    const { data: disputeRow } = await supabase
      .from("disputes")
      .insert({
        task_id: taskId,
        opened_by_wallet: buyerWalletId,
        status: "open",
        reason: result.rationale,
        evidence: { failures: result.failures, auto_filed_by: "buyer_agent_validator" } as never,
      })
      .select("id")
      .single();

    // Escalating filing fee — forfeited on a loss, refunded on a win (see
    // lib/disputes/service.ts:resolveDispute).
    if (disputeRow) {
      const fee = await computeFilingFee(buyerWalletId);
      await recordDisputeFiling({
        disputeId: disputeRow.id,
        walletId: buyerWalletId,
        amountUsdc: fee.amount_usdc,
      });

      // Buyer-facing feedback (Phase 3B) — generated now, not deferred to
      // resolution, so a rejected buyer sees more than a frozen escrow right
      // away: what the SLA/criteria gap actually was, and carry-forward
      // context for a resubmission. Value-add, not settlement-critical — the
      // dispute filing above already completed, so a feedback-generation
      // failure here shouldn't fail validation itself.
      try {
        const feedback = await generateRejectionFeedback({
          originalSpec: (task.metadata as { criteria?: unknown } | null)?.criteria ?? task.description,
          sellerSla: listing?.sla ?? {},
          deliverable,
          failures: result.failures,
          validatorRationale: result.rationale,
        });
        await supabase
          .from("disputes")
          .update({ educational_feedback: feedback as never })
          .eq("id", disputeRow.id);
      } catch {
        // Leave educational_feedback null rather than fail the validation run.
      }
    }
  }

  return { ...result, txId };
}

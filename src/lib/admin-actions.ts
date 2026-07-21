import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/admin-audit";
import { sweepSessionToTreasury } from "@/lib/estimator/service";
import { runValidation } from "@/lib/validator-service";
import { runResearchSourcingAgent } from "@/lib/agents/research-sourcing";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { triggerAutoRelease } from "@/lib/escrow";
import { resetAndReseedDemoTestAccount } from "@/lib/demo/seed";
import type { InsurancePoolDirection } from "@/lib/supabase/types";

/**
 * Admin dashboard actions: everything here moves real state (funds, dispute
 * outcomes) and writes an admin_audit_log row on success. Gating
 * (requireAdminApi) happens at the API route layer, one level up — every
 * function here takes the already-verified admin's wallet id.
 *
 * Pause/flag-user actions live in wallet-flags.ts instead of here — that
 * module is imported by estimator/service.ts, tasks/create.ts, and
 * disputes/service.ts as an enforcement check, and this file pulls in
 * validator-service.ts/escrow.ts/the research-sourcing agent, so keeping
 * flag logic here would risk a circular import back through those.
 */

// ── manual sweeps ───────────────────────────────────────────────

export async function manualSweepSession(
  adminWalletId: string,
  sessionId: string,
): Promise<{ amount_usdc: number }> {
  const supabase = createServiceSupabase();
  const { data: session } = await supabase
    .from("estimator_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Estimator session not found");
  if (session.status !== "active") {
    throw new Error(`Session is '${session.status}', not active — nothing to sweep`);
  }

  const amount = await sweepSessionToTreasury(session, "swept");
  await logAdminAction({
    adminWalletId,
    action: "manual_sweep_session",
    targetType: "estimator_session",
    targetId: sessionId,
    amountUsdc: amount,
  });
  return { amount_usdc: amount };
}

export async function sweepAllAbandonedNow(
  adminWalletId: string,
): Promise<{ swept: { session_id: string; amount_usdc: number }[] }> {
  // Re-implemented rather than reusing sweepAbandonedSessions() so the admin
  // trigger isn't silently gated behind ABANDONMENT_MINUTES — an admin
  // clicking "sweep all abandoned now" wants every currently-active session
  // swept immediately, not just the ones already past the idle window.
  const supabase = createServiceSupabase();
  const { data: activeSessions } = await supabase
    .from("estimator_sessions")
    .select("*")
    .eq("status", "active");

  const swept: { session_id: string; amount_usdc: number }[] = [];
  for (const session of activeSessions ?? []) {
    const amount = await sweepSessionToTreasury(session, "swept");
    swept.push({ session_id: session.id, amount_usdc: amount });
  }

  await logAdminAction({
    adminWalletId,
    action: "sweep_all_abandoned",
    targetType: "estimator_session",
    amountUsdc: swept.reduce((s, x) => s + x.amount_usdc, 0),
    details: { session_ids: swept.map((s) => s.session_id) },
  });
  return { swept };
}

// ── re-run validator on a stuck task ────────────────────────────

export type RevalidateResult = Awaited<ReturnType<typeof runValidation>>;

/** Re-runs the validator against the task's most recently submitted deliverable. */
export async function revalidateTaskWithLastDeliverable(
  adminWalletId: string,
  taskId: string,
): Promise<RevalidateResult> {
  const supabase = createServiceSupabase();
  const { data: lastValidation } = await supabase
    .from("validations")
    .select("deliverable")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastValidation || lastValidation.deliverable === null) {
    throw new Error(
      "No previously submitted deliverable found for this task — nothing to re-validate against",
    );
  }

  const result = await runValidation(taskId, lastValidation.deliverable);
  await logAdminAction({
    adminWalletId,
    action: "revalidate_task",
    targetType: "task",
    targetId: taskId,
    details: { source: "last_deliverable" },
  });
  return result;
}

/** For Research & Sourcing tasks only: regenerates a fresh deliverable, then validates it. */
export async function revalidateTaskWithFreshResearch(
  adminWalletId: string,
  taskId: string,
): Promise<RevalidateResult> {
  const supabase = createServiceSupabase();
  const { data: task } = await supabase
    .from("tasks")
    .select("*, listings(*)")
    .eq("id", taskId)
    .single();
  if (!task) throw new Error("Task not found");
  const listing = task.listings as { sla: unknown } | null;
  if (!isResearchSourcingListing(listing?.sla)) {
    throw new Error("This task isn't backed by the Research & Sourcing agent");
  }

  const deliverable = await runResearchSourcingAgent(task.description ?? task.title);
  const result = await runValidation(taskId, deliverable);
  await logAdminAction({
    adminWalletId,
    action: "revalidate_task",
    targetType: "task",
    targetId: taskId,
    details: { source: "fresh_research_sourcing_run" },
  });
  return result;
}

// ── trigger autoRelease on a stuck escrow job ───────────────────

/**
 * Permissionless on-chain call — SnapBackEscrow.autoRelease() reverts if the
 * accept window hasn't elapsed yet, so this can't force an early release; it
 * just lets admin trigger the already-designed-for keeper path on demand,
 * since no keeper/cron actually runs it automatically yet.
 */
export async function triggerAutoReleaseForTask(
  adminWalletId: string,
  adminCircleWalletId: string,
  taskId: string,
): Promise<{ tx_id: string | undefined; job_id: string }> {
  const supabase = createServiceSupabase();
  const { data: task } = await supabase.from("tasks").select("metadata").eq("id", taskId).single();
  const jobId = (task?.metadata as { erc8183_job_id?: string } | null)?.erc8183_job_id;
  if (!jobId) throw new Error("Task has no on-chain job id");

  const txId = await triggerAutoRelease(adminCircleWalletId, jobId);
  await logAdminAction({
    adminWalletId,
    action: "trigger_auto_release",
    targetType: "task",
    targetId: taskId,
    details: { job_id: jobId, circle_tx_id: txId ?? null },
  });
  return { tx_id: txId, job_id: jobId };
}

// ── demo test account (explicit reset only — see lib/demo/seed.ts) ─

/**
 * The only way testAccount@snapback.com's history is ever wiped: an admin
 * explicitly asking for it, never a login. See resetAndReseedDemoTestAccount's
 * docblock for why the old login-triggered auto-purge was removed.
 */
export async function resetDemoTestAccount(adminWalletId: string): Promise<{ user_id: string; wallet_id: string }> {
  const { userId, walletId } = await resetAndReseedDemoTestAccount();
  await logAdminAction({
    adminWalletId,
    action: "reset_demo_test_account",
    targetType: "user",
    targetId: userId,
  });
  return { user_id: userId, wallet_id: walletId };
}

// ── dispute-insurance pool (logical allocation within Treasury) ─

export async function getInsurancePoolBalance(): Promise<number> {
  const supabase = createServiceSupabase();
  const [{ data: adjustments }, { data: payouts }] = await Promise.all([
    supabase.from("insurance_pool_adjustments").select("direction, amount_usdc"),
    supabase.from("payments").select("amount_usdc").eq("kind", "insurance_payout"),
  ]);

  const topUps = (adjustments ?? [])
    .filter((a) => a.direction === "top_up")
    .reduce((s, a) => s + Number(a.amount_usdc), 0);
  const withdrawals = (adjustments ?? [])
    .filter((a) => a.direction === "withdraw")
    .reduce((s, a) => s + Number(a.amount_usdc), 0);
  const paidOut = (payouts ?? []).reduce((s, p) => s + Number(p.amount_usdc), 0);

  return Number((topUps - withdrawals - paidOut).toFixed(6));
}

export async function adjustInsurancePool(
  adminWalletId: string,
  direction: InsurancePoolDirection,
  amountUsdc: number,
  reason: string,
): Promise<{ new_balance_usdc: number }> {
  if (!(amountUsdc > 0)) throw new Error("Amount must be positive");

  const supabase = createServiceSupabase();
  const { error } = await supabase.from("insurance_pool_adjustments").insert({
    direction,
    amount_usdc: amountUsdc,
    reason,
    admin_wallet_id: adminWalletId,
  });
  if (error) throw new Error(`Failed to record insurance pool adjustment: ${error.message}`);

  await logAdminAction({
    adminWalletId,
    action: direction === "top_up" ? "insurance_pool_top_up" : "insurance_pool_withdraw",
    targetType: "insurance_pool",
    amountUsdc,
    details: { reason },
  });

  return { new_balance_usdc: await getInsurancePoolBalance() };
}

export { logAdminAction };

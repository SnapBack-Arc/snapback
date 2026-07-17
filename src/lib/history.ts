import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type {
  PaymentRow,
  QuoteRow,
  DisputeRow,
  TaskRow,
  JudgeVoteRow,
  ValidationRow,
} from "@/lib/supabase/types";

export type TaskWithRelations = TaskRow & {
  quotes: QuoteRow[];
  disputes: DisputeRow[];
};

export type TaskDetail = TaskRow & {
  quotes: QuoteRow[];
  disputes: (DisputeRow & { judge_votes: JudgeVoteRow[] })[];
  payments: PaymentRow[];
  validations: ValidationRow[];
  listings: { title: string; sla: unknown } | null;
};

/**
 * One task with every relation a status/lifecycle view needs. Scoped by
 * wallet: returns null if the task doesn't exist OR the wallet is neither
 * its payer nor payee — same not-found-vs-forbidden info-hiding as every
 * other wallet-scoped query in this file (no distinction given to the
 * caller either way).
 *
 * `payments`/`validations` aren't embedded via Supabase's relation syntax
 * (unlike `quotes`/`disputes`, which have direct FKs `on` tasks) — they're
 * fetched separately by task_id, matching the shape lib/admin-data.ts
 * already uses for the same reason.
 */
export async function getTaskById(
  taskId: string,
  walletId: string,
): Promise<TaskDetail | null> {
  const supabase = createServiceSupabase();

  const { data: task } = await supabase
    .from("tasks")
    .select("*, quotes(*), disputes(*, judge_votes(*)), listings(title, sla)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return null;
  if (task.payer_wallet_id !== walletId && task.payee_wallet_id !== walletId) {
    return null;
  }

  const [{ data: payments }, { data: validations }] = await Promise.all([
    supabase
      .from("payments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
    supabase
      .from("validations")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    ...task,
    payments: payments ?? [],
    validations: validations ?? [],
  } as TaskDetail;
}

/**
 * Tasks where the wallet is buyer (payer) or seller (payee), with their quotes
 * and disputes. Scoped to a single wallet — callers pass the logged-in user's
 * wallet id so a user only sees their own tasks.
 */
export async function getTasksForWallet(
  walletId: string,
): Promise<TaskWithRelations[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, quotes(*), disputes(*)")
    .or(`payer_wallet_id.eq.${walletId},payee_wallet_id.eq.${walletId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskWithRelations[];
}

/** Payments where the wallet is sender or recipient, newest first. */
export async function getPaymentsForWallet(
  walletId: string,
): Promise<PaymentRow[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .or(`from_wallet_id.eq.${walletId},to_wallet_id.eq.${walletId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentRow[];
}

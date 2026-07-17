import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { PaymentRow, QuoteRow, DisputeRow, TaskRow } from "@/lib/supabase/types";

export type TaskWithRelations = TaskRow & {
  quotes: QuoteRow[];
  disputes: DisputeRow[];
};

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

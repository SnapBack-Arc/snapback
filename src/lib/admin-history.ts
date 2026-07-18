import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Read-only data for the admin task-history page (/admin/history). Every
 * function here only ever SELECTs — nothing here writes to admin_audit_log
 * or any other table, matching the page's read-only spec (contrast with
 * lib/admin-actions.ts, which moves real state and always audit-logs).
 *
 * Real (non-demo) wallets are distinguished the same way the earlier
 * wallet-inventory audit did: every demo/seed wallet's circle_wallet_id is a
 * hardcoded literal like "demo-seller-wallet" / "demo-judge-{n}-wallet"
 * (lib/demo/seed.ts) — never a real Circle-issued id. Filtering those out
 * keeps this page to buyers who actually exist as real accounts.
 */

export type BuyerHistoryRow = {
  wallet_id: string;
  address: string;
  email: string;
  task_count: number;
};

/** Every real buyer who has submitted at least one task, most tasks first. */
export async function listBuyersWithTaskHistory(): Promise<BuyerHistoryRow[]> {
  const supabase = createServiceSupabase();
  const { data: wallets } = await supabase
    .from("wallets")
    .select("id, address, circle_wallet_id, users(email)")
    .not("circle_wallet_id", "like", "demo-%")
    .order("created_at", { ascending: false });

  const rows: BuyerHistoryRow[] = [];
  for (const w of wallets ?? []) {
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("payer_wallet_id", w.id);
    if (!count) continue; // only buyers who have actually submitted a task
    const user = w.users as unknown as { email: string } | null;
    rows.push({
      wallet_id: w.id,
      address: w.address,
      email: user?.email ?? "",
      task_count: count,
    });
  }
  return rows.sort((a, b) => b.task_count - a.task_count);
}

/** Task ids for a buyer, newest first — the row order for level 2. */
export async function listTaskIdsForBuyer(walletId: string): Promise<string[]> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .eq("payer_wallet_id", walletId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((t) => t.id);
}

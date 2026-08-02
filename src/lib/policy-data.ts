import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { PolicyRow } from "@/lib/supabase/types";

/** The wallet's current active spending/safety policy, or null if it has
 *  never set one — same "most recent active row" read used by
 *  lib/estimator/fees.ts's budget-ceiling check and the admin user-detail
 *  page (lib/admin-data.ts), so this page shows exactly what's actually
 *  enforced elsewhere, not a separate view of the data. */
export async function getActivePolicy(walletId: string): Promise<PolicyRow | null> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("policies")
    .select("*")
    .eq("wallet_id", walletId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

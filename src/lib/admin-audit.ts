import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { AdminAction } from "@/lib/supabase/types";

/**
 * Kept deliberately dependency-free (only the Supabase client) — every admin
 * action module and every enforcement-point module (estimator/service.ts,
 * tasks/create.ts, disputes/service.ts) needs to log or check admin state,
 * and none of those should end up importing each other transitively through
 * this file.
 */
export async function logAdminAction(params: {
  adminWalletId: string;
  action: AdminAction;
  targetType?: string;
  targetId?: string;
  amountUsdc?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createServiceSupabase();
  await supabase.from("admin_audit_log").insert({
    admin_wallet_id: params.adminWalletId,
    action: params.action,
    target_type: params.targetType ?? null,
    target_id: params.targetId ?? null,
    amount_usdc: params.amountUsdc ?? null,
    details: (params.details ?? {}) as never,
  });
}

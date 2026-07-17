import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/admin-audit";

/**
 * Admin pause/flag enforcement. Deliberately isolated from admin-actions.ts
 * (which pulls in validator-service.ts, escrow.ts, and the research-sourcing
 * agent) — estimator/service.ts, tasks/create.ts, and disputes/service.ts all
 * need isWalletFlagged() as a blocking check, and none of them should end up
 * importing those heavier modules transitively just to ask "is this wallet
 * paused?".
 */
export async function isWalletFlagged(walletId: string): Promise<boolean> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("wallet_flags")
    .select("flagged")
    .eq("wallet_id", walletId)
    .maybeSingle();
  return data?.flagged ?? false;
}

export async function flagWallet(
  adminWalletId: string,
  targetWalletId: string,
  reason: string,
): Promise<void> {
  const supabase = createServiceSupabase();
  const { error } = await supabase.from("wallet_flags").upsert(
    {
      wallet_id: targetWalletId,
      flagged: true,
      reason,
      flagged_by_wallet_id: adminWalletId,
    },
    { onConflict: "wallet_id" },
  );
  if (error) throw new Error(`Failed to flag wallet: ${error.message}`);
  await logAdminAction({
    adminWalletId,
    action: "flag_user",
    targetType: "wallet",
    targetId: targetWalletId,
    details: { reason },
  });
}

export async function unflagWallet(
  adminWalletId: string,
  targetWalletId: string,
): Promise<void> {
  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("wallet_flags")
    .update({ flagged: false, flagged_by_wallet_id: adminWalletId })
    .eq("wallet_id", targetWalletId);
  if (error) throw new Error(`Failed to unflag wallet: ${error.message}`);
  await logAdminAction({
    adminWalletId,
    action: "unflag_user",
    targetType: "wallet",
    targetId: targetWalletId,
  });
}

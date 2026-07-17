import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/circle-wallets";

/**
 * Wipes newAccount@snapback.com back to a clean, wallet-less state so every
 * demo selection genuinely re-triggers the first-time onboarding flow
 * (wallet generation, faucet funding).
 *
 * Deletion order matters: `tasks.payer_wallet_id`, `disputes.opened_by_wallet`
 * and `judge_votes.judge_wallet_id` are all ON DELETE RESTRICT (see
 * 0001_init.sql), so the wallet row can't be deleted while any of those still
 * reference it — Postgres would reject it with a FK violation. Deleting
 * judge_votes -> disputes -> payments -> tasks -> wallets, in that order,
 * clears every RESTRICT-constrained reference first; everything else
 * (quotes, reputation, buyer_dispute_stats, policies, estimator_sessions/
 * attempts) is ON DELETE CASCADE and cleans up automatically once the
 * wallet row goes. `payments` is deleted explicitly rather than left to its
 * ON DELETE SET NULL behavior, since an orphaned-but-still-present payments
 * row would violate "empty payment history".
 *
 * The `users` row itself is left untouched — only the wallet-scoped data
 * resets, so the same user id persists across demo runs.
 */
export async function resetDemoNewAccount(userId: string): Promise<void> {
  const wallet = await getUserWallet(userId);
  if (!wallet) return; // already clean — most common case, nothing to do

  const supabase = createServiceSupabase();
  const walletId = wallet.id;

  await supabase.from("judge_votes").delete().eq("judge_wallet_id", walletId);
  await supabase.from("disputes").delete().eq("opened_by_wallet", walletId);
  await supabase
    .from("payments")
    .delete()
    .or(`from_wallet_id.eq.${walletId},to_wallet_id.eq.${walletId}`);
  await supabase.from("tasks").delete().eq("payer_wallet_id", walletId);
  await supabase.from("wallets").delete().eq("id", walletId);
}

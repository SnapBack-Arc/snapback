import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUsdcBalance } from "@/lib/viem";
import { getGatewayBalance } from "@/lib/gateway";
import type { PaymentRow, TaskRow, DisputeRow, JudgeVoteRow, PolicyRow } from "@/lib/supabase/types";

/**
 * Admin-scoped queries: treasury overview and per-user drill-down. All filtered
 * server-side by the service-role client — access to these functions is gated
 * at the call site by requireAdmin() (see lib/admin.ts), not by RLS.
 */

export type RevenueBySource = { kind: string; total_usdc: number; count: number };

export async function getTreasuryOverview() {
  const supabase = createServiceSupabase();

  const { data: treasuryWallet } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", "treasury")
    .maybeSingle();

  let usdcBalance: string | null = null;
  let gatewayBalance: string | null = null;
  if (treasuryWallet) {
    const address = treasuryWallet.address as Address;
    const [usdc, gateway] = await Promise.all([
      getUsdcBalance(address).catch(() => null),
      getGatewayBalance(address).catch(() => null),
    ]);
    usdcBalance = usdc?.formatted ?? null;
    gatewayBalance = gateway?.formatted ?? null;
  }

  const { data: payments } = await supabase.from("payments").select("kind, amount_usdc");

  const bySource = new Map<string, { total: number; count: number }>();
  for (const p of payments ?? []) {
    const entry = bySource.get(p.kind) ?? { total: 0, count: 0 };
    entry.total += Number(p.amount_usdc);
    entry.count += 1;
    bySource.set(p.kind, entry);
  }
  const revenueBySource: RevenueBySource[] = [...bySource.entries()]
    .map(([kind, v]) => ({ kind, total_usdc: v.total, count: v.count }))
    .sort((a, b) => b.total_usdc - a.total_usdc);

  const { data: sweepFeed } = await supabase
    .from("payments")
    .select("*")
    .eq("kind", "treasury_sweep")
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    treasuryAddress: treasuryWallet?.address ?? null,
    usdcBalance,
    gatewayBalance,
    revenueBySource,
    treasuryRevenueUsdc: bySource.get("treasury_sweep")?.total ?? 0,
    sweepFeed: (sweepFeed ?? []) as PaymentRow[],
  };
}

export type AdminUserRow = {
  wallet_id: string;
  address: string;
  email: string;
  joined_at: string;
  task_count: number;
  total_volume_usdc: number;
  dispute_count: number;
};

/**
 * One row per wallet. Issues a handful of queries per wallet — fine at
 * hackathon scale; the first thing to fix if the user base grows is folding
 * this into a single aggregate query (a Postgres view or RPC).
 */
export async function listUsersForAdmin(): Promise<AdminUserRow[]> {
  const supabase = createServiceSupabase();

  const { data: wallets } = await supabase
    .from("wallets")
    .select("*, users(*)")
    .order("created_at", { ascending: false });

  const rows: AdminUserRow[] = [];
  for (const w of wallets ?? []) {
    const user = w.users as { email: string; created_at: string } | null;
    const [taskRes, paymentsRes, disputeRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .or(`payer_wallet_id.eq.${w.id},payee_wallet_id.eq.${w.id}`),
      supabase
        .from("payments")
        .select("amount_usdc")
        .or(`from_wallet_id.eq.${w.id},to_wallet_id.eq.${w.id}`),
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("opened_by_wallet", w.id),
    ]);

    const volume = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount_usdc), 0);

    rows.push({
      wallet_id: w.id,
      address: w.address,
      email: user?.email ?? "",
      joined_at: user?.created_at ?? w.created_at,
      task_count: taskRes.count ?? 0,
      total_volume_usdc: volume,
      dispute_count: disputeRes.count ?? 0,
    });
  }
  return rows;
}

export type AdminUserDetail = {
  wallet: { id: string; address: string; email: string };
  policy: PolicyRow | null;
  tasks: TaskRow[];
  payments: PaymentRow[];
  disputes: (DisputeRow & { judge_votes: JudgeVoteRow[] })[];
  buyerDisputeStats: {
    disputes_filed: number;
    disputes_won: number;
    disputes_lost: number;
    consecutive_losses: number;
    scrutiny_flagged: boolean;
  } | null;
  activeEstimatorSession: {
    id: string;
    subject: string;
    attempt_count: number;
    escrow_held_usdc: number;
    guaranteed_total_usdc: number | null;
    disclosed_contingent_fee_pct: number | null;
  } | null;
};

export async function getUserDetail(walletId: string): Promise<AdminUserDetail | null> {
  const supabase = createServiceSupabase();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("*, users(*)")
    .eq("id", walletId)
    .maybeSingle();
  if (!wallet) return null;
  const user = wallet.users as { email: string } | null;

  const { data: policies } = await supabase
    .from("policies")
    .select("*")
    .eq("wallet_id", walletId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .or(`payer_wallet_id.eq.${walletId},payee_wallet_id.eq.${walletId}`)
    .order("created_at", { ascending: false });

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .or(`from_wallet_id.eq.${walletId},to_wallet_id.eq.${walletId}`)
    .order("created_at", { ascending: false });

  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: disputes } = taskIds.length
    ? await supabase
        .from("disputes")
        .select("*, judge_votes(*)")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: disputeStats } = await supabase
    .from("buyer_dispute_stats")
    .select("disputes_filed, disputes_won, disputes_lost, consecutive_losses, scrutiny_flagged")
    .eq("wallet_id", walletId)
    .maybeSingle();

  const { data: activeSession } = await supabase
    .from("estimator_sessions")
    .select(
      "id, subject, attempt_count, escrow_held_usdc, guaranteed_total_usdc, disclosed_contingent_fee_pct",
    )
    .eq("payer_wallet_id", walletId)
    .eq("status", "active")
    .maybeSingle();

  return {
    wallet: { id: wallet.id, address: wallet.address, email: user?.email ?? "" },
    policy: (policies?.[0] as PolicyRow) ?? null,
    tasks: (tasks ?? []) as TaskRow[],
    payments: (payments ?? []) as PaymentRow[],
    disputes: (disputes ?? []) as (DisputeRow & { judge_votes: JudgeVoteRow[] })[],
    buyerDisputeStats: disputeStats ?? null,
    activeEstimatorSession: activeSession
      ? {
          id: activeSession.id,
          subject: activeSession.subject,
          attempt_count: activeSession.attempt_count,
          escrow_held_usdc: Number(activeSession.escrow_held_usdc),
          guaranteed_total_usdc:
            activeSession.guaranteed_total_usdc === null
              ? null
              : Number(activeSession.guaranteed_total_usdc),
          disclosed_contingent_fee_pct:
            activeSession.disclosed_contingent_fee_pct === null
              ? null
              : Number(activeSession.disclosed_contingent_fee_pct),
        }
      : null,
  };
}

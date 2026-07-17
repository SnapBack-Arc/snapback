import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUsdcBalance } from "@/lib/viem";
import { getGatewayBalance } from "@/lib/gateway";
import { getInsurancePoolBalance } from "@/lib/admin-actions";
import type {
  PaymentRow,
  TaskRow,
  DisputeRow,
  JudgeVoteRow,
  PolicyRow,
} from "@/lib/supabase/types";

/**
 * Admin-scoped queries: treasury overview and per-user drill-down. All filtered
 * server-side by the service-role client — access to these functions is gated
 * at the call site by requireAdmin() (see lib/admin.ts), not by RLS.
 */

export type RevenueLine = {
  label: string;
  total_usdc: number;
  count: number;
  note?: string;
};

export type TreasuryOverview = {
  treasuryAddress: string | null;
  /** Real on-chain USDC balance of the Treasury wallet. */
  onChainUsdcBalance: string | null;
  gatewayBalance: string | null;
  /** Attributed, human-labeled revenue lines — see the docblock on getTreasuryOverview. */
  revenueLines: RevenueLine[];
  /** Sum of revenueLines that represent genuinely kept revenue (excludes the
   *  informational quote_fee "collected" line, which overlaps with sweeps). */
  totalKeptRevenueUsdc: number;
  gasSpendUsdc: null;
  gasSpendNote: string;
  netPositionUsdc: number;
  insurancePoolBalanceUsdc: number;
  /** ledger revenue vs on-chain balance — see docblock. */
  onChainVsLedgerDiscrepancyUsdc: number | null;
  discrepancyNote: string;
  sweepFeed: PaymentRow[];
};

/**
 * Revenue attribution is intentionally NOT a single "sum every payment row"
 * query — payments.kind spans genuine kept revenue, pass-through escrow
 * legs, and off-chain-only bookkeeping. Getting this wrong either hides real
 * money or double-counts it. The rules, worked out by tracing every payment
 * write site in the app:
 *
 *   - platform_fee (status=released)  -> real revenue: the happy-path skim
 *     (lib/estimator/service.ts:creditSessionToTask).
 *   - filing_fee (status=released)    -> real revenue: dispute/contest filing
 *     fees forfeited on a buyer loss (lib/disputes/service.ts:resolveDispute
 *     sets status='released' on a loss, 'refunded' on a win — only the
 *     released ones are kept). Standard disputes and post-approval contests
 *     share this one payment kind, distinguished only via disputes.dispute_kind,
 *     which is why they're reported as a single combined line, not two.
 *   - judge_fee (any status)          -> "arbitration fees": there is NO real
 *     judge-payout code path yet (no keeper draws real judges, the real
 *     on-chain judgePool has zero staked judges, JudgeRegistry.selectPanel/
 *     finalize are real but gated to the Foundry deployer key, never a live
 *     Circle wallet). judge_fee rows only exist in seeded demo history today
 *     — this line will read 0 for any real, non-demo activity, which is
 *     correct, not a bug.
 *   - treasury_sweep (status=released) -> real revenue: topic-change sweeps
 *     and abandonment sweeps, split by metadata.reason (both go through
 *     sweepSessionToTreasury in lib/estimator/service.ts).
 *   - quote_fee (status=escrowed)     -> shown as an INFORMATIONAL "collected"
 *     line, not added to totalKeptRevenueUsdc: this money is either later
 *     credited toward a task payment (not platform revenue) or swept to
 *     Treasury on abandonment/topic-change (already counted under
 *     treasury_sweep above) — counting it as revenue on top of that would
 *     double-count the swept portion.
 *   - deposit/escrow/release/refund/snapback/nanopayment/gas -> pass-through
 *     legs of the task escrow lifecycle, not platform revenue; excluded.
 *   - insurance_payout                -> an OUTFLOW (Treasury -> buyer), not
 *     revenue; tracked separately via getInsurancePoolBalance().
 */
export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  const supabase = createServiceSupabase();

  const { data: treasuryWallet } = await supabase
    .from("app_wallets")
    .select("*")
    .eq("role", "treasury")
    .maybeSingle();

  let onChainUsdcBalance: string | null = null;
  let gatewayBalance: string | null = null;
  if (treasuryWallet) {
    const address = treasuryWallet.address as Address;
    const [usdc, gateway] = await Promise.all([
      getUsdcBalance(address).catch(() => null),
      getGatewayBalance(address).catch(() => null),
    ]);
    onChainUsdcBalance = usdc?.formatted ?? null;
    gatewayBalance = gateway?.formatted ?? null;
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("kind, status, amount_usdc, metadata");

  const sum = (pred: (p: { kind: string; status: string; metadata: unknown }) => boolean) => {
    const matched = (payments ?? []).filter((p) =>
      pred(p as { kind: string; status: string; metadata: unknown }),
    );
    return {
      total: matched.reduce((s, p) => s + Number(p.amount_usdc), 0),
      count: matched.length,
    };
  };

  const platformFees = sum((p) => p.kind === "platform_fee" && p.status === "released");
  const filingFeesForfeited = sum((p) => p.kind === "filing_fee" && p.status === "released");
  const arbitrationFees = sum((p) => p.kind === "judge_fee");
  const topicChangeSweeps = sum(
    (p) =>
      p.kind === "treasury_sweep" &&
      p.status === "released" &&
      (p.metadata as { reason?: string } | null)?.reason === "swept",
  );
  const abandonmentSweeps = sum(
    (p) =>
      p.kind === "treasury_sweep" &&
      p.status === "released" &&
      (p.metadata as { reason?: string } | null)?.reason === "abandoned",
  );
  const escalatedRetryChargesCollected = sum(
    (p) => p.kind === "quote_fee" && p.status === "escrowed",
  );

  const revenueLines: RevenueLine[] = [
    { label: "Platform fees (happy-path skim)", total_usdc: platformFees.total, count: platformFees.count },
    {
      label: "Forfeited dispute/contest filing fees",
      total_usdc: filingFeesForfeited.total,
      count: filingFeesForfeited.count,
    },
    {
      label: "Arbitration fees (judge payouts)",
      total_usdc: arbitrationFees.total,
      count: arbitrationFees.count,
      note:
        arbitrationFees.count === 0
          ? "No real judge-payout path exists yet — only ever populated by seeded demo history."
          : undefined,
    },
    {
      label: "Topic-change sweeps",
      total_usdc: topicChangeSweeps.total,
      count: topicChangeSweeps.count,
    },
    {
      label: "Abandonment sweeps",
      total_usdc: abandonmentSweeps.total,
      count: abandonmentSweeps.count,
    },
    {
      label: "Escalated retry charges (collected)",
      total_usdc: escalatedRetryChargesCollected.total,
      count: escalatedRetryChargesCollected.count,
      note:
        "Informational — not included in the total below. This money is later either credited toward a task payment or swept to Treasury (already counted in the sweep lines above); counting it separately would double-count.",
    },
  ];

  const totalKeptRevenueUsdc =
    platformFees.total +
    filingFeesForfeited.total +
    arbitrationFees.total +
    topicChangeSweeps.total +
    abandonmentSweeps.total;

  const insurancePoolBalanceUsdc = await getInsurancePoolBalance();

  const onChainVsLedgerDiscrepancyUsdc =
    onChainUsdcBalance === null ? null : Number(onChainUsdcBalance) - totalKeptRevenueUsdc;

  const { data: sweepFeed } = await supabase
    .from("payments")
    .select("*")
    .eq("kind", "treasury_sweep")
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    treasuryAddress: treasuryWallet?.address ?? null,
    onChainUsdcBalance,
    gatewayBalance,
    revenueLines,
    totalKeptRevenueUsdc,
    gasSpendUsdc: null,
    gasSpendNote:
      "N/A — this app's wallets self-pay gas in Arc's native USDC gas token; there is no Circle Gas Station sponsorship integration to sponsor or meter.",
    netPositionUsdc: totalKeptRevenueUsdc,
    insurancePoolBalanceUsdc,
    onChainVsLedgerDiscrepancyUsdc,
    discrepancyNote:
      "Expected to diverge, often substantially: only task escrow funding/release (SnapBackEscrow) moves real on-chain USDC today. Every revenue line above (platform fees, filing fees, arbitration fees, sweeps) is currently Supabase-ledger-only — no matching on-chain transfer to the Treasury wallet exists for these yet (the Estimator's own on-chain settlement is documented as a future 'contracts phase' step). This is a known gap, not a reconciliation bug in this dashboard.",
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
  flagged: boolean;
};

/**
 * One row per wallet, optionally filtered by an address/email substring
 * search. Issues a handful of queries per wallet — fine at hackathon scale;
 * the first thing to fix if the user base grows is folding this into a
 * single aggregate query (a Postgres view or RPC).
 */
export async function listUsersForAdmin(search?: string): Promise<AdminUserRow[]> {
  const supabase = createServiceSupabase();

  const { data: wallets } = await supabase
    .from("wallets")
    .select("*, users(*)")
    .order("created_at", { ascending: false });

  const term = search?.trim().toLowerCase();
  const filtered = term
    ? (wallets ?? []).filter((w) => {
        const user = w.users as { email: string } | null;
        return (
          w.address.toLowerCase().includes(term) ||
          (user?.email ?? "").toLowerCase().includes(term)
        );
      })
    : (wallets ?? []);

  const { data: flags } = await supabase.from("wallet_flags").select("wallet_id, flagged");
  const flaggedSet = new Set((flags ?? []).filter((f) => f.flagged).map((f) => f.wallet_id));

  const rows: AdminUserRow[] = [];
  for (const w of filtered) {
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
      flagged: flaggedSet.has(w.id),
    });
  }
  return rows;
}

export type AdminUserDetail = {
  wallet: { id: string; address: string; email: string; circle_wallet_id: string };
  flagged: boolean;
  flagReason: string | null;
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

  const { data: flag } = await supabase
    .from("wallet_flags")
    .select("flagged, reason")
    .eq("wallet_id", walletId)
    .maybeSingle();

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
    wallet: {
      id: wallet.id,
      address: wallet.address,
      email: user?.email ?? "",
      circle_wallet_id: wallet.circle_wallet_id,
    },
    flagged: flag?.flagged ?? false,
    flagReason: flag?.reason ?? null,
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

export type OpenDisputeRow = {
  id: string;
  task_id: string;
  task_title: string;
  dispute_kind: string;
  status: string;
  opened_by_wallet: string;
  opened_by_email: string;
  created_at: string;
};

/** Disputes with no verdict yet — the admin "force-resolve" action's worklist. */
export async function listOpenDisputesForAdmin(): Promise<OpenDisputeRow[]> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("disputes")
    .select("*, tasks(title), wallets!disputes_opened_by_wallet_fkey(address, users(email))")
    .in("status", ["open", "voting"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((d) => {
    const task = d.tasks as { title: string } | null;
    const openerWallet = d.wallets as { address: string; users: { email: string } | null } | null;
    return {
      id: d.id,
      task_id: d.task_id,
      task_title: task?.title ?? "",
      dispute_kind: d.dispute_kind,
      status: d.status,
      opened_by_wallet: d.opened_by_wallet,
      opened_by_email: openerWallet?.users?.email ?? "",
      created_at: d.created_at,
    };
  });
}

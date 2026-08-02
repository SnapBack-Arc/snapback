import "server-only";
import type { Address } from "viem";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getUsdcBalance } from "@/lib/viem";
import { getAdminSeq } from "@/lib/admin";
import { formatUserId } from "@/lib/user-id";
import { last7DayLabels } from "@/lib/dashboard-data";
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

export type TreasuryLedgerRow = {
  id: string;
  kind: "verification_fee" | "insurance_payout";
  userDisplayName: string;
  userEmail: string;
  status: string;
  amountUsdc: number;
  txHash: string | null;
  createdAt: string;
};

export type TreasuryFlowPoint = {
  label: string;
  date: string;
  cumulativeNetUsdc: number;
};

export type TreasuryOverview = {
  treasuryAddress: string | null;
  /** Real on-chain USDC balance of the Treasury wallet. */
  onChainUsdcBalance: string | null;
  /** Sum of nanopayment_validations.validation_fee_usdc — every real fee
   *  charged at Verify time, kept regardless of verdict. */
  feesCollectedUsdc: number;
  /** Sum of nanopayment_validations.payout_usdc — real reliability-priced
   *  insurance payouts, Treasury -> user, on a flagged-incorrect verdict. */
  paidOutUsdc: number;
  netPositionUsdc: number;
  /** netPositionUsdc as a % of feesCollectedUsdc — null with zero fees collected. */
  netMarginPct: number | null;
  nanopaymentsMonitored: number;
  avgFlagRatePct: number | null;
  /** Cumulative net (fees - payouts) over the last 7 days, for the balance sparkline. */
  flowHistory: TreasuryFlowPoint[];
  /** Most recent real fee/payout transfers, newest first. */
  ledger: TreasuryLedgerRow[];
};

const TREASURY_LEDGER_LIMIT = 25;

/**
 * The Treasury's real role in the nanopayment system: collect the flat
 * validation fee at every Verify call, and pay reliability-priced insurance
 * out on a flagged-incorrect verdict. Sourced from nanopayment_validations
 * (the source of truth for both amounts) joined to the actual payments rows
 * for the ledger/tx-hash detail — not payments.kind alone, since
 * insurance_payout is also (in principle) reachable from the older
 * dispute-contest system; joining through nanopayment_validations keeps this
 * page scoped to nanopayment money only.
 */
export async function getTreasuryOverview(): Promise<TreasuryOverview> {
  const supabase = createServiceSupabase();

  const { data: treasuryWallet } = await supabase
    .from("app_wallets")
    .select("address")
    .eq("role", "treasury")
    .maybeSingle();

  let onChainUsdcBalance: string | null = null;
  if (treasuryWallet) {
    const usdc = await getUsdcBalance(treasuryWallet.address as Address).catch(() => null);
    onChainUsdcBalance = usdc?.formatted ?? null;
  }

  const { data: validations } = await supabase
    .from("nanopayment_validations")
    .select(
      "verdict, payout_usdc, validation_fee_usdc, created_at, validation_fee_payment_id, payout_payment_id",
    )
    .order("created_at", { ascending: false });

  const rows = validations ?? [];
  const feesCollectedUsdc = rows.reduce((s, r) => s + Number(r.validation_fee_usdc), 0);
  const paidOutUsdc = rows.reduce((s, r) => s + Number(r.payout_usdc), 0);
  const netPositionUsdc = feesCollectedUsdc - paidOutUsdc;
  const netMarginPct = feesCollectedUsdc > 0 ? (netPositionUsdc / feesCollectedUsdc) * 100 : null;
  const flaggedCount = rows.filter((r) => r.verdict === "incorrect").length;
  const avgFlagRatePct = rows.length > 0 ? (flaggedCount / rows.length) * 100 : null;

  let cumulative = 0;
  const flowHistory: TreasuryFlowPoint[] = last7DayLabels().map(({ label, date, start, end }) => {
    const dayRows = rows.filter((r) => {
      const t = new Date(r.created_at);
      return t >= start && t < end;
    });
    const dayNet = dayRows.reduce((s, r) => s + Number(r.validation_fee_usdc) - Number(r.payout_usdc), 0);
    cumulative += dayNet;
    return { label, date, cumulativeNetUsdc: cumulative };
  });

  const paymentIds = rows
    .flatMap((r) => [r.validation_fee_payment_id, r.payout_payment_id])
    .filter((id): id is string => id !== null);

  const { data: payments } = paymentIds.length
    ? await supabase
        .from("payments")
        .select("id, kind, status, amount_usdc, tx_hash, created_at, from_wallet_id, to_wallet_id")
        .in("id", paymentIds)
        .order("created_at", { ascending: false })
        .limit(TREASURY_LEDGER_LIMIT)
    : { data: [] as PaymentRow[] };

  const paymentRows = payments ?? [];
  const walletIds = Array.from(
    new Set(
      paymentRows
        .flatMap((p) => [p.from_wallet_id, p.to_wallet_id])
        .filter((id): id is string => id !== null),
    ),
  );
  const { data: wallets } = walletIds.length
    ? await supabase.from("wallets").select("id, users(email, display_name)").in("id", walletIds)
    : { data: [] as { id: string; users: { email: string; display_name: string | null } | null }[] };

  const walletUserMap = new Map(
    (wallets ?? []).map((w) => [w.id, w.users as { email: string; display_name: string | null } | null]),
  );

  const ledger: TreasuryLedgerRow[] = paymentRows.map((p) => {
    const counterpartyWalletId = p.from_wallet_id ?? p.to_wallet_id;
    const user = counterpartyWalletId ? walletUserMap.get(counterpartyWalletId) : null;
    return {
      id: p.id,
      kind: p.kind as "verification_fee" | "insurance_payout",
      userDisplayName: user?.display_name ?? user?.email?.split("@")[0] ?? "—",
      userEmail: user?.email ?? "",
      status: p.status,
      amountUsdc: Number(p.amount_usdc),
      txHash: p.tx_hash,
      createdAt: p.created_at,
    };
  });

  return {
    treasuryAddress: treasuryWallet?.address ?? null,
    onChainUsdcBalance,
    feesCollectedUsdc,
    paidOutUsdc,
    netPositionUsdc,
    netMarginPct,
    nanopaymentsMonitored: rows.length,
    avgFlagRatePct,
    flowHistory,
    ledger,
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

export type SystemUserRow = {
  userId: string;
  walletId: string | null;
  displayName: string;
  email: string;
  monitored: number;
  flaggedPct: number | null;
  paidBackUsdc: number;
};

export type SystemOverview = {
  totalNanopaymentsMonitored: number;
  avgFlagRatePct: number | null;
  totalPaidBackUsdc: number;
  totalUsers: number;
  verificationFeesCollectedUsdc: number;
  netPositionUsdc: number;
  users: SystemUserRow[];
};

/**
 * Cross-user nanopayment coverage — the admin "System dashboard". Real
 * signup accounts only (excludes the @snapback.internal seller/judge wallets
 * seeded for the older task-marketplace/dispute system — those never went
 * through /login and aren't "users" of the nanopayment product).
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  const supabase = createServiceSupabase();

  const [{ data: users }, { data: validations }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, display_name, user_seq, wallets(id, address)")
      .not("email", "like", "%@snapback.internal")
      .order("user_seq", { ascending: true }),
    supabase.from("nanopayment_validations").select("wallet_id, verdict, payout_usdc, validation_fee_usdc"),
  ]);

  const realUsers = users ?? [];
  const rows = validations ?? [];

  const totalNanopaymentsMonitored = rows.length;
  const flaggedCount = rows.filter((r) => r.verdict === "incorrect").length;
  const avgFlagRatePct = rows.length > 0 ? (flaggedCount / rows.length) * 100 : null;
  const totalPaidBackUsdc = rows.reduce((s, r) => s + Number(r.payout_usdc), 0);
  const verificationFeesCollectedUsdc = rows.reduce((s, r) => s + Number(r.validation_fee_usdc), 0);
  const netPositionUsdc = verificationFeesCollectedUsdc - totalPaidBackUsdc;

  const byWallet = new Map<string, { monitored: number; flagged: number; paidBack: number }>();
  for (const r of rows) {
    const entry = byWallet.get(r.wallet_id) ?? { monitored: 0, flagged: 0, paidBack: 0 };
    entry.monitored += 1;
    if (r.verdict === "incorrect") entry.flagged += 1;
    entry.paidBack += Number(r.payout_usdc);
    byWallet.set(r.wallet_id, entry);
  }

  const userRows: SystemUserRow[] = realUsers.map((u) => {
    const walletRel = u.wallets as { id: string; address: string }[] | { id: string; address: string } | null;
    const wallet = Array.isArray(walletRel) ? (walletRel[0] ?? null) : walletRel;
    const stats = wallet ? byWallet.get(wallet.id) : undefined;
    const adminSeq = wallet ? getAdminSeq(wallet.address) : null;
    const userId =
      adminSeq !== null ? formatUserId(adminSeq, true) : formatUserId(u.user_seq ?? 0, false);
    return {
      userId,
      walletId: wallet?.id ?? null,
      displayName: u.display_name ?? u.email.split("@")[0],
      email: u.email,
      monitored: stats?.monitored ?? 0,
      flaggedPct: stats && stats.monitored > 0 ? (stats.flagged / stats.monitored) * 100 : null,
      paidBackUsdc: stats?.paidBack ?? 0,
    };
  });

  return {
    totalNanopaymentsMonitored,
    avgFlagRatePct,
    totalPaidBackUsdc,
    totalUsers: realUsers.length,
    verificationFeesCollectedUsdc,
    netPositionUsdc,
    users: userRows,
  };
}

export type WalletOwner = {
  displayName: string;
  email: string;
};

/** The real user behind a wallet — for the admin's per-user dashboard drill-down. */
export async function getWalletOwner(walletId: string): Promise<WalletOwner | null> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("wallets")
    .select("users(email, display_name)")
    .eq("id", walletId)
    .maybeSingle();

  const user = data?.users as { email: string; display_name: string | null } | null;
  if (!user) return null;
  return { displayName: user.display_name ?? user.email.split("@")[0], email: user.email };
}

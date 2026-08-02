import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * Monitoring dashboard data — real nanopayments (an agent-to-agent x402
 * charge, see lib/agents/parallel-client.ts) that SnapBack has validated for
 * this wallet, sourced straight from nanopayment_validations (see
 * lib/nanopayment-insurance.ts and /api/demo/verify). One row per real
 * validation run — "flagged" is a real per-payment fact here (verdict =
 * 'incorrect'), not a proxy through the old dispute system.
 */

export type FlagRateDay = {
  label: string;
  date: string;
  flagged: number;
  total: number;
  pct: number;
};

/** One standalone agent-to-agent nanopayment, real and validated. */
export type RecentTransaction = {
  id: string;
  title: string;
  agentName: string;
  valueUsdc: number;
  flagged: boolean;
  /** Only meaningful when flagged — whether this exact nanopayment was insured. */
  paidBack: boolean;
  createdAt: string;
};

export type DashboardData = {
  nanopaymentsMonitored: number;
  nanopaymentsMonitoredDeltaPct: number | null;
  paidBackThisMonthUsdc: number;
  flaggedNanopaymentsThisMonthCount: number;
  flaggedTodayPct: number | null;
  flaggedTodayTotal: number;
  flagRateLast7Days: FlagRateDay[];
  recentTransactions: RecentTransaction[];
};

const RECENT_TRANSACTIONS_LIMIT = 10;

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getDashboardData(walletId: string): Promise<DashboardData> {
  const supabase = createServiceSupabase();

  const { data } = await supabase
    .from("nanopayment_validations")
    .select("id, site, instruction, nanopayment_usdc, verdict, payout_usdc, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const todayStart = utcDayStart(now);

  const thisMonthRows = rows.filter((r) => new Date(r.created_at) >= monthStart);
  const lastMonthRows = rows.filter(
    (r) => new Date(r.created_at) >= lastMonthStart && new Date(r.created_at) < monthStart,
  );
  const nanopaymentsMonitoredDeltaPct =
    lastMonthRows.length > 0
      ? ((thisMonthRows.length - lastMonthRows.length) / lastMonthRows.length) * 100
      : null;

  const paidBackThisMonthUsdc = thisMonthRows.reduce((s, r) => s + Number(r.payout_usdc), 0);
  const flaggedNanopaymentsThisMonthCount = thisMonthRows.filter((r) => r.verdict === "incorrect").length;

  const todayRows = rows.filter((r) => new Date(r.created_at) >= todayStart);
  const todayFlagged = todayRows.filter((r) => r.verdict === "incorrect");
  const flaggedTodayPct = todayRows.length > 0 ? (todayFlagged.length / todayRows.length) * 100 : null;

  const flagRateLast7Days: FlagRateDay[] = last7DayLabels().map(({ label, date, start, end }) => {
    const dayRows = rows.filter((r) => {
      const t = new Date(r.created_at);
      return t >= start && t < end;
    });
    const dayFlagged = dayRows.filter((r) => r.verdict === "incorrect");
    return {
      label,
      date,
      flagged: dayFlagged.length,
      total: dayRows.length,
      pct: dayRows.length > 0 ? (dayFlagged.length / dayRows.length) * 100 : 0,
    };
  });

  const recentTransactions: RecentTransaction[] = rows.slice(0, RECENT_TRANSACTIONS_LIMIT).map((r) => ({
    id: r.id,
    title: r.instruction,
    agentName: r.site,
    valueUsdc: Number(r.nanopayment_usdc),
    flagged: r.verdict === "incorrect",
    paidBack: Number(r.payout_usdc) > 0,
    createdAt: r.created_at,
  }));

  return {
    nanopaymentsMonitored: rows.length,
    nanopaymentsMonitoredDeltaPct,
    paidBackThisMonthUsdc,
    flaggedNanopaymentsThisMonthCount,
    flaggedTodayPct,
    flaggedTodayTotal: todayRows.length,
    flagRateLast7Days,
    recentTransactions,
  };
}

function last7DayLabels(): { label: string; date: string; start: Date; end: Date }[] {
  const days: { label: string; date: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    days.push({
      label: d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
      date: d.toISOString().slice(0, 10),
      start: d,
      end: next,
    });
  }
  return days;
}

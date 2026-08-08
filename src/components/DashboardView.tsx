import type { DashboardData } from "@/lib/dashboard-data";
import FlaggedTodayWidget from "@/components/FlaggedTodayWidget";
import RecentTransactionsSection from "@/components/RecentTransactionsSection";

function formatDollars(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The monitoring dashboard's presentational content — shared by the
 * non-admin's own /dash and the admin's per-user drill-down
 * (/admin/system/users/[walletId]), which renders this exact same view for
 * a wallet that isn't the signed-in admin's own.
 */
export default function DashboardView({
  data,
  hasWallet,
  title = "Monitoring dashboard",
  subtitle = "Nanopayments you've been involved in this month.",
  emptyWalletMessage = "Generate a wallet to start monitoring nanopayments.",
}: {
  data: DashboardData;
  hasWallet: boolean;
  title?: string;
  subtitle?: string;
  emptyWalletMessage?: string;
}) {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 900px 500px at 50% -10%, #7c3aed26 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa]">{title}</h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">{subtitle}</p>
        </div>

        {!hasWallet ? (
          <div className="glass-card p-8 text-center text-sm text-[#a1a1aa]">{emptyWalletMessage}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <StatCard
                label="Nanopayments monitored"
                value={data.nanopaymentsMonitored.toLocaleString()}
                footer={
                  data.nanopaymentsMonitoredDeltaPct === null ? (
                    <span className="text-xs text-[#71717a]">No data last month</span>
                  ) : (
                    <span
                      className={`text-xs ${data.nanopaymentsMonitoredDeltaPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {data.nanopaymentsMonitoredDeltaPct >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(data.nanopaymentsMonitoredDeltaPct).toFixed(0)}% vs last month
                    </span>
                  )
                }
              />

              <FlaggedTodayWidget
                flaggedTodayPct={data.flaggedTodayPct}
                flaggedTodayCount={data.flaggedTodayCount}
                todayCheckedCount={data.todayCheckedCount}
                flagRateLast7Days={data.flagRateLast7Days}
                recentFlaggedExample={data.recentFlaggedExample}
                siteReliability={data.siteReliability}
              />

              <StatCard
                label="All-time paid back"
                value={formatDollars(data.paidBackAllTimeUsdc)}
                valueClass="text-emerald-400"
                footer={
                  <span className="text-xs text-[#71717a]">
                    across {data.flaggedNanopaymentsAllTimeCount.toLocaleString()} flagged nanopayments, all time
                  </span>
                }
              />
            </div>

            <section className="glass-card p-6">
              <div className="mb-6 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-[#71717a]">
                  Flag rate — last 7 days
                </div>
                <div className="text-xs text-[#71717a]">% of transactions flagged</div>
              </div>
              <div className="grid grid-cols-7 gap-3">
                {data.flagRateLast7Days.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-2">
                    <div className="flex h-24 w-full items-end">
                      <div
                        className="w-full rounded-md bg-[#84cc16]"
                        style={{ height: `${Math.max(d.pct, d.total > 0 ? 6 : 2)}%`, opacity: d.total > 0 ? 1 : 0.25 }}
                        title={`${d.flagged}/${d.total} flagged`}
                      />
                    </div>
                    <span className="text-xs text-[#71717a]">{d.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <RecentTransactionsSection transactions={data.recentTransactions} />
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  footer,
}: {
  label: string;
  value: string;
  valueClass?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-bold text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

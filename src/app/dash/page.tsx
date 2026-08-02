import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getDashboardData } from "@/lib/dashboard-data";

function formatDollars(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Same as formatDollars, but a genuinely non-zero nanopayment-scale amount
 *  (e.g. $0.01) that would round to $0.00 at 2 decimals shows enough extra
 *  precision to prove it's real — same reasoning as lib/format.ts's
 *  formatUsdcPrecise, just $-prefixed to match this page's other figures. */
function formatDollarsPrecise(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.005) {
    const trimmed = value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${trimmed}`;
  }
  return formatDollars(value);
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const data = wallet
    ? await getDashboardData(wallet.id)
    : {
        nanopaymentsMonitored: 0,
        nanopaymentsMonitoredDeltaPct: null,
        paidBackThisMonthUsdc: 0,
        flaggedNanopaymentsThisMonthCount: 0,
        flaggedTodayPct: null,
        flaggedTodayCount: 0,
        flagRateLast7Days: [],
        recentTransactions: [],
      };

  return (
    <main className="min-h-screen">
      <Nav email={session.email} />
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
            <h1 className="text-2xl font-bold text-[#fafafa]">Monitoring dashboard</h1>
            <p className="mt-1 text-sm text-[#a1a1aa]">
              Nanopayments you&apos;ve been involved in this month.
            </p>
          </div>

          {!wallet ? (
            <div className="glass-card p-8 text-center text-sm text-[#a1a1aa]">
              Generate a wallet to start monitoring nanopayments.
            </div>
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

                <FlagRing pct={data.flaggedTodayPct} flaggedCount={data.flaggedTodayCount} />

                <StatCard
                  label="Paid back this month"
                  value={formatDollars(data.paidBackThisMonthUsdc)}
                  valueClass="text-emerald-400"
                  footer={
                    <span className="text-xs text-[#71717a]">
                      across {data.flaggedNanopaymentsThisMonthCount.toLocaleString()} flagged nanopayments
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

              <section className="glass-card overflow-hidden">
                <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
                  Recent transactions
                </div>
                {data.recentTransactions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#a1a1aa]">
                    No nanopayments yet — agent-to-agent transactions you&apos;re involved in will show up here.
                  </div>
                ) : (
                  <div className="divide-y divide-[#ffffff14]">
                    {data.recentTransactions.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-4 px-6 py-4">
                        <div>
                          <div className="font-semibold text-[#fafafa]">{t.title}</div>
                          <div className="mt-1 text-xs text-[#71717a]">
                            {t.agentName} · value {formatDollarsPrecise(t.valueUsdc)}
                          </div>
                        </div>
                        {t.flagged && (
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">
                              Flagged
                            </span>
                            <span
                              className={`text-xs ${t.paidBack ? "text-emerald-400" : "text-amber-400"}`}
                            >
                              {t.paidBack ? "Paid back" : "Not paid back yet"}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
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

function FlagRing({ pct, flaggedCount }: { pct: number | null; flaggedCount: number }) {
  const displayPct = pct ?? 0;
  return (
    <div className="glass-card flex items-center gap-4 p-5">
      <div
        className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(#f59e0b ${displayPct * 3.6}deg, var(--glass-border) 0deg)`,
        }}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0c0c0e]">
          <span className="font-mono text-sm font-semibold text-[#f59e0b]">
            {pct === null ? "—" : `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-[#71717a]">Flagged today</div>
        <div className="text-xs text-[#71717a]">{flaggedCount.toLocaleString()} txns</div>
      </div>
    </div>
  );
}

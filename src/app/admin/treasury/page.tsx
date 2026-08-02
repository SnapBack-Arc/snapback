import { getTreasuryOverview } from "@/lib/admin-data";
import type { TreasuryFlowPoint } from "@/lib/admin-data";
import { explorerTxUrl } from "@/lib/arc";
import { shortAddress } from "@/lib/format";
import { isDemoModeEnabled } from "@/lib/demo/config";
import ConfirmAction from "@/components/admin/ConfirmAction";

function formatDollars(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const KIND_LABELS: Record<string, string> = {
  verification_fee: "Verification fee in",
  insurance_payout: "Payout out",
};

export default async function AdminTreasuryPage() {
  const data = await getTreasuryOverview();

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
          <h1 className="text-2xl font-bold text-[#fafafa]">Treasury wallet</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="glass-card p-6">
            <div className="text-xs uppercase tracking-wide text-[#71717a]">Arc treasury address</div>
            <div className="mt-1 font-mono text-sm text-[#a1a1aa]">
              {data.treasuryAddress ? shortAddress(data.treasuryAddress) : "—"}
            </div>
            <div className="mt-6 text-xs uppercase tracking-wide text-[#71717a]">Treasury USDC balance</div>
            <div className="mt-1 flex items-end justify-between gap-4">
              <div className="font-mono text-3xl font-bold text-[#fafafa]">
                {data.onChainUsdcBalance ? `$${Number(data.onChainUsdcBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </div>
              <FlowSparkline points={data.flowHistory} />
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="text-xs uppercase tracking-wide text-[#71717a]">Net margin</div>
            <div
              className={`mt-1 font-mono text-4xl font-bold ${data.netMarginPct === null ? "text-[#fafafa]" : data.netMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {data.netMarginPct === null ? "—" : `${data.netMarginPct >= 0 ? "+" : ""}${data.netMarginPct.toFixed(1)}%`}
            </div>
            <p className="mt-2 text-xs text-[#71717a]">
              Net position as a share of fees collected — every real validation fee in, every real
              insurance payout out.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-xl font-semibold text-[#fafafa]">
                  {data.nanopaymentsMonitored.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-[#71717a]">nanopayments monitored</div>
              </div>
              <div>
                <div className="font-mono text-xl font-semibold text-amber-400">
                  {data.avgFlagRatePct === null ? "—" : `${data.avgFlagRatePct.toFixed(1)}%`}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-[#71717a]">avg. flag rate</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Stat
            label="Treasury balance"
            value={data.onChainUsdcBalance ? formatDollars(Number(data.onChainUsdcBalance)) : "—"}
          />
          <Stat label="Lifetime fees in" value={formatDollars(data.feesCollectedUsdc)} />
          <Stat label="Lifetime paid out" value={formatDollars(data.paidOutUsdc)} valueClass="text-red-400" />
        </div>

        <section className="glass-card overflow-hidden">
          <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
            Treasury ledger
          </div>
          {data.ledger.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#a1a1aa]">
              No verification fees or insurance payouts yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[#71717a]">
                  <tr>
                    <th className="px-6 py-3">Kind</th>
                    <th className="px-3 py-3">User</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-6 py-3">Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ffffff14]">
                  {data.ledger.map((row) => (
                    <tr key={row.id} className="text-[#fafafa]">
                      <td className="px-6 py-3 font-semibold">{KIND_LABELS[row.kind] ?? row.kind}</td>
                      <td className="px-3 py-3 text-[#a1a1aa]">{row.userDisplayName}</td>
                      <td className="px-3 py-3">
                        <span
                          className={
                            row.status === "released"
                              ? row.kind === "insurance_payout"
                                ? "text-red-400"
                                : "text-emerald-400"
                              : "text-[#71717a]"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono">{formatDollars(row.amountUsdc)}</td>
                      <td className="px-6 py-3 font-mono text-xs text-[#71717a]">
                        {row.txHash ? (
                          <a
                            href={explorerTxUrl(row.txHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[#fafafa] hover:underline"
                          >
                            {row.txHash.slice(0, 6)}…{row.txHash.slice(-4)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isDemoModeEnabled() && (
          <section className="glass-card space-y-3 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#fafafa]">Demo test account</h2>
                <p className="mt-1 text-xs text-[#71717a]">
                  testAccount@snapback.com&apos;s history is persistent and never auto-purged on
                  login. This is the only way to wipe it back to the 5 baseline seeded cases.
                </p>
              </div>
              <ConfirmAction
                label="Reset demo test account"
                confirmLabel="wipe testAccount@snapback.com's history back to the 5 baseline seeded cases"
                url="/api/admin/demo-test-account/reset"
                variant="danger"
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-bold text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

/** A real 7-day cumulative net-flow trend (fees in minus payouts out), not decorative. */
function FlowSparkline({ points }: { points: TreasuryFlowPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map((p) => p.cumulativeNetUsdc);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 140;
  const height = 48;
  const step = width / (points.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trendUp = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-36 shrink-0" aria-hidden="true">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={trendUp ? "#10b981" : "#f87171"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import Link from "next/link";
import { getTreasuryOverview } from "@/lib/admin-data";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc } from "@/lib/format";

export default async function AdminTreasuryPage() {
  const data = await getTreasuryOverview();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Treasury</h1>
        <Link
          href="/admin/users"
          className="text-sm text-emerald-400 hover:underline"
        >
          User list →
        </Link>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <Stat
          label="Treasury USDC balance"
          value={data.usdcBalance ? `${data.usdcBalance} USDC` : "—"}
        />
        <Stat
          label="Treasury Gateway balance"
          value={data.gatewayBalance ? `${data.gatewayBalance} USDC` : "—"}
        />
        <Stat
          label="Swept to Treasury (lifetime)"
          value={formatUsdc(data.treasuryRevenueUsdc)}
        />
      </section>

      {data.treasuryAddress && (
        <p className="text-xs text-zinc-500">
          Treasury wallet:{" "}
          <span className="font-mono text-zinc-400">
            {data.treasuryAddress}
          </span>
        </p>
      )}

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">
          Revenue by source
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Live breakdown of the payments ledger by kind. Some monetization
          lines (licensing fees, staking pool cuts, reputation-API revenue)
          have no schema or code path yet and are not shown — they&apos;d need
          new payment kinds and instrumentation to populate.
        </p>
        {data.revenueBySource.length === 0 ? (
          <p className="text-sm text-zinc-500">No payments recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2">Kind</th>
                <th>Count</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.revenueBySource.map((r) => (
                <tr key={r.kind} className="text-zinc-300">
                  <td className="py-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                      {r.kind}
                    </span>
                  </td>
                  <td>{r.count}</td>
                  <td className="font-mono">{formatUsdc(r.total_usdc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">
          Gas Station spend (outflow)
        </h2>
        <p className="text-sm text-zinc-500">
          Not yet tracked — no Circle Gas Station sponsorship integration
          exists in this app yet.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">
          Treasury sweep feed
        </h2>
        {data.sweepFeed.length === 0 ? (
          <p className="text-sm text-zinc-500">No sweeps yet.</p>
        ) : (
          <div className="space-y-2">
            {data.sweepFeed.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-sm"
              >
                <div>
                  <span className="font-mono text-emerald-400">
                    {formatUsdc(p.amount_usdc)}
                  </span>
                  {p.task_id && (
                    <span className="ml-2 text-xs text-zinc-500">
                      task {p.task_id.slice(0, 8)}…
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  {p.tx_hash && (
                    <a
                      href={explorerTxUrl(p.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      tx
                    </a>
                  )}
                  <span>{formatDate(p.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg text-white">{value}</div>
    </div>
  );
}

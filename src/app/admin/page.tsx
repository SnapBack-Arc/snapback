import Link from "next/link";
import { getTreasuryOverview, listOpenDisputesForAdmin } from "@/lib/admin-data";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc } from "@/lib/format";
import { isDemoModeEnabled } from "@/lib/demo/config";
import ConfirmAction from "@/components/admin/ConfirmAction";
import InsurancePoolForm from "@/components/admin/InsurancePoolForm";

export default async function AdminTreasuryPage() {
  const [data, openDisputes] = await Promise.all([
    getTreasuryOverview(),
    listOpenDisputesForAdmin(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Treasury</h1>
        <div className="flex gap-4">
          <Link href="/admin/history" className="text-sm text-emerald-400 hover:underline">
            Task history →
          </Link>
          <Link href="/admin/users" className="text-sm text-emerald-400 hover:underline">
            User list →
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Treasury USDC balance (on-chain)"
          value={data.onChainUsdcBalance ? `${data.onChainUsdcBalance} USDC` : "—"}
        />
        <Stat
          label="Treasury Gateway balance"
          value={data.gatewayBalance ? `${data.gatewayBalance} USDC` : "—"}
        />
        <Stat label="Ledger revenue (kept)" value={formatUsdc(data.totalKeptRevenueUsdc)} />
        <Stat label="Net position" value={formatUsdc(data.netPositionUsdc)} />
        <Stat
          label="Dispute-insurance pool"
          value={formatUsdc(data.insurancePoolBalanceUsdc)}
        />
        <Stat label="Gas Station spend" value="N/A" />
      </section>

      {data.treasuryAddress && (
        <p className="text-xs text-zinc-500">
          Treasury wallet: <span className="font-mono text-zinc-400">{data.treasuryAddress}</span>
        </p>
      )}

      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
        <span className="font-semibold">
          On-chain vs. ledger:{" "}
          {data.onChainVsLedgerDiscrepancyUsdc === null
            ? "on-chain balance unavailable"
            : `${formatUsdc(data.onChainVsLedgerDiscrepancyUsdc)} difference`}
        </span>
        <p className="mt-1 text-amber-300/80">{data.discrepancyNote}</p>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">Revenue by source</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Attributed from recorded events in Supabase (source of truth) — see the on-chain
          comparison above. Some monetization lines (licensing fees, staking pool cuts,
          reputation-API revenue) have no schema or code path yet and aren&apos;t shown.
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2">Source</th>
              <th>Count</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {data.revenueLines.map((r) => (
              <tr key={r.label} className="text-zinc-300 align-top">
                <td className="py-2 pr-4">
                  {r.label}
                  {r.note && <p className="mt-0.5 text-xs text-zinc-500">{r.note}</p>}
                </td>
                <td>{r.count}</td>
                <td className="font-mono">{formatUsdc(r.total_usdc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-200">Gas Station spend (outflow)</h2>
        <p className="text-sm text-zinc-500">{data.gasSpendNote}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Dispute-insurance pool</h2>
          <span className="font-mono text-sm text-zinc-200">
            {formatUsdc(data.insurancePoolBalanceUsdc)}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          A logical sub-balance of the Treasury wallet (bookkeeping only, not a separate on-chain
          wallet) — post-approval contest wins already pay out of it. Balance = top-ups −
          withdrawals − insurance payouts.
        </p>
        <InsurancePoolForm />
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Disputes in progress</h2>
        </div>
        <p className="text-xs text-zinc-500">
          Passive visibility only — every dispute now resolves automatically (the real judge
          panel, or its deterministic tie-break) with no admin action to take here.{" "}
          <span className="text-amber-400">Settlement failed</span> is the one exception: a
          genuine Circle/chain infra failure after an outcome was already decided, not a normal
          in-progress dispute — see the README&apos;s Known limitations.
        </p>
        {openDisputes.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing in progress right now.</p>
        ) : (
          <div className="space-y-2">
            {openDisputes.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
              >
                <div>
                  <Link href={`/tasks/${d.task_id}`} className="text-emerald-400 hover:underline">
                    {d.task_title || d.task_id.slice(0, 8)}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {d.dispute_kind === "post_approval_contest" ? "Post-approval contest" : "Dispute"}{" "}
                    · opened by {d.opened_by_email || d.opened_by_wallet.slice(0, 8)} ·{" "}
                    {formatDate(d.created_at)}
                  </p>
                </div>
                <span
                  className={
                    d.status === "settlement_failed"
                      ? "rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-300"
                      : "rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
                  }
                >
                  {d.status === "settlement_failed" ? "settlement failed" : d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Treasury sweep feed</h2>
          <ConfirmAction
            label="Sweep all abandoned now"
            confirmLabel="sweep every active session's held escrow to Treasury immediately"
            url="/api/admin/sweep-abandoned"
          />
        </div>
        {data.sweepFeed.length === 0 ? (
          <p className="text-sm text-zinc-500">No sweeps yet.</p>
        ) : (
          <div className="space-y-2">
            {data.sweepFeed.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono text-emerald-400">{formatUsdc(p.amount_usdc)}</span>
                  {p.task_id && (
                    <span className="ml-2 text-xs text-zinc-500">task {p.task_id.slice(0, 8)}…</span>
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

      {isDemoModeEnabled() && (
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Demo test account</h2>
              <p className="mt-1 text-xs text-zinc-500">
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
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 font-mono text-lg text-white">{value}</div>
    </div>
  );
}

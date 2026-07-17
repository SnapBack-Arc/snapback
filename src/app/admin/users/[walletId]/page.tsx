import { notFound } from "next/navigation";
import { getUserDetail } from "@/lib/admin-data";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc, statusClasses } from "@/lib/format";
import { contingentDisclosureLine } from "@/lib/estimator/fees";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ walletId: string }>;
}) {
  const { walletId } = await params;
  const detail = await getUserDetail(walletId);
  if (!detail) notFound();

  const {
    wallet,
    policy,
    tasks,
    payments,
    disputes,
    buyerDisputeStats,
    activeEstimatorSession,
  } = detail;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          {wallet.email || "Unknown user"}
        </h1>
        <p className="font-mono text-sm text-zinc-500">{wallet.address}</p>
      </div>

      {activeEstimatorSession && (
        <section className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 text-sm">
          <div>
            <span className="text-amber-400">Active quote-phase escrow:</span>{" "}
            {formatUsdc(activeEstimatorSession.escrow_held_usdc)} held · subject
            &quot;{activeEstimatorSession.subject}&quot; · attempt{" "}
            {activeEstimatorSession.attempt_count}
          </div>
          {activeEstimatorSession.guaranteed_total_usdc !== null && (
            <div className="mt-2 border-t border-amber-900/30 pt-2">
              <div className="font-semibold text-white">
                Guaranteed total: {formatUsdc(activeEstimatorSession.guaranteed_total_usdc)}
              </div>
              {activeEstimatorSession.disclosed_contingent_fee_pct !== null && (
                <div className="mt-1 text-xs text-zinc-400">
                  {contingentDisclosureLine(
                    activeEstimatorSession.disclosed_contingent_fee_pct,
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {buyerDisputeStats && (
        <section
          className={`rounded-xl border p-4 text-sm ${
            buyerDisputeStats.scrutiny_flagged
              ? "border-red-900/40 bg-red-950/10"
              : "border-zinc-800 bg-zinc-900"
          }`}
        >
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Buyer dispute record
            {buyerDisputeStats.scrutiny_flagged && (
              <span className="ml-2 rounded-full bg-red-900/40 px-2 py-0.5 text-red-300">
                Flagged for scrutiny
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-400">
            <span>Filed: {buyerDisputeStats.disputes_filed}</span>
            <span>Won: {buyerDisputeStats.disputes_won}</span>
            <span>Lost: {buyerDisputeStats.disputes_lost}</span>
            <span>Consecutive losses: {buyerDisputeStats.consecutive_losses}</span>
          </div>
        </section>
      )}

      {policy && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Current policy — {policy.name}
          </h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-400">
            <span>Max amount: {policy.max_amount_usdc ?? "—"} USDC</span>
            <span>Daily limit: {policy.daily_limit_usdc ?? "—"} USDC</span>
            <span>Auto-release: {policy.auto_release_hours ?? "—"}h</span>
            <span>
              Accuracy tolerance: {policy.accuracy_tolerance ?? "—"}
            </span>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Tasks ({tasks.length})
        </h2>
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-white">{t.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(t.status)}`}
                >
                  {t.status}
                </span>
              </div>
              {t.description && (
                <div className="mt-1 text-xs text-zinc-500">
                  {t.description}
                </div>
              )}
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="text-sm text-zinc-500">No tasks.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Payments ({payments.length})
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-zinc-500">No payments.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Kind</th>
                  <th>Amount</th>
                  <th>Direction</th>
                  <th>Tx</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {payments.map((p) => (
                  <tr key={p.id} className="text-zinc-300">
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                        {p.kind}
                      </span>
                    </td>
                    <td className="font-mono">{formatUsdc(p.amount_usdc)}</td>
                    <td className="text-xs text-zinc-500">
                      {p.from_wallet_id === wallet.id ? "outgoing" : "incoming"}
                    </td>
                    <td>
                      {p.tx_hash ? (
                        <a
                          href={explorerTxUrl(p.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          tx
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-zinc-500">
                      {formatDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">
          Disputes ({disputes.length})
        </h2>
        <div className="space-y-2">
          {disputes.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(d.status)}`}
                >
                  {d.status}
                </span>
                <span className="text-zinc-400">outcome: {d.outcome}</span>
                {d.dispute_kind === "post_approval_contest" && (
                  <span className="rounded-full bg-purple-900/40 px-2 py-0.5 text-xs text-purple-300">
                    post-approval contest
                  </span>
                )}
              </div>
              {d.reason && (
                <p className="mt-1 text-xs text-zinc-500">{d.reason}</p>
              )}
              {d.filing_fee_usdc !== null && (
                <div className="mt-1 text-xs text-zinc-500">
                  Filing fee: {formatUsdc(d.filing_fee_usdc)}
                  {d.outcome === "favor_payer" && " (refunded)"}
                  {d.outcome === "favor_payee" && " (forfeited)"}
                </div>
              )}
              {d.insurance_payout_usdc !== null && (
                <div className="mt-1 text-xs text-emerald-400">
                  Insurance-pool payout: {formatUsdc(d.insurance_payout_usdc)} (Treasury —
                  seller&apos;s payout was not reversed)
                </div>
              )}
              {d.judge_votes.length > 0 && (
                <div className="mt-2 text-xs text-zinc-500">
                  Judge votes: {d.judge_votes.map((v) => v.choice).join(", ")}
                </div>
              )}
              {d.educational_feedback !== null && (
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
                  {(() => {
                    const feedback = d.educational_feedback as {
                      gap_summary?: string;
                      rewritten_specs?: string[];
                    };
                    return (
                      <>
                        <p className="text-zinc-300">{feedback.gap_summary}</p>
                        {feedback.rewritten_specs && feedback.rewritten_specs.length > 0 && (
                          <ul className="mt-1 list-disc space-y-1 pl-4">
                            {feedback.rewritten_specs.map((spec, i) => (
                              <li key={i}>{spec}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          {disputes.length === 0 && (
            <p className="text-sm text-zinc-500">No disputes.</p>
          )}
        </div>
      </section>
    </div>
  );
}

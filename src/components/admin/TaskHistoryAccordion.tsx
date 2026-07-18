"use client";

import { useState } from "react";
import type { TaskDetail } from "@/lib/history";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc } from "@/lib/format";
import {
  deriveOutcomeLabel,
  outcomeBadgeClass,
  paymentKindLabel,
  paymentDirectionLabel,
  isOnChainConfirmed,
} from "@/lib/admin-history-format";

/**
 * Read-only accordion: expand/collapse is local UI state only. This
 * component never calls an API route or writes anything — it only renders
 * data already fetched server-side via lib/history.ts's getTaskById(), the
 * same function the regular (non-admin) task detail page uses.
 */
export default function TaskHistoryAccordion({ tasks }: { tasks: TaskDetail[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return <p className="text-sm text-zinc-500">No tasks yet.</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const outcome = deriveOutcomeLabel(task);
        const isOpen = openId === task.id;
        return (
          <div key={task.id} className="rounded-xl border border-zinc-800 bg-zinc-900">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : task.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-white">{task.title}</div>
                <div className="text-xs text-zinc-500">{formatDate(task.created_at)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-zinc-300">{formatUsdc(task.amount_usdc)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${outcomeBadgeClass(outcome)}`}>
                  {outcome}
                </span>
                <span className="text-zinc-500">{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && <TaskStory task={task} />}
          </div>
        );
      })}
    </div>
  );
}

function TaskStory({ task }: { task: TaskDetail }) {
  const agent = task.listings?.title ?? "Unknown seller";
  const latestValidation = [...task.validations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  return (
    <div className="space-y-4 border-t border-zinc-800 px-4 py-4 text-sm">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">The request</h3>
        <p className="text-zinc-300">{task.description || "(no description given)"}</p>
        <p className="mt-1 text-xs text-zinc-500">Handled by: {agent}</p>
      </section>

      {latestValidation && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Validator&apos;s verdict
          </h3>
          <p className="text-zinc-300">
            <span
              className={
                latestValidation.outcome === "approved" ? "text-emerald-400" : "text-red-400"
              }
            >
              {latestValidation.outcome === "approved" ? "Approved" : "Rejected"}
            </span>{" "}
            — {latestValidation.rationale || "(no rationale recorded)"}
          </p>
        </section>
      )}

      {task.disputes.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Dispute &amp; judge panel
          </h3>
          {task.disputes.map((d) => (
            <div key={d.id} className="mb-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-zinc-300">
                Status: <span className="font-medium">{d.status}</span>
                {d.outcome !== "pending" && (
                  <>
                    {" "}
                    — verdict:{" "}
                    <span className="font-medium">
                      {d.outcome === "favor_payer" ? "Buyer won" : "Seller won"}
                    </span>
                  </>
                )}
              </p>
              {d.reason && <p className="mt-1 text-xs text-zinc-500">Reason filed: {d.reason}</p>}
              {d.judge_votes.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {d.judge_votes.map((v) => (
                    <li key={v.id}>
                      Judge vote: <span className="font-medium">{v.choice}</span>
                      {v.rationale ? ` — ${v.rationale}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs italic text-zinc-600">
                  No AI judge panel votes recorded (this dispute was settled before the judge panel
                  existed, or by the manual admin override).
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Money trail
        </h3>
        {task.payments.length === 0 ? (
          <p className="text-xs text-zinc-500">No payments recorded for this task.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-950 text-left uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">What</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {task.payments.map((p) => (
                  <tr key={p.id} className="text-zinc-300">
                    <td className="px-3 py-2">{paymentKindLabel(p.kind)}</td>
                    <td className="px-3 py-2">{paymentDirectionLabel(p, task)}</td>
                    <td className="px-3 py-2 font-mono">{formatUsdc(p.amount_usdc)}</td>
                    <td className="px-3 py-2">
                      {isOnChainConfirmed(p) ? (
                        <a
                          href={explorerTxUrl(p.tx_hash!)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          Confirmed on-chain ↗
                        </a>
                      ) : (
                        <span className="italic text-zinc-500">Ledger only — no on-chain transfer</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

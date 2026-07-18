"use client";

import { useState } from "react";
import type { TaskDetail } from "@/lib/history";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc } from "@/lib/format";
import {
  deriveOutcomeLabel,
  outcomeBadgeClass,
  buildTaskTimeline,
  type TimelineEvent,
  type TimelineMoney,
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

/** Dot color per event kind — distinguishes system-triggered disputes from buyer-initiated contests at a glance. */
function dotClass(event: TimelineEvent): string {
  switch (event.kind) {
    case "dispute_filed":
      return event.disputeKind === "post_approval_contest" ? "bg-violet-400" : "bg-amber-400";
    case "dispute_resolved":
      return event.outcome === "favor_payer" ? "bg-emerald-400" : "bg-red-400";
    case "insurance_payout":
      return "bg-violet-400";
    case "validated":
      return event.outcome === "approved" ? "bg-emerald-400" : "bg-amber-400";
    case "judge_votes":
      return "bg-sky-400";
    default:
      return "bg-zinc-500";
  }
}

function MoneyLine({ item }: { item: TimelineMoney }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-400">{item.label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-zinc-300">{formatUsdc(item.amountUsdc)}</span>
        {item.onChain && item.txHash ? (
          <a
            href={explorerTxUrl(item.txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline"
          >
            Confirmed on-chain ↗
          </a>
        ) : (
          <span className="italic text-zinc-500">Ledger only</span>
        )}
      </span>
    </div>
  );
}

function EventBody({ event }: { event: TimelineEvent }) {
  switch (event.kind) {
    case "submitted":
      return (
        <>
          <p className="font-medium text-white">Task submitted</p>
          <p className="mt-1 text-zinc-300">{event.description || "(no description given)"}</p>
          <p className="mt-1 text-xs text-zinc-500">Handled by: {event.agent}</p>
        </>
      );
    case "quoted":
      return (
        <p className="font-medium text-white">
          Quoted <span className="font-mono text-zinc-300">{formatUsdc(event.amountUsdc)}</span>
          {event.accepted && <span className="ml-2 text-xs text-emerald-400">(accepted)</span>}
        </p>
      );
    case "funded":
      return (
        <div>
          <p className="font-medium text-white">Escrow funded</p>
          <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
            {event.items.map((item, i) => (
              <MoneyLine key={i} item={item} />
            ))}
          </div>
        </div>
      );
    case "job_event":
      return (
        <p className="text-zinc-300">
          On-chain: <span className="font-medium text-white">{event.eventName}</span>
          <span className="ml-1 text-xs text-zinc-500">({event.contract})</span>
          {event.txHash && (
            <a
              href={explorerTxUrl(event.txHash)}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-emerald-400 hover:underline"
            >
              ↗
            </a>
          )}
        </p>
      );
    case "validated":
      return (
        <p className="text-zinc-300">
          Validator ran —{" "}
          <span className={event.outcome === "approved" ? "text-emerald-400" : "text-amber-400"}>
            {event.outcome === "approved" ? "Passed" : "Failed"}
          </span>
          {event.rationale ? ` — ${event.rationale}` : ""}
        </p>
      );
    case "settlement":
      return (
        <div>
          <p className="font-medium text-white">{event.label}</p>
          <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
            {event.items.map((item, i) => (
              <MoneyLine key={i} item={item} />
            ))}
          </div>
        </div>
      );
    case "dispute_filed":
      return (
        <div>
          <p className="font-medium text-white">
            {event.disputeKind === "post_approval_contest"
              ? "Buyer filed a post-approval contest"
              : "Dispute auto-filed by validator"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {event.disputeKind === "post_approval_contest"
              ? "Buyer-initiated — the seller had already been paid; distinct from a validator rejection."
              : "System-triggered by the validator's rejection — not a buyer choice."}
          </p>
          {event.reason && <p className="mt-1 text-zinc-300">Reason: {event.reason}</p>}
          {event.fee && (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              <MoneyLine item={event.fee} />
            </div>
          )}
        </div>
      );
    case "judge_votes":
      return (
        <div>
          <p className="font-medium text-white">Judge panel voted</p>
          <ul className="mt-1 space-y-1 text-xs text-zinc-400">
            {event.votes.map((v, i) => (
              <li key={i}>
                <span className="font-medium">{v.choice}</span>
                {v.rationale ? ` — ${v.rationale}` : ""}
              </li>
            ))}
          </ul>
        </div>
      );
    case "dispute_resolved":
      return (
        <div>
          <p className="font-medium text-white">
            Dispute resolved —{" "}
            <span className={event.outcome === "favor_payer" ? "text-emerald-400" : "text-red-400"}>
              {event.outcome === "favor_payer" ? "Buyer won" : event.outcome === "favor_payee" ? "Seller won" : event.outcome}
            </span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {event.forcedByAdmin
              ? "Resolved by admin force-resolve — no judge panel voted."
              : "Resolved from the judge panel's majority vote."}
          </p>
          {event.settlements.length > 0 && (
            <div className="mt-2 space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
              {event.settlements.map((item, i) => (
                <MoneyLine key={i} item={item} />
              ))}
            </div>
          )}
        </div>
      );
    case "insurance_payout":
      return (
        <div>
          <p className="font-medium text-white">Insurance-pool payout to buyer</p>
          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
            <MoneyLine item={event.item} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

function TaskStory({ task }: { task: TaskDetail }) {
  const timeline = buildTaskTimeline(task);

  return (
    <div className="border-t border-zinc-800 px-4 py-4 text-sm">
      <ol className="space-y-4">
        {timeline.map((event) => (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass(event)}`} />
              <span className="mt-1 w-px grow bg-zinc-800" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-xs text-zinc-500">{formatDate(event.at)}</p>
              <div className="mt-0.5">
                <EventBody event={event} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

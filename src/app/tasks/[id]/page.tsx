import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getTaskById, type TaskDetail } from "@/lib/history";
import { formatDate, formatUsdc, statusClasses } from "@/lib/format";
import { explorerTxUrl } from "@/lib/arc";
import type { DisputeRow, JudgeVoteRow } from "@/lib/supabase/types";
import type { EducationalFeedback, RejectionFeedback } from "@/lib/disputes/feedback";
import AgentRoster, { AGENT_COLOR, type AgentEntry } from "@/components/AgentRoster";
import DeliverButton from "@/components/DeliverButton";
import ContestDeliveryButton from "@/components/ContestDeliveryButton";
import TaskLiveUpdates from "@/components/TaskLiveUpdates";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { contestWindowHours } from "@/lib/disputes/contest";
import { computeContestFee } from "@/lib/disputes/service";

type Stage = "quoted" | "escrowed" | "validated" | "approved" | "disputed" | "settled";

const STAGE_ORDER: { key: Stage; label: string }[] = [
  { key: "quoted", label: "Quoted" },
  { key: "escrowed", label: "Escrowed" },
  { key: "validated", label: "Validated" },
  { key: "approved", label: "Approved" },
  { key: "settled", label: "Settled" },
];

/**
 * Derives an "effective" lifecycle stage from actual data rather than trusting
 * tasks.status alone — real code never sets it past "disputed" even once the
 * dispute resolves (resolveDispute() in lib/disputes/service.ts never touches
 * the tasks row), so the task row itself can't tell "still disputed" from
 * "was disputed, now settled" apart.
 */
function deriveStage(task: TaskDetail): { stage: Stage; latestDispute: DisputeRow | null } {
  const latestDispute =
    [...task.disputes].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0] ?? null;

  if (latestDispute) {
    return { stage: latestDispute.status === "resolved" ? "settled" : "disputed", latestDispute };
  }
  if (task.validations.length > 0) return { stage: "approved", latestDispute: null };
  if (task.payments.some((p) => p.kind === "escrow") || task.status !== "assigned") {
    return { stage: "escrowed", latestDispute: null };
  }
  return { stage: "quoted", latestDispute: null };
}

function isBeforeDeadline(deadline: Date): boolean {
  return Date.now() < deadline.getTime();
}

function Stepper({ stage }: { stage: Stage }) {
  const disputed = stage === "disputed";
  const activeIndex = disputed
    ? STAGE_ORDER.findIndex((s) => s.key === "validated")
    : STAGE_ORDER.findIndex((s) => s.key === stage);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {STAGE_ORDER.map((s, i) => {
        const done = i < activeIndex || (i === activeIndex && !disputed);
        const isCurrent = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                disputed && isCurrent
                  ? "bg-red-500/15 text-red-400"
                  : done
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {disputed && isCurrent ? "Disputed" : s.label}
            </span>
            {i < STAGE_ORDER.length - 1 && <span className="text-zinc-700">→</span>}
          </div>
        );
      })}
    </div>
  );
}

type ResearchDeliverableShape = {
  overall_summary: string;
  findings: { title: string; url: string; summary: string; confidence: string }[];
};

function isResearchDeliverable(d: unknown): d is ResearchDeliverableShape {
  return (
    !!d &&
    typeof d === "object" &&
    Array.isArray((d as ResearchDeliverableShape).findings) &&
    typeof (d as ResearchDeliverableShape).overall_summary === "string"
  );
}

/** Renders the Research & Sourcing agent's real deliverable when present —
 * the actual sourced findings it found via live web search, not a summary
 * of the fact that validation ran. */
function ResearchDeliverableView({ deliverable }: { deliverable: unknown }) {
  if (!isResearchDeliverable(deliverable)) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
      <p className="text-xs font-medium text-cyan-400">Delivered by the Research & Sourcing agent</p>
      <p className="text-zinc-300">{deliverable.overall_summary}</p>
      <div className="space-y-1">
        {deliverable.findings.map((f, i) => (
          <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-emerald-400 hover:underline"
              >
                {f.title}
              </a>
              <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-zinc-300">
                {f.confidence} confidence
              </span>
            </div>
            <p className="mt-1 text-zinc-500">{f.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsList({ payments }: { payments: TaskDetail["payments"] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-zinc-500">No payments recorded for this task yet.</p>;
  }
  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
              {p.kind}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(p.status)}`}>
              {p.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="font-mono text-zinc-300">{formatUsdc(p.amount_usdc)}</span>
            {p.tx_hash ? (
              <a
                href={explorerTxUrl(p.tx_hash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-emerald-400 hover:underline"
              >
                {p.tx_hash.slice(0, 10)}… ↗
              </a>
            ) : (
              <span>on-chain tx pending</span>
            )}
            <span>{formatDate(p.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function VoteRow({ v }: { v: JudgeVoteRow }) {
  return (
    <div
      key={v.id}
      className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"
    >
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 ${
          v.choice === "favor_payer"
            ? "bg-emerald-500/15 text-emerald-400"
            : v.choice === "favor_payee"
              ? "bg-amber-500/15 text-amber-400"
              : "bg-zinc-700/40 text-zinc-300"
        }`}
      >
        {v.choice === "favor_payer" ? "Favor buyer" : v.choice === "favor_payee" ? "Favor seller" : "Abstain"}
      </span>
      <span className="flex-1 text-zinc-400">
        {v.model && <span className="mr-1 text-zinc-500">[{v.model}{v.effort ? ` @ ${v.effort}` : ""}]</span>}
        {v.rationale}
      </span>
    </div>
  );
}

function voteTally(votes: JudgeVoteRow[]): string {
  const favorPayer = votes.filter((v) => v.choice === "favor_payer").length;
  const favorPayee = votes.filter((v) => v.choice === "favor_payee").length;
  const abstain = votes.filter((v) => v.choice === "abstain").length;
  return `${favorPayer} favor buyer, ${favorPayee} favor seller${abstain ? `, ${abstain} abstained` : ""}`;
}

function JudgeVotesList({ votes }: { votes: JudgeVoteRow[] }) {
  if (votes.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No votes on record yet — panel selection happens on-chain (JudgeRegistry) and isn&apos;t
        mirrored here until a verdict is manually recorded.
      </p>
    );
  }

  // Real judge-panel rows carry `tier` (3 or 5) — use it to split an
  // escalated dispute's initial panel from its escalation panel. Older
  // demo-seeded rows never set `tier`; fall back to the length heuristic so
  // that seeded history still renders as before.
  const hasTierData = votes.some((v) => v.tier !== null);
  const tier1 = hasTierData ? votes.filter((v) => v.tier === 3) : votes.length > 3 ? [] : votes;
  const tier2 = hasTierData ? votes.filter((v) => v.tier === 5) : votes.length > 3 ? votes : [];
  const escalated = tier2.length > 0;

  if (!escalated) {
    const shown = hasTierData ? tier1 : votes;
    return (
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">
          {shown.length}-judge panel — {voteTally(shown)}
        </p>
        <div className="space-y-1">
          {shown.map((v) => (
            <VoteRow key={v.id} v={v} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">
          Initial 3-judge panel — split, no unanimous result — {voteTally(tier1)}
        </p>
        <div className="space-y-1">
          {tier1.map((v) => (
            <VoteRow key={v.id} v={v} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-zinc-500">
          Escalated to a 5-judge panel — ruling by majority — {voteTally(tier2)}
        </p>
        <div className="space-y-1">
          {tier2.map((v) => (
            <VoteRow key={v.id} v={v} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DisputeCard({
  dispute,
  judges,
  isBuyer,
  resubmitHref,
}: {
  dispute: DisputeRow & { judge_votes: JudgeVoteRow[] };
  judges: JudgeVoteRow[];
  isBuyer: boolean;
  resubmitHref?: string;
}) {
  const isContest = dispute.dispute_kind === "post_approval_contest";
  const feedback = dispute.educational_feedback as EducationalFeedback | RejectionFeedback | null;
  const rejectionFeedback =
    !isContest && feedback && "resubmission_context" in feedback ? feedback : null;
  const contestFeedback =
    isContest && feedback && "rewritten_specs" in feedback ? feedback : null;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-700/40 px-2.5 py-1 text-xs font-medium text-zinc-300">
          {isContest ? "Post-approval contest" : "Standard dispute"}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(dispute.status)}`}>
          {dispute.status}
        </span>
        {dispute.outcome !== "pending" && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              dispute.outcome === "favor_payer" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {dispute.outcome === "favor_payer" ? "Verdict: buyer wins" : "Verdict: seller wins"}
          </span>
        )}
        <span className="text-xs text-zinc-500">Filed {formatDate(dispute.created_at)}</span>
      </div>

      {dispute.reason && <p className="text-sm text-zinc-300">{dispute.reason}</p>}

      {isContest && dispute.validator_reasoning_snapshot != null && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
          <p className="mb-1 font-medium text-zinc-300">Validator&apos;s original auto-approve rationale</p>
          <pre className="whitespace-pre-wrap font-sans">
            {JSON.stringify(dispute.validator_reasoning_snapshot, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-zinc-400">Judge panel</p>
        <JudgeVotesList votes={judges} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-zinc-800 pt-2 text-xs text-zinc-500">
        {dispute.filing_fee_usdc !== null && (
          <span>Filing fee: {formatUsdc(dispute.filing_fee_usdc)}</span>
        )}
        {dispute.insurance_payout_usdc !== null && (
          <span>Insurance payout to buyer: {formatUsdc(dispute.insurance_payout_usdc)}</span>
        )}
        {dispute.resolved_at && <span>Resolved {formatDate(dispute.resolved_at)}</span>}
      </div>

      {isContest && dispute.outcome === "favor_payer" && contestFeedback && (
        <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-xs font-medium text-emerald-400">Educational feedback</p>
          <p className="text-sm text-zinc-300">{contestFeedback.gap_summary}</p>
          {contestFeedback.rewritten_specs?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Rewritten spec suggestions:</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-zinc-300">
                {contestFeedback.rewritten_specs.map((spec, i) => (
                  <li key={i}>{spec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {rejectionFeedback && (
        <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
          <p className="text-xs font-medium text-cyan-400">Why this was rejected</p>
          <p className="text-sm text-zinc-300">{rejectionFeedback.gap_summary}</p>
          {isBuyer && resubmitHref && (
            <Link
              href={resubmitHref}
              className="inline-block rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-400 transition hover:bg-cyan-500/25"
            >
              Resubmit as a new task →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function buildAgentRoster(task: TaskDetail): AgentEntry[] {
  const isRealAgent = isResearchSourcingListing(task.listings?.sla);
  const agents: AgentEntry[] = [
    {
      role: "Buyer agent",
      monogram: "B",
      colorClass: AGENT_COLOR.buyer,
      description: "Parsed the original request and commissioned this task.",
    },
    {
      role: "Estimator agent",
      monogram: "E",
      colorClass: AGENT_COLOR.estimator,
      description: "Produced the quote this task was funded against.",
    },
    {
      role: "Seller agent",
      monogram: "S",
      colorClass: AGENT_COLOR.seller,
      description: isRealAgent
        ? `${task.listings?.title} — a real worker: executes with Claude + live web search, not a placeholder.`
        : `${task.listings?.title ?? "Selected listing"} — simulated listing, no automated execution behind it.`,
    },
  ];

  if (task.validations.length > 0) {
    const latest = task.validations[task.validations.length - 1];
    agents.push({
      role: "Validator agent",
      monogram: "V",
      colorClass: AGENT_COLOR.validator,
      description:
        latest.outcome === "approved"
          ? "Checked the delivery against policy, task criteria, and SLA — auto-approved."
          : "Checked the delivery against policy, task criteria, and SLA — auto-filed a dispute.",
    });
  }

  const disputesWithVotes = task.disputes.filter((d) => d.judge_votes.length > 0);
  if (disputesWithVotes.length > 0) {
    const totalVotes = disputesWithVotes.reduce((n, d) => n + d.judge_votes.length, 0);
    const resolved = disputesWithVotes.filter((d) => d.status === "resolved");
    agents.push({
      role: "Judge panel",
      monogram: "J",
      colorClass: AGENT_COLOR.judges,
      description:
        resolved.length > 0
          ? `${totalVotes} judge agent${totalVotes === 1 ? "" : "s"} reviewed the dispute and reached a verdict.`
          : `${totalVotes} judge agent${totalVotes === 1 ? "" : "s"} drawn to review the dispute.`,
    });
  }

  return agents;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  if (!wallet) redirect("/dashboard");

  const { id } = await params;
  const task = await getTaskById(id, wallet.id);
  if (!task) notFound();

  const { stage, latestDispute } = deriveStage(task);
  const role = task.payer_wallet_id === wallet.id ? "Buyer" : "Seller";
  const jobId = (task.metadata as { erc8183_job_id?: string } | null)?.erc8183_job_id;
  const submissionError = (
    task.metadata as { submission_error?: { message: string; failed_at: string; circle_tx_id: string | null } } | null
  )?.submission_error;
  const sortedDisputes = [...task.disputes].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const agents = buildAgentRoster(task);
  const canRunAgent =
    role === "Buyer" &&
    isResearchSourcingListing(task.listings?.sla) &&
    task.validations.length === 0;

  let contestDeadline: Date | null = null;
  if (task.accepted_at) {
    contestDeadline = new Date(task.accepted_at);
    contestDeadline.setHours(contestDeadline.getHours() + contestWindowHours());
  }
  const canContest =
    role === "Buyer" &&
    stage === "approved" &&
    !latestDispute &&
    contestDeadline !== null &&
    isBeforeDeadline(contestDeadline);
  const contestFeeUsdc = computeContestFee(Number(task.guaranteed_total_usdc ?? 0));

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <TaskLiveUpdates active={stage !== "settled"} />
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div>
          <Link href="/tasks" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Task history
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{task.title}</h1>
                <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-300">
                  {role}
                </span>
              </div>
              {task.description && <p className="mt-1 text-sm text-zinc-400">{task.description}</p>}
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white">{formatUsdc(task.amount_usdc)}</div>
              {task.guaranteed_total_usdc !== null && (
                <div className="text-xs text-zinc-500">
                  Guaranteed total: {formatUsdc(task.guaranteed_total_usdc)}
                </div>
              )}
            </div>
          </div>
        </div>

        {submissionError && (
          <section className="space-y-1 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-red-400">
              On-chain delivery submission failed
            </p>
            <p className="text-sm text-red-300">{submissionError.message}</p>
            <p className="text-xs text-red-400/70">
              No validation was recorded for this task — the delivery never reached the escrow
              contract. Failed {formatDate(submissionError.failed_at)}
              {submissionError.circle_tx_id && (
                <>
                  {" "}· Circle tx <span className="font-mono">{submissionError.circle_tx_id}</span>
                </>
              )}
              . This needs manual attention (retry the submission or contact support) — it will not
              resolve on its own.
            </p>
          </section>
        )}

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <Stepper stage={stage} />
          {jobId && (
            <p className="mt-3 text-xs text-zinc-500">
              SnapBackEscrow job id: <span className="font-mono text-zinc-400">{jobId}</span>
            </p>
          )}
          {task.jobEvents.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-3">
              {task.jobEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                  <span>
                    <span className="font-mono text-zinc-300">{e.event_name}</span>
                    {" "}on-chain · {formatDate(e.created_at)}
                  </span>
                  {e.tx_hash && (
                    <a
                      href={explorerTxUrl(e.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      tx
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <AgentRoster agents={agents} />

        {canRunAgent && <DeliverButton taskId={task.id} />}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Escrow & payments</h2>
          <PaymentsList payments={task.payments} />
        </section>

        {task.validations.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-200">Validator runs</h2>
            <div className="space-y-2">
              {task.validations.map((v) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(v.outcome)}`}>
                      {v.outcome}
                    </span>
                    <span className="text-xs text-zinc-500">
                      policy {v.policy_pass ? "✓" : "✗"} · task {v.task_pass ? "✓" : "✗"} · SLA{" "}
                      {v.sla_pass ? "✓" : "✗"}
                    </span>
                  </div>
                  {v.rationale && <p className="mt-1 text-zinc-400">{v.rationale}</p>}
                  <ResearchDeliverableView deliverable={v.deliverable} />
                </div>
              ))}
            </div>
          </section>
        )}

        {sortedDisputes.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-200">
              {sortedDisputes.length > 1 ? "Disputes" : "Dispute"}
            </h2>
            <div className="space-y-3">
              {sortedDisputes.map((d) => {
                const feedback = d.educational_feedback as
                  | EducationalFeedback
                  | RejectionFeedback
                  | null;
                const resubmissionContext =
                  feedback && "resubmission_context" in feedback
                    ? feedback.resubmission_context
                    : null;
                const resubmitHref = resubmissionContext
                  ? `/?prefill=${encodeURIComponent(
                      `${task.description ?? task.title}\n\n${resubmissionContext}`,
                    )}`
                  : undefined;
                return (
                  <DisputeCard
                    key={d.id}
                    dispute={d}
                    judges={d.judge_votes}
                    isBuyer={role === "Buyer"}
                    resubmitHref={resubmitHref}
                  />
                );
              })}
            </div>
          </section>
        )}

        {stage === "approved" && !latestDispute && canContest && contestDeadline && (
          <ContestDeliveryButton
            taskId={task.id}
            feeUsdc={contestFeeUsdc}
            deadlineIso={contestDeadline.toISOString()}
          />
        )}

        {stage === "approved" && !latestDispute && !canContest && (
          <p className="text-xs text-zinc-500">
            {role === "Buyer" && contestDeadline
              ? "Approved — the post-approval contest window for this task has closed."
              : "Approved with no dispute filed. A buyer can still file a post-approval contest within the contest window if the delivery didn't match what was actually needed."}
          </p>
        )}
      </div>
    </main>
  );
}

import type { TaskDetail } from "@/lib/history";
import type { PaymentRow } from "@/lib/supabase/types";
import { ARC_CHAIN_ID } from "@/lib/arc";

/**
 * Plain-language presentation helpers for the admin task-history page.
 * Deliberately not "server-only" — the accordion is a client component and
 * needs these on already-fetched data, not a fresh query.
 */

/** One task's outcome in plain language, for the level-2 row badge. */
export function deriveOutcomeLabel(task: TaskDetail): string {
  const disputes = task.disputes ?? [];
  const openDispute = disputes.find((d) => d.status === "open" || d.status === "voting");
  if (openDispute) return "Disputed — pending resolution";

  const resolvedDispute = [...disputes]
    .sort((a, b) => new Date(b.resolved_at ?? 0).getTime() - new Date(a.resolved_at ?? 0).getTime())
    .find((d) => d.status === "resolved");
  if (resolvedDispute) {
    return resolvedDispute.outcome === "favor_payer" ? "Disputed — buyer won" : "Disputed — seller won";
  }

  if (task.status === "accepted" || task.status === "resolved") return "Completed";
  if (task.status === "cancelled") return "Cancelled";
  return "In progress";
}

/** Tailwind color class for the outcome badge. */
export function outcomeBadgeClass(label: string): string {
  if (label === "Completed" || label === "Disputed — buyer won" || label === "Disputed — seller won") {
    return "bg-emerald-500/15 text-emerald-400";
  }
  if (label === "Disputed — pending resolution") return "bg-amber-500/15 text-amber-400";
  if (label === "Cancelled") return "bg-red-500/15 text-red-400";
  return "bg-zinc-700/40 text-zinc-300";
}

const PAYMENT_KIND_LABELS: Record<string, string> = {
  deposit: "Gateway deposit",
  escrow: "Task escrow lock",
  release: "Escrow released",
  refund: "Escrow refunded",
  snapback: "Buyer snapped back",
  nanopayment: "Nanopayment",
  gas: "Gas",
  quote_fee: "Quote retry fee",
  treasury_sweep: "Treasury sweep",
  filing_fee: "Dispute filing fee",
  judge_fee: "Judge/arbitration fee",
  platform_fee: "Platform fee",
  insurance_payout: "Insurance payout",
  submission: "Deliverable submission (on-chain)",
  validation_fee: "Validator cost-recovery fee",
  dispute_contingency: "Dispute contingency (held)",
  marketplace_payment: "Real marketplace payment (Parallel)",
};

export function paymentKindLabel(kind: string): string {
  return PAYMENT_KIND_LABELS[kind] ?? kind;
}

/** True if this payment row has real on-chain evidence, not just a ledger entry. */
export function isOnChainConfirmed(payment: PaymentRow): boolean {
  return !!payment.tx_hash;
}

/**
 * True if this payment moved real money on a real mainnet, not Arc Testnet
 * like every other transfer in this app. Derived from `chain_id` alone — no
 * extra column needed, since every payment already carries the chain it
 * settled on and this is the only path that's ever anything but Arc.
 */
export function isRealMainnet(payment: PaymentRow): boolean {
  return payment.chain_id !== ARC_CHAIN_ID;
}

/**
 * Chronological, merged task timeline — replaces the old grouped-by-category
 * layout (Request / Validator verdict / Dispute / Money trail as separate
 * sections) with one top-to-bottom story. Every event carries its own real
 * timestamp so events from different tables (payments, job_events,
 * validations, disputes, judge_votes) interleave in the order they actually
 * happened, instead of being bucketed by which table they came from.
 */
export type TimelineMoney = {
  label: string;
  amountUsdc: number;
  onChain: boolean;
  txHash: string | null;
  /** Real mainnet USDC (Base), not Arc Testnet like every other line in this ledger — must render distinctly. */
  isRealMainnet: boolean;
};

export type TimelineEvent =
  | { id: string; at: string; kind: "submitted"; description: string | null; agent: string }
  | { id: string; at: string; kind: "quoted"; amountUsdc: number; accepted: boolean }
  | { id: string; at: string; kind: "funded"; items: TimelineMoney[] }
  | { id: string; at: string; kind: "job_event"; eventName: string; contract: string; txHash: string | null }
  | { id: string; at: string; kind: "validated"; outcome: string; rationale: string | null }
  | { id: string; at: string; kind: "settlement"; label: string; items: TimelineMoney[] }
  | {
      id: string;
      at: string;
      kind: "dispute_filed";
      disputeKind: "standard" | "post_approval_contest";
      reason: string | null;
      fee: TimelineMoney | null;
    }
  | { id: string; at: string; kind: "judge_votes"; votes: { choice: string; rationale: string | null }[] }
  | {
      id: string;
      at: string;
      kind: "dispute_resolved";
      disputeKind: "standard" | "post_approval_contest";
      outcome: "favor_payer" | "favor_payee" | "split" | "pending";
      forcedByAdmin: boolean;
      settlements: TimelineMoney[];
    }
  | { id: string; at: string; kind: "insurance_payout"; item: TimelineMoney }
  | { id: string; at: string; kind: "marketplace_payment"; item: TimelineMoney; succeeded: boolean; failureReason: string | null };

/** Payment kinds all collected together at task-funding time — shown as one grouped event. */
const FUNDING_KINDS = new Set(["escrow", "platform_fee", "validation_fee", "dispute_contingency", "quote_fee"]);

function toMoney(payment: PaymentRow, label: string): TimelineMoney {
  return {
    label,
    amountUsdc: payment.amount_usdc,
    onChain: isOnChainConfirmed(payment),
    txHash: payment.tx_hash,
    isRealMainnet: isRealMainnet(payment),
  };
}

/**
 * Same as toMoney, but for a held payment's *collection* moment specifically
 * (the funding-time lock, or a dispute's filing fee at filing time) — a held
 * payment that's since been refunded has its tx_hash overwritten with the
 * refund's tx (refundOrReleaseHeldPayment in lib/disputes/service.ts), with
 * the original preserved at metadata.collected_tx_hash. Without this, an
 * event describing what happened at collection time would show a tx that
 * didn't exist yet — the later refund's hash — which is wrong evidence for
 * that moment.
 */
function toMoneyAtCollection(payment: PaymentRow, label: string): TimelineMoney {
  const metadata = (payment.metadata ?? {}) as { collected_tx_hash?: string };
  const txHash = metadata.collected_tx_hash ?? payment.tx_hash;
  return {
    label,
    amountUsdc: payment.amount_usdc,
    onChain: !!txHash,
    txHash: txHash ?? null,
    isRealMainnet: isRealMainnet(payment),
  };
}

export function buildTaskTimeline(task: TaskDetail): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `${task.id}:submitted`,
    at: task.created_at,
    kind: "submitted",
    description: task.description,
    agent: task.listings?.title ?? "Unknown seller",
  });

  for (const q of task.quotes) {
    events.push({ id: `quote:${q.id}`, at: q.created_at, kind: "quoted", amountUsdc: q.amount_usdc, accepted: q.accepted });
  }

  const fundingPayments = task.payments.filter((p) => FUNDING_KINDS.has(p.kind));
  if (fundingPayments.length > 0) {
    const anchor = fundingPayments.reduce(
      (min, p) => (p.created_at < min ? p.created_at : min),
      fundingPayments[0].created_at,
    );
    events.push({
      id: `${task.id}:funded`,
      at: anchor,
      kind: "funded",
      items: fundingPayments.map((p) => toMoneyAtCollection(p, paymentKindLabel(p.kind))),
    });
  }

  for (const je of task.jobEvents) {
    events.push({ id: je.id, at: je.created_at, kind: "job_event", eventName: je.event_name, contract: je.contract, txHash: je.tx_hash });
  }

  for (const v of task.validations) {
    events.push({ id: v.id, at: v.created_at, kind: "validated", outcome: v.outcome, rationale: v.rationale });
  }

  const marketplacePayments = task.payments.filter((p) => p.kind === "marketplace_payment");
  for (const mp of marketplacePayments) {
    const succeeded = mp.status !== "failed";
    const metadata = (mp.metadata ?? {}) as { error?: string };
    events.push({
      id: mp.id,
      at: mp.created_at,
      kind: "marketplace_payment",
      item: toMoney(mp, paymentKindLabel(mp.kind)),
      succeeded,
      failureReason: succeeded ? null : (metadata.error ?? null),
    });
  }

  // The escrow lock's status transitioning away from "escrowed" (release /
  // refund / snapback, reconciled by the on-chain event webhook — see
  // lib/webhooks/handle-notification.ts) is a distinct later moment from the
  // funding-time lock above: same row, different point in time.
  const escrowPayment = task.payments.find((p) => p.kind === "escrow");
  if (escrowPayment && escrowPayment.status !== "escrowed" && escrowPayment.updated_at !== escrowPayment.created_at) {
    const label =
      escrowPayment.status === "released"
        ? "Escrow released to seller"
        : escrowPayment.status === "refunded"
          ? "Escrow refunded to buyer"
          : escrowPayment.status === "snapped_back"
            ? "Buyer snapped back (early reclaim)"
            : "Escrow settled";
    events.push({
      id: `${escrowPayment.id}:settled`,
      at: escrowPayment.updated_at,
      kind: "settlement",
      label,
      items: [toMoney(escrowPayment, label)],
    });
  }

  for (const d of task.disputes) {
    const filingFeePayment = task.payments.find((p) => p.id === d.filing_fee_payment_id) ?? null;

    events.push({
      id: `${d.id}:filed`,
      at: d.created_at,
      kind: "dispute_filed",
      disputeKind: d.dispute_kind,
      reason: d.reason,
      fee: filingFeePayment ? toMoneyAtCollection(filingFeePayment, "Filing fee") : null,
    });

    if (d.judge_votes.length > 0) {
      const votesAt = d.judge_votes.reduce((max, v) => (v.created_at > max ? v.created_at : max), d.judge_votes[0].created_at);
      events.push({
        id: `${d.id}:votes`,
        at: votesAt,
        kind: "judge_votes",
        votes: d.judge_votes.map((v) => ({ choice: v.choice, rationale: v.rationale })),
      });
    }

    if (d.status === "resolved" && d.resolved_at) {
      const settlements: TimelineMoney[] = [];
      if (filingFeePayment && filingFeePayment.status !== "escrowed") {
        settlements.push(toMoney(filingFeePayment, "Filing fee"));
      }
      const contingencyPayment = task.payments.find((p) => p.kind === "dispute_contingency" && p.status !== "escrowed");
      if (contingencyPayment) settlements.push(toMoney(contingencyPayment, "Dispute contingency"));

      events.push({
        id: `${d.id}:resolved`,
        at: d.resolved_at,
        kind: "dispute_resolved",
        disputeKind: d.dispute_kind,
        outcome: d.outcome,
        forcedByAdmin: d.judge_votes.length === 0,
        settlements,
      });

      if (d.dispute_kind === "post_approval_contest" && d.outcome === "favor_payer" && d.insurance_payout_payment_id) {
        const insurancePayment = task.payments.find((p) => p.id === d.insurance_payout_payment_id);
        if (insurancePayment) {
          events.push({
            id: `${d.id}:insurance`,
            at: insurancePayment.created_at,
            kind: "insurance_payout",
            item: toMoney(insurancePayment, "Insurance payout"),
          });
        }
      }
    }
  }

  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

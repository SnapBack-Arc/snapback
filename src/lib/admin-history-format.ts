import type { TaskDetail } from "@/lib/history";
import type { PaymentRow } from "@/lib/supabase/types";

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
};

export function paymentKindLabel(kind: string): string {
  return PAYMENT_KIND_LABELS[kind] ?? kind;
}

/** "Buyer" / "Seller" for a wallet id that belongs to this task, else null. */
function partyLabel(walletId: string | null, task: TaskDetail): string | null {
  if (!walletId) return null;
  if (walletId === task.payer_wallet_id) return "Buyer";
  if (walletId === task.payee_wallet_id) return "Seller";
  return null;
}

/** Plain-language "from -> to" for one payment row. */
export function paymentDirectionLabel(payment: PaymentRow, task: TaskDetail): string {
  const metadata = (payment.metadata ?? {}) as { treasury_address?: string };

  const from = partyLabel(payment.from_wallet_id, task) ?? (payment.from_wallet_id ? "Other wallet" : "—");
  let to = partyLabel(payment.to_wallet_id, task);
  if (!to) {
    if (metadata.treasury_address) {
      to = "Treasury";
    } else if (payment.kind === "escrow") {
      // The escrow lock row's to_wallet_id is always null (the contract
      // itself holds the funds, not another wallets row) — its real
      // destination is whichever way the job settled, tracked by this same
      // row's status transitioning as SnapBackEscrow events reconcile it
      // (see lib/webhooks/handle-notification.ts).
      if (payment.status === "escrowed") to = "Escrow (locked on-chain)";
      else if (payment.status === "released") to = "Seller";
      else if (payment.status === "refunded" || payment.status === "snapped_back") to = "Buyer";
      else to = "—";
    } else {
      to = payment.to_wallet_id ? "Other wallet" : "—";
    }
  }
  return `${from} → ${to}`;
}

/** True if this payment row has real on-chain evidence, not just a ledger entry. */
export function isOnChainConfirmed(payment: PaymentRow): boolean {
  return !!payment.tx_hash;
}

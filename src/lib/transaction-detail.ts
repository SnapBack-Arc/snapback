import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { BASE_CHAIN_ID, baseExplorerTxUrl } from "@/lib/base";
import { explorerTxUrl } from "@/lib/arc";

/**
 * Full behind-the-scenes detail for one nanopayment_validations row — the
 * data backing the dashboard's click-to-expand transaction modal. Joins the
 * row's three payment legs (nanopayment, validation fee, insurance payout)
 * by their FKs so real tx hashes/timestamps/amounts come along with it.
 */

export type TransactionPaymentLeg = {
  txHash: string | null;
  /** Picked per-leg by that payment's own chain_id — the nanopayment leg is
   *  real Base mainnet (lib/base.ts), the fee/payout legs are Arc Testnet
   *  (lib/arc.ts), so a single explorer link would be wrong for one of them. */
  explorerUrl: string | null;
  amountUsdc: number;
  status: string;
  createdAt: string;
};

export type TransactionDeliverableFinding = {
  title: string;
  url: string;
  summary: string;
  confidence: string;
};

export type TransactionDeliverable = {
  overall_summary: string;
  findings: TransactionDeliverableFinding[];
};

export type TransactionDetail = {
  id: string;
  walletId: string;
  instruction: string;
  site: string;
  verdict: "correct" | "incorrect";
  createdAt: string;
  /** null on rows recorded before reasoning/deliverable started being
   *  persisted — not an error, just nothing to show for that older row. */
  reasoning: string | null;
  answer: TransactionDeliverable | null;
  fees: {
    nanopaymentUsdc: number;
    validationFeeUsdc: number;
    payoutUsdc: number;
    /** Real per-call cost of the judge's own LLM call, when recorded. */
    judgeLlmCostUsdc: number | null;
  };
  payments: {
    nanopayment: TransactionPaymentLeg | null;
    validationFee: TransactionPaymentLeg | null;
    payout: TransactionPaymentLeg | null;
  };
};

type PaymentJoinRow = {
  tx_hash: string | null;
  amount_usdc: number;
  status: string;
  created_at: string;
  chain_id: number;
} | null;

type ValidationJoinRow = {
  id: string;
  wallet_id: string;
  instruction: string;
  site: string;
  verdict: "correct" | "incorrect";
  nanopayment_usdc: number;
  validation_fee_usdc: number;
  payout_usdc: number;
  created_at: string;
  metadata: unknown;
  nanopayment_payment: PaymentJoinRow;
  validation_fee_payment: PaymentJoinRow;
  payout_payment: PaymentJoinRow;
};

type StoredMetadata = {
  llm_cost?: { real_cost_usdc?: number | null };
  reasoning?: string;
  deliverable?: TransactionDeliverable;
};

function explorerUrlForChain(chainId: number, txHash: string | null): string | null {
  if (!txHash) return null;
  return chainId === BASE_CHAIN_ID ? baseExplorerTxUrl(txHash) : explorerTxUrl(txHash);
}

function toLeg(payment: PaymentJoinRow): TransactionPaymentLeg | null {
  if (!payment) return null;
  return {
    txHash: payment.tx_hash,
    explorerUrl: explorerUrlForChain(payment.chain_id, payment.tx_hash),
    amountUsdc: Number(payment.amount_usdc),
    status: payment.status,
    createdAt: payment.created_at,
  };
}

/** Fetches one transaction's full detail by id, unscoped by wallet — callers
 *  (the API route) are responsible for the ownership/admin check before
 *  handing the result back to a client. */
export async function getTransactionDetail(id: string): Promise<TransactionDetail | null> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("nanopayment_validations")
    .select(
      `id, wallet_id, instruction, site, verdict, nanopayment_usdc, validation_fee_usdc, payout_usdc, created_at, metadata,
       nanopayment_payment:payments!nanopayment_validations_nanopayment_payment_id_fkey(tx_hash, amount_usdc, status, created_at, chain_id),
       validation_fee_payment:payments!nanopayment_validations_validation_fee_payment_id_fkey(tx_hash, amount_usdc, status, created_at, chain_id),
       payout_payment:payments!nanopayment_validations_payout_payment_id_fkey(tx_hash, amount_usdc, status, created_at, chain_id)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as ValidationJoinRow;
  const metadata = (row.metadata ?? {}) as StoredMetadata;

  return {
    id: row.id,
    walletId: row.wallet_id,
    instruction: row.instruction,
    site: row.site,
    verdict: row.verdict,
    createdAt: row.created_at,
    reasoning: metadata.reasoning ?? null,
    answer: metadata.deliverable ?? null,
    fees: {
      nanopaymentUsdc: Number(row.nanopayment_usdc),
      validationFeeUsdc: Number(row.validation_fee_usdc),
      payoutUsdc: Number(row.payout_usdc),
      judgeLlmCostUsdc: metadata.llm_cost?.real_cost_usdc ?? null,
    },
    payments: {
      nanopayment: toLeg(row.nanopayment_payment),
      validationFee: toLeg(row.validation_fee_payment),
      payout: toLeg(row.payout_payment),
    },
  };
}

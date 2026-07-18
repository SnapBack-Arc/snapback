import type { PolicyRow } from "@/lib/supabase/types";

/**
 * Fee-inclusive quote math.
 *
 * Three fee components apply to a quote:
 *   - happy-path platform skim: a % of the seller's quoted amount, paid by
 *     the buyer, folded into the headline `guaranteed_total_usdc`.
 *   - validation fee: a FIXED per-task charge recovering the real cost of
 *     the buyer-agent validator's LLM call (lib/validator.ts) — every real
 *     submission runs this call exactly once, whether it approves or
 *     rejects, so unlike the happy-path skim it can't be a % of price
 *     (measured real cost is ~$0.016-0.02/call regardless of task size —
 *     on a sub-$1 task the % skim alone recovers a small fraction of a
 *     cent). Also folded into `guaranteed_total_usdc`, always charged (not
 *     contingent on a dispute like the arbitration fee below).
 *   - contingent arbitration fee: only charged if a dispute occurs, disclosed
 *     alongside but never folded into guaranteed_total_usdc. Rate depends on
 *     the micro/large transaction tier (the same tier a filing fee will key
 *     off of in the dispute flow).
 */

export function happyPathFeePct(): number {
  return Number(process.env.ESTIMATOR_HAPPY_PATH_FEE_PCT ?? "0.00075");
}

/** Fixed per-task charge recovering the validator's real LLM-call cost. */
export function validationFeeUsdc(): number {
  return Number(process.env.ESTIMATOR_VALIDATION_FEE_USDC ?? "0.03");
}

export function microTxThresholdUsdc(): number {
  return Number(process.env.ESTIMATOR_MICRO_TX_THRESHOLD_USDC ?? "50");
}

export function arbitrationFeePctMicro(): number {
  return Number(process.env.ESTIMATOR_ARBITRATION_FEE_PCT_MICRO ?? "0.02");
}

export function arbitrationFeePctLarge(): number {
  return Number(process.env.ESTIMATOR_ARBITRATION_FEE_PCT_LARGE ?? "0.01");
}

/** Micro-vs-large transaction fee tier, keyed off the seller cost estimate. */
export function arbitrationFeePct(sellerCostEstimateUsdc: number): number {
  return sellerCostEstimateUsdc < microTxThresholdUsdc()
    ? arbitrationFeePctMicro()
    : arbitrationFeePctLarge();
}

export type GuaranteedQuote = {
  seller_cost_estimate_usdc: number;
  happy_path_fee_usdc: number;
  validation_fee_usdc: number;
  guaranteed_total_usdc: number;
  disclosed_contingent_fee_pct: number;
};

export function computeGuaranteedQuote(sellerCostEstimateUsdc: number): GuaranteedQuote {
  const happyPathFeeUsdc = Number(
    (sellerCostEstimateUsdc * happyPathFeePct()).toFixed(6),
  );
  const validationFee = validationFeeUsdc();
  const contingentPct = arbitrationFeePct(sellerCostEstimateUsdc);
  return {
    seller_cost_estimate_usdc: sellerCostEstimateUsdc,
    happy_path_fee_usdc: happyPathFeeUsdc,
    validation_fee_usdc: validationFee,
    guaranteed_total_usdc: Number(
      (sellerCostEstimateUsdc + happyPathFeeUsdc + validationFee).toFixed(6),
    ),
    disclosed_contingent_fee_pct: contingentPct,
  };
}

/** Human-readable disclosure line, shown alongside (never folded into) the headline total. */
export function contingentDisclosureLine(pct: number): string {
  const pctLabel = (pct * 100).toFixed(pct * 100 < 1 ? 2 : 0);
  return `+ an estimated ${pctLabel}% arbitration fee if a dispute occurs (does not affect your refundable base amount)`;
}

export type BudgetCeilingCheck = {
  within_ceiling: boolean;
  policy_max_amount_usdc: number | null;
};

/** guaranteed_total_usdc is the figure checked against the standing policy's per-task ceiling. */
export function evaluateBudgetCeiling(
  policy: Pick<PolicyRow, "max_amount_usdc"> | null,
  guaranteedTotalUsdc: number,
): BudgetCeilingCheck {
  const ceiling = policy?.max_amount_usdc ?? null;
  return {
    within_ceiling: ceiling === null || guaranteedTotalUsdc <= Number(ceiling),
    policy_max_amount_usdc: ceiling === null ? null : Number(ceiling),
  };
}

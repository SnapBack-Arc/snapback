import type { PolicyRow } from "@/lib/supabase/types";

/**
 * Fee-inclusive quote math.
 *
 * Four fee components apply to a quote:
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
 *   - dispute-insurance premium: a FIXED-rate, always-charged, NEVER-refunded
 *     % of the seller cost estimate, folded into `guaranteed_total_usdc`
 *     alongside the two fees above. Funds the platform's full-refund
 *     guarantee on a buyer-won standard dispute — real Claude+Parallel
 *     execution cost (lib/agents/research-sourcing.ts) is spent immediately
 *     at delivery time, before any dispute exists, and the entire job-cost
 *     escrow (including its 1.5x cost buffer) refunds to the buyer on a win,
 *     recovering none of it. See disputeInsurancePremiumPct below for the
 *     sizing math. Structurally this belongs here, not with the contingent
 *     arbitration fee below — it's unconditional, not dispute-triggered.
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

/**
 * Dispute-insurance premium rate, as a % of the seller cost estimate.
 *
 * PROVISIONAL, not a permanent number — derived from a genuinely thin
 * sample (8 real disputes total, ever) and meant to be revised once real
 * dispute volume grows past single digits. Sizing math: the existing 1.5x
 * cost buffer alone breaks even up to a 33.3% buyer-win rate (at raw cost C,
 * a kept job pays 0.5C margin, a refunded job loses the full C — solving
 * (1-p)(0.5C) = p(C) gives p = 1/3). The measured organic rate is 37.5% (3
 * buyer wins of 8 real disputes, test-scaffolding excluded). Solving for the
 * additional flat premium F needed to break even at that rate:
 * F = C(1.5p - 0.5) = C(1.5×0.375 - 0.5) = 0.0625C — 6.25% of raw cost, or
 * (since job cost = 1.5C) 0.0625/1.5 ≈ 4.17% of the seller cost estimate.
 * Deliberately not sized against the higher (and even thinner, n=4)
 * standard-dispute-only rate of 75% — starting conservative here rather
 * than risk reading as margin-padding on a number this uncertain.
 */
export function disputeInsurancePremiumPct(): number {
  return Number(process.env.ESTIMATOR_DISPUTE_INSURANCE_PREMIUM_PCT ?? "0.0417");
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
  dispute_insurance_premium_usdc: number;
  guaranteed_total_usdc: number;
  disclosed_contingent_fee_pct: number;
};

export function computeGuaranteedQuote(sellerCostEstimateUsdc: number): GuaranteedQuote {
  const happyPathFeeUsdc = Number(
    (sellerCostEstimateUsdc * happyPathFeePct()).toFixed(6),
  );
  const validationFee = validationFeeUsdc();
  const disputeInsurancePremiumUsdc = Number(
    (sellerCostEstimateUsdc * disputeInsurancePremiumPct()).toFixed(6),
  );
  const contingentPct = arbitrationFeePct(sellerCostEstimateUsdc);
  return {
    seller_cost_estimate_usdc: sellerCostEstimateUsdc,
    happy_path_fee_usdc: happyPathFeeUsdc,
    validation_fee_usdc: validationFee,
    dispute_insurance_premium_usdc: disputeInsurancePremiumUsdc,
    guaranteed_total_usdc: Number(
      (sellerCostEstimateUsdc + happyPathFeeUsdc + validationFee + disputeInsurancePremiumUsdc).toFixed(6),
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

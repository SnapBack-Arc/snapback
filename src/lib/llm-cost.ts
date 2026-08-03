/**
 * Real per-model Claude pricing, used only to turn the token usage now
 * logged on judge_votes/validations (see supabase/migrations/
 * 20260725043613_llm_call_usage.sql) into an approximate USD cost for the
 * admin dashboard's "average cost per call type" stat.
 *
 * Standard published rates, not the temporary Sonnet 5 introductory price
 * (Anthropic's $2/$10-per-MTok rate through 2026-08-31) — an admin stat that
 * silently changes its own unit when a promo expires is worse than one that's
 * a little conservative today. Verified against platform.claude.com,
 * same source and reasoning as lib/agents/research-sourcing-pricing.ts's
 * OPUS_INPUT_USD_PER_MTOK/OPUS_OUTPUT_USD_PER_MTOK (not reused directly —
 * that file's estimate is pre-task pricing input to escrow amounts, a
 * different concern from this post-hoc telemetry average).
 */

const RATES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Real USD cost for one call, or null if the model has no known rate (logs a call type this table hasn't been updated for, rather than silently mis-pricing it). */
export function estimateCallCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number } | null | undefined,
): number | null {
  if (!usage) return null;
  const rate = RATES_USD_PER_MTOK[model];
  if (!rate) return null;
  return (usage.input_tokens / 1_000_000) * rate.input + (usage.output_tokens / 1_000_000) * rate.output;
}

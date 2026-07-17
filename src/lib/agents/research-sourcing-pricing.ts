/**
 * Real cost model for the Research & Sourcing agent (lib/agents/research-sourcing.ts).
 *
 * No "server-only" here deliberately: both the submission flow's price
 * display (client) and task creation's actual escrow amount (server) must
 * charge the exact same number, or the price shown at quote time would lie
 * about what the buyer is actually charged.
 *
 * Priced from the agent's real shape (research-sourcing.ts): two
 * claude-opus-4-8 calls (a tool-using research call, then a low-effort
 * structuring call) plus N web_search calls. Rates verified live against
 * platform.claude.com on 2026-07-17: Opus 4.8 is $5/$25 per MTok
 * input/output; web_search is $10 per 1,000 searches ($0.01/search), billed
 * in addition to the tokens search results consume. There is no per-task
 * telemetry to calibrate against yet, so token counts below are a
 * from-the-shape estimate, not a measurement — the 1.5x buffer exists to
 * absorb that estimation error, not as a profit margin.
 */

const OPUS_INPUT_USD_PER_MTOK = 5;
const OPUS_OUTPUT_USD_PER_MTOK = 25;
const WEB_SEARCH_USD_PER_SEARCH = 0.01;

// Estimation-error / overhead buffer over the raw compute estimate below.
// Deliberately modest — the point of this pricing is honesty about real
// cost, not a profit-seeking markup.
const COST_BUFFER_MULTIPLIER = 1.5;

/**
 * How many web searches a task of this shape plausibly takes: scales with
 * both difficulty (1-5, already used for Estimator gating) and how many
 * items the request asks for (scope_quantity, e.g. "5 suppliers" -> 5).
 * Capped at 10 — beyond that, more searches stop meaningfully improving a
 * single research pass and this is a cost model, not a scheduler.
 */
function estimateSearchCount(difficulty: number, scopeQuantity: number | null): number {
  const d = Math.min(5, Math.max(1, Math.round(difficulty)));
  const scopeSearches = scopeQuantity ? Math.ceil(scopeQuantity / 5) : 0;
  return Math.min(10, d + scopeSearches);
}

/**
 * Real per-task cost estimate in USDC for the Research & Sourcing agent,
 * given the same difficulty/scope_quantity the Estimator already parses
 * (lib/estimator/parser.ts). Used both to display the quoted price and to
 * set the actual escrowed amount at task creation (lib/tasks/create.ts) —
 * those two call sites must never diverge.
 */
export function estimateResearchSourcingCostUsdc(
  difficulty: number,
  scopeQuantity: number | null,
): number {
  const d = Math.min(5, Math.max(1, Math.round(difficulty)));
  const searches = estimateSearchCount(d, scopeQuantity);

  // Research call: system prompt + task text + tool overhead, plus the
  // content of each search result the model reads before writing the report.
  const researchInputTokens = 300 + searches * 700;
  const researchOutputTokens = 400 + d * 80 + searches * 60;

  // Structure call: the report text feeds back in as input, plus the
  // sources list and original request; low-effort structured JSON output.
  const structureInputTokens = researchOutputTokens + 300 + searches * 80;
  const structureOutputTokens = 350 + d * 40;

  const inputTokens = researchInputTokens + structureInputTokens;
  const outputTokens = researchOutputTokens + structureOutputTokens;

  const tokenCostUsd =
    (inputTokens / 1_000_000) * OPUS_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOK;
  const searchCostUsd = searches * WEB_SEARCH_USD_PER_SEARCH;

  const rawCostUsd = tokenCostUsd + searchCostUsd;
  const bufferedUsd = rawCostUsd * COST_BUFFER_MULTIPLIER;

  return Math.max(0.01, Math.ceil(bufferedUsd * 100) / 100);
}

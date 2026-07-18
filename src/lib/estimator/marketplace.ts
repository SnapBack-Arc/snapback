import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ParsedSpec } from "@/lib/estimator/parser";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { estimateResearchSourcingCostUsdc } from "@/lib/agents/research-sourcing-pricing";

/**
 * Pulls a seller cost estimate from comparable active Marketplace listings.
 *
 * There's no category taxonomy on `listings` yet — matching is a simple
 * ILIKE against the parsed spec's subject, falling back to the cheapest
 * active listings overall if nothing matches by text. This is a stand-in for
 * real search (embeddings, a category field); flagged separately as a gap.
 *
 * What gets matched is almost all simulated placeholder inventory — see
 * README.md "Simulated vs. real sellers". Only the listing tagged
 * `sla.agent === "research-sourcing"` (lib/listing-agents.ts) has a genuine
 * worker behind it (lib/agents/research-sourcing.ts); everything else this
 * function can return just sits funded with no execution behind it.
 *
 * PRIORITY FIX: when a matched listing is Research & Sourcing, its
 * contribution to the estimate is the real per-task price
 * (research-sourcing-pricing.ts), not its static seed `price_usdc` — the
 * static seed value used to feed straight into `guaranteed_total_usdc` (the
 * "Guaranteed total" the buyer sees at quote time), which could — and did,
 * confirmed live — diverge from the real price shown on the same page's
 * "Choose a seller" card and from what the buyer was actually charged at
 * task creation (lib/tasks/create.ts already used the real formula there).
 * Same task, two different prices on one screen. Substituting here keeps
 * both call sites reading from the exact same pricing function.
 */

export type SellerCostEstimate = {
  seller_cost_estimate_usdc: number;
  matched_listing_ids: string[];
  /** "keyword": at least one listing actually matched the spec's subject.
   *  "fallback": nothing matched — these are just the cheapest active
   *  listings overall, not a real recommendation. Callers that present a
   *  matched listing as "auto-selected for this task" must check this
   *  first — presenting a fallback pick as a real match is misleading. */
  match_type: "keyword" | "fallback";
};

const MAX_COMPARABLES = 3;
// A single real keyword match is still a real match — it must never be
// discarded in favor of padding the average with irrelevant cheap listings.
// (This used to be 2, which silently threw away the one relevant listing
// whenever a spec only matched exactly one seller — a real bug, not a
// deliberate averaging-stability choice: discarding a correct match to
// blend in random filler makes the estimate worse, not more stable.)
const MIN_COMPARABLES = 1;

export async function estimateSellerCost(
  spec: Pick<ParsedSpec, "subject" | "subject_key" | "difficulty" | "scope_quantity">,
): Promise<SellerCostEstimate> {
  const supabase = createServiceSupabase();

  const keywords = spec.subject_key.split("-").filter((w) => w.length > 2);
  const orFilter = keywords
    .map((w) => `title.ilike.%${w}%,description.ilike.%${w}%`)
    .join(",");

  let matches: { id: string; price_usdc: number | null; sla: unknown }[] = [];
  if (orFilter) {
    const { data } = await supabase
      .from("listings")
      .select("id, price_usdc, sla")
      .eq("active", true)
      .not("price_usdc", "is", null)
      .or(orFilter)
      .order("price_usdc", { ascending: true })
      .limit(MAX_COMPARABLES);
    matches = data ?? [];
  }

  const matchType: "keyword" | "fallback" =
    matches.length >= MIN_COMPARABLES ? "keyword" : "fallback";

  // Not enough subject matches — fall back to the cheapest active listings
  // overall so a quote is still possible, rather than failing the request.
  if (matchType === "fallback") {
    const { data } = await supabase
      .from("listings")
      .select("id, price_usdc, sla")
      .eq("active", true)
      .not("price_usdc", "is", null)
      .order("price_usdc", { ascending: true })
      .limit(MAX_COMPARABLES);
    matches = data ?? [];
  }

  if (matches.length === 0) {
    throw new Error(
      "No comparable Marketplace sellers found — cannot produce a cost estimate yet.",
    );
  }

  // Research & Sourcing's real per-task price, not its static seed
  // price_usdc — see this file's docblock for why.
  const prices = matches.map((m) =>
    isResearchSourcingListing(m.sla)
      ? estimateResearchSourcingCostUsdc(spec.difficulty, spec.scope_quantity)
      : Number(m.price_usdc),
  );
  const average = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  return {
    seller_cost_estimate_usdc: Number(average.toFixed(6)),
    matched_listing_ids: matches.map((m) => m.id),
    match_type: matchType,
  };
}

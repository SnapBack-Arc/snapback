import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ParsedSpec } from "@/lib/estimator/parser";
import type { CategoryKey } from "@/lib/categories";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { estimateResearchSourcingCostUsdc } from "@/lib/agents/research-sourcing-pricing";

/**
 * Pulls a seller cost estimate from comparable active Marketplace listings
 * within the buyer's chosen category — an exact `category` filter, not a
 * text guess. `category` is always `research_sourcing` today (see
 * lib/categories.ts — the one live category, no picker step needed), so by
 * the time this runs there's no ambiguity left to fall back from: a category
 * with no active listings is a real error (nothing sellable exists), not a
 * "couldn't find a match" case to paper over with irrelevant cheap listings
 * from other categories.
 *
 * The listing tagged `sla.agent === "research-sourcing"`
 * (lib/listing-agents.ts) is SnapBack's one real integration — see README.md
 * "Research & Sourcing — the one real integration".
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
};

const MAX_COMPARABLES = 3;

export async function estimateSellerCost(
  spec: Pick<ParsedSpec, "difficulty" | "scope_quantity">,
  category: CategoryKey,
): Promise<SellerCostEstimate> {
  const supabase = createServiceSupabase();

  const { data } = await supabase
    .from("listings")
    .select("id, price_usdc, sla")
    .eq("active", true)
    .eq("category", category)
    .not("price_usdc", "is", null)
    .order("price_usdc", { ascending: true })
    .limit(MAX_COMPARABLES);
  const matches = data ?? [];

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
  };
}

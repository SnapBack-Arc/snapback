/**
 * SnapBack demonstrates its dispute-resolution/escrow/judge-panel safety
 * layer through exactly one real integration — Research & Sourcing
 * (lib/agents/research-sourcing.ts) — not a marketplace catalog. This is the
 * single source of truth for that category's display label: every other
 * place in the app that names it (listing title, agent UI copy, admin
 * actions) derives from LIVE_CATEGORY below rather than re-typing the
 * string. `description` still has a real consumer — estimator/parser.ts's
 * category-fit system prompt — not just the (now-removed) picker card.
 */

export type CategoryKey = "research_sourcing";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  description: string;
};

export const CATEGORIES: CategoryDef[] = [
  {
    key: "research_sourcing",
    label: "Research & Sourcing",
    description:
      "Finds and compares sources, suppliers, or vendors for your request using live web search.",
  },
];

/** Guaranteed non-optional reference to the one live category. */
export const LIVE_CATEGORY: CategoryDef = CATEGORIES[0];

export function findCategory(key: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

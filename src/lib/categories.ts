/**
 * Fixed category taxonomy for task submission. Every listing belongs to
 * exactly one of these (see supabase/migrations for the `listing_category`
 * enum, mirrored here — the two must be kept in sync by hand since there's
 * no codegen link between a Postgres enum and this array).
 *
 * Only Research & Sourcing has a genuine worker behind it
 * (lib/agents/research-sourcing.ts) — every other category is shown in the
 * picker so buyers can see what's planned, but is COMING_SOON and must never
 * be selectable past the picker step. No "server-only" here: both the
 * client-side picker and the server-side quote route need the same
 * live/coming-soon truth, and it does nothing but read a plain array.
 */

export type CategoryKey =
  | "research_sourcing"
  | "copywriting_content"
  | "market_research_report"
  | "icon_illustration_design"
  | "data_engineering_scripts";

export type CategoryStatus = "live" | "coming_soon";

export type CategoryDef = {
  key: CategoryKey;
  label: string;
  description: string;
  status: CategoryStatus;
};

export const CATEGORIES: CategoryDef[] = [
  {
    key: "research_sourcing",
    label: "Research & Sourcing",
    description:
      "Finds and compares sources, suppliers, or vendors for your request using live web search.",
    status: "live",
  },
  {
    key: "copywriting_content",
    label: "Copywriting & content",
    description: "Web copy, email sequences, and marketing content matching your brand voice guide.",
    status: "coming_soon",
  },
  {
    key: "market_research_report",
    label: "Market research report",
    description: "Structured research reports on any market or competitor set, delivered as a table.",
    status: "coming_soon",
  },
  {
    key: "icon_illustration_design",
    label: "Icon & illustration design",
    description: "Custom icon sets and illustrations in SVG, matched to your style reference.",
    status: "coming_soon",
  },
  {
    key: "data_engineering_scripts",
    label: "Data engineering & scripts",
    description: "One-off scripts for data migration, cleaning, and transformation.",
    status: "coming_soon",
  },
];

export function findCategory(key: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

export function isLiveCategory(key: string): boolean {
  return findCategory(key)?.status === "live";
}

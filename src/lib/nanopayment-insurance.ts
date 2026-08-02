import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * SnapBack's actual core loop: an agent-to-agent nanopayment happens, gets
 * validated, and — if flagged incorrect — the user is insured for it. No
 * escrow, no dispute filing, no judge panel; just a paid nanopayment, one
 * real judged verdict, and (on a miss) a real payout.
 *
 * The payout is priced off the paid site's aggregate correctness rate,
 * computed live from every wallet's past validations against that site (see
 * nanopayment_validations) — a site that's almost always right pays more on
 * its rare misses; a site that's often wrong pays less per miss, since a
 * miss there is unsurprising. Bayesian-smoothed toward a neutral prior so a
 * site with only one or two validations on record doesn't swing to an
 * extreme multiplier off a tiny sample.
 */

/** The one real paid data source this app validates today (see
 *  lib/agents/parallel-client.ts) — a single named site, not per-listing,
 *  since this app only has one real integration to aggregate reliability
 *  for. */
export const NANOPAYMENT_SITE = "parallel.ai";

const PRIOR_CORRECT_RATE = 0.75;
const PRIOR_WEIGHT = 5;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 2;

export type SiteReliability = {
  site: string;
  correctCount: number;
  totalCount: number;
  /** Bayesian-smoothed correctness rate, blended toward PRIOR_CORRECT_RATE
   *  when totalCount is small — always in [0, 1]. */
  smoothedCorrectRate: number;
};

/** Aggregate correctness rate for a site across every wallet's past
 *  validations — real cross-user data, not scoped to the current wallet. */
export async function getSiteReliability(site: string): Promise<SiteReliability> {
  const supabase = createServiceSupabase();
  const { data } = await supabase.from("nanopayment_validations").select("verdict").eq("site", site);

  const rows = data ?? [];
  const totalCount = rows.length;
  const correctCount = rows.filter((r) => r.verdict === "correct").length;

  const smoothedCorrectRate =
    (correctCount + PRIOR_WEIGHT * PRIOR_CORRECT_RATE) / (totalCount + PRIOR_WEIGHT);

  return { site, correctCount, totalCount, smoothedCorrectRate };
}

/** 1x (site is often wrong — a miss here is unsurprising, refund just the
 *  charge) up to 2x (site is almost always right — a miss here is a real
 *  surprise, worth insuring beyond the bare charge). */
export function payoutMultiplier(smoothedCorrectRate: number): number {
  const multiplier = 1 + smoothedCorrectRate;
  return Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
}

export function computePayoutUsdc(nanopaymentUsdc: number, reliability: SiteReliability): number {
  if (nanopaymentUsdc <= 0) return 0;
  return nanopaymentUsdc * payoutMultiplier(reliability.smoothedCorrectRate);
}

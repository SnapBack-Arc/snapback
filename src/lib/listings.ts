import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow } from "@/lib/supabase/types";

/** All active Marketplace listings, cheapest first — the general browse view. */
export async function getActiveListings(): Promise<ListingRow[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("active", true)
    .order("price_usdc", { ascending: true });
  if (error) throw new Error(`Failed to load listings: ${error.message}`);
  return data ?? [];
}

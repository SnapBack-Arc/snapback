import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveListings } from "@/lib/listings";

/**
 * GET /api/listings
 * All active Marketplace listings, cheapest first. Used both by the
 * standalone /marketplace browse page and by the homepage's seller-picker
 * step (which cross-references session.matched_listing_ids from the quote
 * response against this list to render the auto-selected pick).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  try {
    const listings = await getActiveListings();
    return NextResponse.json({ listings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load listings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

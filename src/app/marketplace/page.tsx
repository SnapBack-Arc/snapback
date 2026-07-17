import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";
import { getActiveListings } from "@/lib/listings";
import { formatUsdc } from "@/lib/format";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { estimateResearchSourcingCostUsdc } from "@/lib/agents/research-sourcing-pricing";

// The cheapest a real Research & Sourcing quote can come out to (difficulty
// 1, no scope_quantity) — the floor of the same per-task pricing function
// the submission flow charges from, not a hand-picked number that could
// drift out of sync with it.
const RESEARCH_SOURCING_FLOOR_USDC = estimateResearchSourcingCostUsdc(1, null);

function slaSummary(sla: unknown): string | null {
  if (!sla || typeof sla !== "object") return null;
  const entries = Object.entries(sla as Record<string, unknown>).filter(
    // `agent` is an internal marker (see lib/listing-agents.ts), not a real
    // SLA term — shown separately as the "Real agent" badge below instead.
    ([k, v]) => k !== "agent" && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
  );
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export default async function MarketplacePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const listings = await getActiveListings();

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Active sellers and their published SLAs. Reputation tracking isn&apos;t live yet — every
            seller shows as new until real task history accrues.
          </p>
        </div>

        {listings.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
            No active listings yet.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {listings.map((listing) => {
              const sla = slaSummary(listing.sla);
              return (
                <div
                  key={listing.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-white">{listing.title}</h2>
                      {isResearchSourcingListing(listing.sla) && (
                        <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-400">
                          Real agent
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm text-zinc-200">
                      {isResearchSourcingListing(listing.sla)
                        ? `from ~${formatUsdc(RESEARCH_SOURCING_FLOOR_USDC)} (priced per task)`
                        : formatUsdc(listing.price_usdc)}
                    </span>
                  </div>
                  {listing.description && (
                    <p className="mt-1 text-sm text-zinc-400">{listing.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>Reputation: New seller</span>
                    {sla && <span>SLA — {sla}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingRow } from "@/lib/supabase/types";
import { formatUsdc } from "@/lib/format";
import AgentRoster, { AGENT_COLOR, type AgentEntry } from "@/components/AgentRoster";
import { isResearchSourcingListing } from "@/lib/listing-agents";

type GateResult = "original" | "retry_free" | "retry_charged" | "topic_change";

type QuoteResponse = {
  gate_result: GateResult;
  attempt_no: number;
  charged_usdc: number;
  swept: { session_id: string; amount_usdc: number } | null;
  quote: {
    guaranteed_total_usdc: number;
    seller_cost_estimate_usdc: number;
    happy_path_fee_usdc: number;
    disclosed_contingent_fee_pct: number;
    contingent_disclosure: string | null;
    within_budget_ceiling: boolean;
    policy_max_amount_usdc: number | null;
  };
  session: {
    id: string;
    subject: string;
    difficulty: number;
    scope_quantity: number | null;
    attempt_count: number;
    escrow_held_usdc: number;
    matched_listing_ids: string[];
    seller_match_type: "keyword" | "fallback";
  };
};

const GATE_LABEL: Record<GateResult, string> = {
  original: "First submission — free",
  retry_free: "Free retry",
  retry_charged: "Charged retry",
  topic_change: "Topic changed",
};

function sellerRankLabel(sla: unknown): string | null {
  if (!sla || typeof sla !== "object") return null;
  const entries = Object.entries(sla as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean",
  );
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

export default function TaskSubmissionFlow() {
  const router = useRouter();

  const [specText, setSpecText] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [listings, setListings] = useState<ListingRow[] | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!specText.trim()) return;
    setQuoting(true);
    setQuoteError(null);
    try {
      const res = await fetch("/api/estimator/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: specText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to get a quote");
      const result = body as QuoteResponse;
      setQuote(result);
      setTitle((prev) => prev || result.session.subject);

      // Fetch the marketplace once we have a quote, so the auto-selected
      // pick can be cross-referenced against session.matched_listing_ids.
      const listingsRes = await fetch("/api/listings");
      const listingsBody = await listingsRes.json();
      if (!listingsRes.ok) throw new Error(listingsBody.error ?? "Failed to load listings");
      const activeListings = listingsBody.listings as ListingRow[];
      setListings(activeListings);
      setListingsError(null);

      const matched = result.session.matched_listing_ids
        .map((id) => activeListings.find((l) => l.id === id))
        .find((l): l is ListingRow => Boolean(l));
      setSelectedListingId(matched?.id ?? activeListings[0]?.id ?? null);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Failed to get a quote");
      setListingsError(null);
    } finally {
      setQuoting(false);
    }
  }

  async function submitForReal() {
    if (!quote || !selectedListingId || !title.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatorSessionId: quote.session.id,
          listingId: selectedListingId,
          title: title.trim(),
          description: specText,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit task");
      router.push(`/tasks/${body.task_id}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit task");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedListing = listings?.find((l) => l.id === selectedListingId) ?? null;
  const autoSelectedId = quote?.session.matched_listing_ids.find((id) =>
    listings?.some((l) => l.id === id),
  );

  const agents: AgentEntry[] = [];
  if (quote) {
    agents.push({
      role: "Buyer agent",
      monogram: "B",
      colorClass: AGENT_COLOR.buyer,
      description: "Parsed your request into a structured spec and requested a quote.",
    });
    agents.push({
      role: "Estimator agent",
      monogram: "E",
      colorClass: AGENT_COLOR.estimator,
      description: `Generated this quote from ${quote.session.seller_match_type === "keyword" ? "matching" : "the cheapest available"} Marketplace listings.`,
    });
  }
  if (quote && selectedListing) {
    const isRealMatch = selectedListing.id === autoSelectedId && quote.session.seller_match_type === "keyword";
    const selectionReason = isRealMatch
      ? "selected as the lowest-priced match for your request"
      : selectedListing.id === autoSelectedId
        ? "selected as the cheapest available (no close match found)"
        : "picked manually";
    agents.push({
      role: "Seller agent",
      monogram: "S",
      colorClass: AGENT_COLOR.seller,
      description: isResearchSourcingListing(selectedListing.sla)
        ? `${selectedListing.title} — ${selectionReason}. A real worker: will execute with Claude + live web search, not a placeholder.`
        : `${selectedListing.title} — ${selectionReason}.`,
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Commission a task</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Describe what you need in plain language. We&apos;ll quote it against active Marketplace sellers before you pay anything.
        </p>
      </div>

      <form onSubmit={getQuote} className="space-y-3">
        <textarea
          value={specText}
          onChange={(e) => setSpecText(e.target.value)}
          rows={4}
          placeholder="e.g. Find 5 suppliers of LED panels in Southeast Asia, deliver as a comparison table."
          disabled={quoting}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={quoting || !specText.trim()}
          className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {quoting ? "Quoting…" : quote ? "Re-quote" : "Get quote"}
        </button>
        {quoteError && <p className="text-sm text-red-400">{quoteError}</p>}
      </form>

      {quote && (
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-zinc-700/40 px-2.5 py-1 text-xs font-medium text-zinc-300">
              {GATE_LABEL[quote.gate_result]}
            </span>
            <span className="text-xs text-zinc-500">
              Attempt {quote.attempt_no} · session {quote.session.subject}
            </span>
          </div>

          {quote.gate_result === "topic_change" && quote.swept && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
              This reads as a new topic, not a retry — the previous quote&apos;s held escrow
              ({formatUsdc(quote.swept.amount_usdc)}) was swept to Treasury, and a fresh
              session started for this request.
            </p>
          )}
          {quote.gate_result === "retry_charged" && (
            <p className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
              This is your 3rd+ attempt on this topic — {formatUsdc(quote.charged_usdc)} was
              charged into escrow for this retry (first 2 attempts are free).
            </p>
          )}
          {quote.gate_result === "retry_free" && (
            <p className="text-sm text-zinc-400">
              Free retry — attempts 1–2 on the same topic don&apos;t charge anything.
            </p>
          )}

          <div className="space-y-1 border-t border-zinc-800 pt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-zinc-400">Guaranteed total</span>
              <span className="text-xl font-bold text-white">
                {formatUsdc(quote.quote.guaranteed_total_usdc)}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Seller cost estimate {formatUsdc(quote.quote.seller_cost_estimate_usdc)} + platform
              fee {formatUsdc(quote.quote.happy_path_fee_usdc)}
            </p>
            {quote.quote.contingent_disclosure && (
              <p className="text-xs text-zinc-500">{quote.quote.contingent_disclosure}</p>
            )}
            {!quote.quote.within_budget_ceiling && (
              <p className="text-xs text-red-400">
                This exceeds your standing policy&apos;s max amount (
                {formatUsdc(quote.quote.policy_max_amount_usdc)}).
              </p>
            )}
          </div>
        </section>
      )}

      <AgentRoster agents={agents} />

      {quote && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200">Choose a seller</h2>
          {listingsError && <p className="text-sm text-red-400">{listingsError}</p>}
          {listings && listings.length === 0 && (
            <p className="text-sm text-zinc-500">No active listings available right now.</p>
          )}
          {listings && listings.length > 0 && quote.session.seller_match_type === "fallback" && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Nothing in the marketplace closely matches &ldquo;{quote.session.subject}&rdquo; —
              showing the cheapest active listings instead. Pick manually if none of these are a
              good fit.
            </p>
          )}
          <div className="space-y-2">
            {listings?.map((listing) => {
              const isAuto = listing.id === autoSelectedId;
              const isSelected = listing.id === selectedListingId;
              const isRealMatch = isAuto && quote.session.seller_match_type === "keyword";
              const rank = sellerRankLabel(listing.sla);
              return (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => setSelectedListingId(listing.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{listing.title}</span>
                        {isAuto && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              isRealMatch
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-zinc-700/40 text-zinc-300"
                            }`}
                          >
                            {isRealMatch ? "Auto-selected" : "Cheapest available"}
                          </span>
                        )}
                        {isResearchSourcingListing(listing.sla) && (
                          <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-400">
                            Real agent
                          </span>
                        )}
                      </div>
                      {listing.description && (
                        <p className="mt-0.5 text-sm text-zinc-400">{listing.description}</p>
                      )}
                      {isAuto && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {isRealMatch
                            ? `Lowest-priced match for "${quote.session.subject}"`
                            : "No close match found for this request — lowest price overall"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-600">
                        Reputation: New seller {rank ? `· SLA — ${rank}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm text-zinc-200">
                      {formatUsdc(listing.price_usdc)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {quote && selectedListing && (
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="space-y-1">
            <label htmlFor="title" className="text-sm font-medium text-zinc-300">
              Task title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={submitForReal}
            disabled={submitting || !title.trim()}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Submitting…"
              : `Submit for real — commission ${selectedListing.title} for ${formatUsdc(selectedListing.price_usdc)}`}
          </button>
          {submitError && <p className="text-sm text-red-400">{submitError}</p>}
        </section>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { ListingRow } from "@/lib/supabase/types";
import { formatUsdc, formatUsdcPrecise } from "@/lib/format";
import AgentRoster, { AGENT_COLOR, type AgentEntry } from "@/components/AgentRoster";
import { isResearchSourcingListing } from "@/lib/listing-agents";
import { estimateResearchSourcingCostUsdc } from "@/lib/agents/research-sourcing-pricing";
import { LIVE_CATEGORY, type CategoryKey } from "@/lib/categories";

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
    validation_fee_usdc: number;
    dispute_insurance_premium_usdc: number;
    disclosed_contingent_fee_pct: number;
    contingent_disclosure: string | null;
    within_budget_ceiling: boolean;
    policy_max_amount_usdc: number | null;
  };
  session: {
    id: string;
    category: CategoryKey;
    subject: string;
    difficulty: number;
    scope_quantity: number | null;
    attempt_count: number;
    escrow_held_usdc: number;
    matched_listing_ids: string[];
  };
};

/** No session/quote fields — a mismatch never creates a session or a quote. */
type CategoryMismatchResponse = {
  gate_result: "category_mismatch";
  reason: string;
};

/** Shape returned by runValidation() via POST /api/tasks/[id]/deliver. */
type DeliverResult = {
  outcome: "approved" | "disputed";
  policy_pass: boolean;
  task_pass: boolean;
  sla_pass: boolean;
  rationale: string | null;
};

/** Mirrors tasks/[id]/page.tsx's ResearchDeliverableShape — same real shape. */
type ResearchDeliverableShape = {
  overall_summary: string;
  findings: { title: string; url: string; summary: string; confidence: string }[];
};

function isResearchDeliverable(d: unknown): d is ResearchDeliverableShape {
  return (
    !!d &&
    typeof d === "object" &&
    Array.isArray((d as ResearchDeliverableShape).findings) &&
    typeof (d as ResearchDeliverableShape).overall_summary === "string"
  );
}

const GATE_LABEL: Record<GateResult, string> = {
  original: "First submission — free",
  retry_free: "Free retry",
  retry_charged: "Charged retry",
  topic_change: "Topic changed",
};

/** Real agent delivery + validator verdict — the same data tasks/[id] shows. */
function DeliveredResultView({
  deliverable,
  result,
}: {
  deliverable: unknown;
  result: DeliverResult;
}) {
  const outcomeClasses =
    result.outcome === "approved" ? "bg-[#10b981]/15 text-[#10b981]" : "bg-[#f59e0b]/15 text-[#fbbf24]";
  return (
    <div className="space-y-3 rounded-xl border border-[#3f3f46] bg-[#18181b] px-4 py-4 text-left">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${outcomeClasses}`}>
          {result.outcome}
        </span>
        <span className="text-xs text-[#71717a]">
          policy {result.policy_pass ? "✓" : "✗"} · task {result.task_pass ? "✓" : "✗"} · SLA{" "}
          {result.sla_pass ? "✓" : "✗"}
        </span>
      </div>
      {result.rationale && <p className="text-sm text-[#a1a1aa]">{result.rationale}</p>}
      {isResearchDeliverable(deliverable) && (
        <div className="space-y-2 border-t border-[#ffffff14] pt-3">
          <p className="text-sm text-[#a1a1aa]">{deliverable.overall_summary}</p>
          <div className="space-y-1">
            {deliverable.findings.map((f, i) => (
              <div
                key={i}
                className="rounded-lg border border-[#ffffff14] bg-[#18181b73] px-3 py-2 text-xs backdrop-blur-[28px]"
              >
                <div className="flex items-center gap-2">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-[#10b981] hover:underline"
                  >
                    {f.title}
                  </a>
                  <span className="rounded-full bg-[#ffffff14] px-2 py-0.5 text-[#a1a1aa]">
                    {f.confidence} confidence
                  </span>
                </div>
                <p className="mt-1 text-[#71717a]">{f.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TaskSubmissionFlow({
  initialSpecText,
}: {
  /** Pre-fills the request textarea (still fully editable) — see app/page.tsx. */
  initialSpecText?: string;
}) {
  // Exactly one category exists (lib/categories.ts) — no picker step, no
  // state to track a pick against.
  const category = LIVE_CATEGORY;

  const [specText, setSpecText] = useState(initialSpecText ?? "");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [categoryMismatch, setCategoryMismatch] = useState<CategoryMismatchResponse | null>(null);

  const [listings, setListings] = useState<ListingRow[] | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Post-funding: the real agent run + validator verdict, shown in place on
  // this page instead of navigating to the task detail page.
  const [fundedTaskId, setFundedTaskId] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [deliverResult, setDeliverResult] = useState<{
    deliverable: unknown;
    result: DeliverResult;
  } | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);

  async function getQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!specText.trim()) return;
    setQuoting(true);
    setQuoteError(null);
    setCategoryMismatch(null);
    try {
      const res = await fetch("/api/estimator/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: specText, category: category.key }),
      });
      const body = await res.json();
      if (res.ok && body.gate_result === "category_mismatch") {
        setQuote(null);
        setCategoryMismatch(body as CategoryMismatchResponse);
        return;
      }
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

      // Only ever auto-select the one real worker agent (Research &
      // Sourcing). matched_listing_ids is now always a genuine category
      // match (an exact filter, not a keyword guess — see
      // lib/estimator/marketplace.ts) against the one live category, so in
      // practice this always matches — the isResearchSourcingListing check
      // is still a real guard, not dead code, for if a non-real listing is
      // ever added to this category.
      const matched = result.session.matched_listing_ids
        .map((id) => activeListings.find((l) => l.id === id))
        .find((l): l is ListingRow => Boolean(l));
      const isReal = !!matched && isResearchSourcingListing(matched.sla);
      setSelectedListingId(isReal && matched ? matched.id : null);
    } catch (err) {
      setQuoteError(err instanceof Error ? err.message : "Failed to get a quote");
      setListingsError(null);
    } finally {
      setQuoting(false);
    }
  }

  /** Runs the real Research & Sourcing agent + validator — same call as the
   * task detail page's "Run agent" button (POST /api/tasks/[id]/deliver). */
  async function runDelivery(taskId: string) {
    setDelivering(true);
    setDeliverError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliver`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Delivery failed");
      setDeliverResult({ deliverable: body.deliverable, result: body.result as DeliverResult });
    } catch (err) {
      setDeliverError(err instanceof Error ? err.message : "Delivery failed");
    } finally {
      setDelivering(false);
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
      setFundedTaskId(body.task_id as string);
      setSubmitting(false);
      // No navigation — stay on this page and run the real delivery in place.
      await runDelivery(body.task_id as string);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit task");
      setSubmitting(false);
    }
  }

  function reset() {
    setSpecText("");
    setQuote(null);
    setQuoteError(null);
    setCategoryMismatch(null);
    setListings(null);
    setListingsError(null);
    setSelectedListingId(null);
    setTitle("");
    setSubmitError(null);
    setFundedTaskId(null);
    setDelivering(false);
    setDeliverResult(null);
    setDeliverError(null);
  }

  // The only listing this flow ever shows as a candidate is Research &
  // Sourcing — see the real-match block below for why every other listing
  // is excluded rather than shown as a simulated competing quote.
  const autoSelectedId = quote?.session.matched_listing_ids.find((id) =>
    listings?.some((l) => l.id === id),
  );
  const matchedListing = listings?.find((l) => l.id === autoSelectedId) ?? null;
  const isRealMatch = !!quote && !!matchedListing && isResearchSourcingListing(matchedListing.sla);
  const selectedListing = isRealMatch ? matchedListing : null;
  const realPriceUsdc =
    isRealMatch && quote
      ? estimateResearchSourcingCostUsdc(quote.session.difficulty, quote.session.scope_quantity)
      : null;

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
      description: "Generated this quote from matching Marketplace listings in your chosen category.",
    });
  }
  if (quote && selectedListing && realPriceUsdc !== null) {
    agents.push({
      role: "Seller agent",
      monogram: "S",
      colorClass: AGENT_COLOR.seller,
      description: `${selectedListing.title} — the one real worker agent in this demo. Executes with Claude + live web search for ${formatUsdc(realPriceUsdc)}, not a placeholder.`,
    });
  }

  const flowLocked = !!fundedTaskId;
  const busy = quoting || submitting || delivering;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#fafafa]">Try SnapBack</h1>
        <p className="text-sm text-[#a1a1aa]">
          Describe what you need in plain language — get a real quote, fund it, and the real
          agent takes it from there.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-8 backdrop-blur-[24px]">
        <form onSubmit={getQuote} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="instruction"
              className="text-xs font-medium uppercase tracking-widest text-[#71717a]"
            >
              Instruction
            </label>
            <textarea
              id="instruction"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
              rows={4}
              placeholder="e.g. Summarize the top 3 competitors in EU fintech"
              disabled={busy || flowLocked}
              className="w-full rounded-xl border border-[#3f3f46] bg-[#18181b] px-3 py-2.5 text-[#fafafa] outline-none transition focus:border-[#10b981] disabled:opacity-60"
            />
            {initialSpecText && (
              <p className="rounded-lg border border-[#22d3ee4d] bg-[#22d3ee0d] px-3 py-2 text-xs text-[#67e8f9]">
                Pre-filled from a rejected task&apos;s feedback — edit as needed. This is a new,
                separately-priced task; nothing is resubmitted automatically.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
              Agent&apos;s result
            </label>
            {deliverResult ? (
              <DeliveredResultView
                deliverable={deliverResult.deliverable}
                result={deliverResult.result}
              />
            ) : delivering ? (
              <div className="space-y-3 rounded-xl border border-[#3f3f46] bg-[#18181b]/40 px-4 py-6">
                <p className="text-center text-sm text-[#a1a1aa]">
                  Working — the real agent is researching and validating. This genuinely takes a
                  variable amount of time, anywhere from several seconds to about a minute.
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#ffffff14]">
                  <div className="h-full w-1/3 rounded-full bg-[#10b981] progress-indeterminate-bar" />
                </div>
              </div>
            ) : deliverError ? (
              <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
                {deliverError}
              </p>
            ) : (
              // No real equivalent yet before funding — the real agent runs
              // automatically once a task is funded; nothing is manually
              // pasted. Left visibly inert rather than faked as a working
              // paste box.
              <div className="w-full cursor-not-allowed select-none rounded-xl border border-dashed border-[#3f3f46] bg-[#18181b]/40 px-3 py-8 text-center text-sm italic text-[#71717a]">
                Not available yet — this will show the agent&apos;s real delivered result once a
                task is funded and completed.
              </div>
            )}
            {fundedTaskId && (
              <Link
                href={`/tasks/${fundedTaskId}`}
                className="inline-block text-xs text-[#10b981] hover:underline"
              >
                View full task →
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || flowLocked || !specText.trim()}
              className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {quoting ? "Quoting…" : quote ? "Re-quote" : "Get Quote"}
            </button>
            {quote && selectedListing && realPriceUsdc !== null && (
              <button
                type="button"
                onClick={submitForReal}
                disabled={submitting || delivering || flowLocked}
                className="rounded-xl bg-[#10b981] px-5 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {flowLocked
                  ? "Funded ✓"
                  : submitting
                    ? "Funding…"
                    : `Accept Quote — fund ${formatUsdcPrecise(realPriceUsdc)}`}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-xl border border-[#3f3f46] px-5 py-2.5 font-semibold text-[#a1a1aa] transition hover:bg-[#ffffff0a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>

          {quoteError && (
            <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
              {quoteError}
            </p>
          )}
          {categoryMismatch && (
            <p className="rounded-lg border border-[#f59e0b4d] bg-[#f59e0b1a] px-3 py-2 text-sm text-[#fbbf24]">
              This looks like a different kind of request than {category.label}:{" "}
              {categoryMismatch.reason} Rewrite your request so it&apos;s actually about{" "}
              {category.label.toLowerCase()}.
            </p>
          )}
          {submitError && (
            <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
              {submitError}
            </p>
          )}
        </form>

        {quote && (
          <div className="space-y-4 border-t border-[#ffffff14] pt-6">
            <h2 className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
              Agent quote
            </h2>
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-[#ffffff14] px-2.5 py-1 text-xs font-medium text-[#a1a1aa]">
                {GATE_LABEL[quote.gate_result]}
              </span>
              <span className="text-xs text-[#71717a]">
                Attempt {quote.attempt_no} · session {quote.session.subject}
              </span>
            </div>

            {quote.gate_result === "topic_change" && quote.swept && (
              <p className="rounded-lg border border-[#f59e0b4d] bg-[#f59e0b1a] px-3 py-2 text-sm text-[#fbbf24]">
                This reads as a new topic, not a retry — the previous quote&apos;s held escrow
                ({formatUsdcPrecise(quote.swept.amount_usdc)}) was swept to Treasury, and a fresh
                session started for this request.
              </p>
            )}
            {quote.gate_result === "retry_charged" && (
              <p className="rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 py-2 text-sm text-[#a1a1aa]">
                This is your 3rd+ attempt on this topic — {formatUsdcPrecise(quote.charged_usdc)}{" "}
                was charged into escrow for this retry (first 2 attempts are free).
              </p>
            )}
            {quote.gate_result === "retry_free" && (
              <p className="text-sm text-[#a1a1aa]">
                Free retry — attempts 1–2 on the same topic don&apos;t charge anything.
              </p>
            )}

            <div className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[#a1a1aa]">Guaranteed total</span>
                <span className="text-xl font-semibold text-[#fafafa]">
                  {formatUsdcPrecise(quote.quote.guaranteed_total_usdc)}
                </span>
              </div>
              <p className="text-xs text-[#71717a]">
                Seller cost estimate {formatUsdcPrecise(quote.quote.seller_cost_estimate_usdc)} +
                platform fee {formatUsdcPrecise(quote.quote.happy_path_fee_usdc)} + validation fee{" "}
                {formatUsdcPrecise(quote.quote.validation_fee_usdc)} + dispute-insurance premium{" "}
                {formatUsdcPrecise(quote.quote.dispute_insurance_premium_usdc)}
              </p>
              <p className="text-xs text-[#71717a]">
                The dispute-insurance premium funds a full refund if you win a dispute — like the
                fees above, it&apos;s never refunded itself.
              </p>
              {quote.quote.contingent_disclosure && (
                <p className="text-xs text-[#71717a]">{quote.quote.contingent_disclosure}</p>
              )}
              {!quote.quote.within_budget_ceiling && (
                <p className="text-xs text-[#f87171]">
                  This exceeds your standing policy&apos;s max amount (
                  {formatUsdcPrecise(quote.quote.policy_max_amount_usdc)}).
                </p>
              )}
              {isRealMatch && matchedListing && realPriceUsdc !== null && (
                <p className="text-xs text-[#71717a]">
                  Delivered by {matchedListing.title} — priced at{" "}
                  {formatUsdcPrecise(realPriceUsdc)}{" "}
                  for this task&apos;s scope.
                </p>
              )}
            </div>

            {listingsError && <p className="text-sm text-[#f87171]">{listingsError}</p>}
            {!isRealMatch && (
              <p className="rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 py-2 text-xs text-[#71717a]">
                This demo currently runs one real worker agent ({category.label}); once matched
                you&apos;ll be able to accept and fund above.
              </p>
            )}
          </div>
        )}
      </div>

      <AgentRoster agents={agents} />
    </div>
  );
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { submitQuoteRequest } from "@/lib/estimator/service";
import { createServiceSupabase } from "@/lib/supabase/server";
import { contingentDisclosureLine, evaluateBudgetCeiling } from "@/lib/estimator/fees";
import { findCategory, type CategoryKey } from "@/lib/categories";

/**
 * POST /api/estimator/quote
 * Body: { category, text }
 *
 * Runs a quote request through the Estimator gate: parse (scoped to
 * `category`) → compare subject + difficulty against the active session →
 * retry (free/charged) or topic change (sweep + reset).
 *
 * `category` must be one of the fixed keys in lib/categories.ts AND live —
 * this is the actual enforcement point (the picker's client-side block is
 * just UX): a request for a coming-soon category is rejected here with a
 * 400 before submitQuoteRequest even runs, same as any other malformed body.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let text: string;
  let category: string;
  try {
    ({ text, category } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (typeof category !== "string") {
    return NextResponse.json({ error: "category is required" }, { status: 400 });
  }
  const categoryDef = findCategory(category);
  if (!categoryDef) {
    return NextResponse.json({ error: "unknown category" }, { status: 400 });
  }
  if (categoryDef.status !== "live") {
    return NextResponse.json(
      { error: `"${categoryDef.label}" is coming soon and isn't accepting tasks yet.` },
      { status: 400 },
    );
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  try {
    const result = await submitQuoteRequest(wallet.id, category as CategoryKey, text.trim());

    // Checked before any of the fields below, which only exist on the real
    // quote path — a mismatch never creates a session or generates a quote,
    // so it gets its own minimal response shape instead.
    if (result.gate_result === "category_mismatch") {
      return NextResponse.json({ gate_result: "category_mismatch", reason: result.reason });
    }

    const supabase = createServiceSupabase();
    const { data: policies } = await supabase
      .from("policies")
      .select("max_amount_usdc")
      .eq("wallet_id", wallet.id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const guaranteedTotal = Number(result.session.guaranteed_total_usdc ?? 0);
    const contingentPct = Number(result.session.disclosed_contingent_fee_pct ?? 0);
    const ceiling = evaluateBudgetCeiling(policies?.[0] ?? null, guaranteedTotal);

    return NextResponse.json({
      gate_result: result.gate_result,
      attempt_no: result.attempt_no,
      charged_usdc: result.charged_usdc,
      swept: result.swept ?? null,
      quote: {
        // Headline number — seller cost estimate + happy-path platform skim.
        // This is what's checked against the standing policy's budget ceiling.
        guaranteed_total_usdc: guaranteedTotal,
        seller_cost_estimate_usdc: Number(result.session.seller_cost_estimate_usdc ?? 0),
        happy_path_fee_usdc: Number(result.session.happy_path_fee_usdc ?? 0),
        // Fixed fee recovering the validator's real LLM-call cost — always
        // charged (validation always runs), folded into guaranteed_total_usdc
        // like happy_path_fee_usdc, shown as its own line.
        validation_fee_usdc: Number(result.session.validation_fee_usdc ?? 0),
        // Contingent — shown alongside, never folded into guaranteed_total_usdc.
        disclosed_contingent_fee_pct: contingentPct,
        contingent_disclosure: contingentPct
          ? contingentDisclosureLine(contingentPct)
          : null,
        within_budget_ceiling: ceiling.within_ceiling,
        policy_max_amount_usdc: ceiling.policy_max_amount_usdc,
      },
      session: {
        id: result.session.id,
        category: result.session.category,
        subject: result.session.subject,
        difficulty: result.session.difficulty,
        scope_quantity: result.session.scope_quantity,
        attempt_count: result.session.attempt_count,
        escrow_held_usdc: result.session.escrow_held_usdc,
        // The comparable listings the Estimator itself matched against to
        // produce seller_cost_estimate_usdc (marketplace.ts), price-ascending
        // — the marketplace step's "auto-selected" pick is simply the first
        // of these, reusing the same matching rather than re-deriving it. All
        // guaranteed to be genuine category matches now (an exact filter, not
        // a keyword guess) — see lib/estimator/marketplace.ts.
        matched_listing_ids: (result.session.matched_listing_ids as string[] | null) ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimator failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

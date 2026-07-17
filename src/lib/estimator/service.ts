import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ensureTreasuryWallet } from "@/lib/app-wallets";
import { isWalletFlagged } from "@/lib/wallet-flags";
import { parseSpec, type ParsedSpec } from "@/lib/estimator/parser";
import {
  evaluateGate,
  isChargeable,
  ABANDONMENT_MINUTES,
} from "@/lib/estimator/gate";
import { estimateSellerCost } from "@/lib/estimator/marketplace";
import { computeGuaranteedQuote, type GuaranteedQuote } from "@/lib/estimator/fees";
import { ARC_CHAIN_ID } from "@/lib/arc";
import type { Database } from "@/lib/supabase/types";

/**
 * Estimator session orchestration.
 *
 * NOTE ON REPUTATION: the Estimator's seller pings must never count toward
 * seller reputation. Nothing in this module reads or writes the `reputation`
 * table, and it must stay that way — quote-phase activity is not delivery.
 *
 * NOTE ON ESCROW: quote-phase escrow is tracked here as ledger state
 * (`escrow_held_usdc` + `payments` rows). The on-chain QuoteEscrow contract
 * (creditToTask / sweepToTreasury) lands in the contracts phase and will settle
 * against these same records.
 */

type SessionRow = Database["public"]["Tables"]["estimator_sessions"]["Row"];
type GateResult = Database["public"]["Enums"]["estimator_gate_result"];

export type SubmitResult = {
  session: SessionRow;
  gate_result: GateResult;
  attempt_no: number;
  charged_usdc: number;
  /** Set when the submission failed the gate and swept the prior session. */
  swept?: { session_id: string; amount_usdc: number };
  /** Whether matched_listing_ids reflects a real keyword match against the
   *  spec, or is just the cheapest active listings with nothing relevant
   *  found — callers must not present a "fallback" pick as auto-selected
   *  for relevance. See estimateSellerCost in lib/estimator/marketplace.ts. */
  seller_match_type: "keyword" | "fallback";
};

function quoteFee(): number {
  return Number(process.env.ESTIMATOR_QUOTE_FEE_USDC ?? "0.05");
}

function specOf(session: SessionRow): ParsedSpec {
  return {
    subject: session.subject,
    subject_key: session.subject_key,
    difficulty: session.difficulty,
    scope_quantity: session.scope_quantity,
    deliverable: "",
    constraints: [],
  };
}

/**
 * Sweep a session's held quote-phase escrow to the Treasury Wallet.
 * Used for both topic changes (immediate) and abandonment (15m inactivity) —
 * the spec calls for the same mechanism in both cases.
 */
export async function sweepSessionToTreasury(
  session: SessionRow,
  status: "swept" | "abandoned",
): Promise<number> {
  const supabase = createServiceSupabase();
  const amount = Number(session.escrow_held_usdc);

  if (amount > 0) {
    const treasury = await ensureTreasuryWallet();
    await supabase.from("payments").insert({
      from_wallet_id: session.payer_wallet_id,
      // Treasury is an app-level wallet, not a per-user `wallets` row — its
      // address is carried in metadata rather than to_wallet_id.
      kind: "treasury_sweep",
      status: "released",
      amount_usdc: amount,
      chain_id: ARC_CHAIN_ID,
      metadata: {
        reason: status,
        estimator_session_id: session.id,
        treasury_address: treasury.address,
      },
    });
  }

  await supabase
    .from("estimator_sessions")
    .update({
      status,
      escrow_held_usdc: 0,
      treasury_swept_usdc: Number(session.treasury_swept_usdc) + amount,
    })
    .eq("id", session.id);

  return amount;
}

/**
 * Submit a quote request. Parses to a structured spec, runs the combined gate
 * against the active session, and applies the retry / topic-change outcome.
 */
export async function submitQuoteRequest(
  payerWalletId: string,
  rawText: string,
): Promise<SubmitResult> {
  if (await isWalletFlagged(payerWalletId)) {
    throw new Error("This account is paused by an administrator and can't request new quotes.");
  }

  const supabase = createServiceSupabase();
  const spec = await parseSpec(rawText);

  const { data: active } = await supabase
    .from("estimator_sessions")
    .select("*")
    .eq("payer_wallet_id", payerWalletId)
    .eq("status", "active")
    .maybeSingle();

  // ── No active session: this is an original submission (free). ──
  if (!active) {
    const { session, match_type } = await createSession(payerWalletId, spec);
    await recordAttempt(session.id, 1, rawText, spec, "original", 0);
    return {
      session,
      gate_result: "original",
      attempt_no: 1,
      charged_usdc: 0,
      seller_match_type: match_type,
    };
  }

  const gate = evaluateGate(specOf(active), spec);

  // ── Gate failed: topic change. Sweep immediately, start a fresh session. ──
  if (!gate.pass) {
    const sweptAmount = await sweepSessionToTreasury(active, "swept");
    const { session, match_type } = await createSession(payerWalletId, spec);
    await recordAttempt(session.id, 1, rawText, spec, "topic_change", 0);
    return {
      session,
      gate_result: "topic_change",
      attempt_no: 1,
      charged_usdc: 0,
      swept: { session_id: active.id, amount_usdc: sweptAmount },
      seller_match_type: match_type,
    };
  }

  // ── Gate passed: a retry. Free through the allowance, charged after. ──
  const attemptNo = active.attempt_count + 1;
  const chargeable = isChargeable(attemptNo);
  const charged = chargeable ? quoteFee() : 0;
  let paymentId: string | null = null;

  if (chargeable) {
    const { data: payment } = await supabase
      .from("payments")
      .insert({
        from_wallet_id: payerWalletId,
        kind: "quote_fee",
        status: "escrowed",
        amount_usdc: charged,
        chain_id: ARC_CHAIN_ID,
        metadata: { estimator_session_id: active.id, attempt_no: attemptNo },
      })
      .select("id")
      .single();
    paymentId = payment?.id ?? null;
  }

  // Scope may have shifted within the free re-quote allowance — refresh the
  // fee-inclusive figures against the latest spec rather than leaving them stale.
  const quote = await quoteFor(spec);

  const { data: updated } = await supabase
    .from("estimator_sessions")
    .update({
      attempt_count: attemptNo,
      escrow_held_usdc: Number(active.escrow_held_usdc) + charged,
      last_activity_at: new Date().toISOString(),
      // Refresh the stored spec — the gate passed, so this is the same job.
      normalized_spec: spec as unknown as Database["public"]["Tables"]["estimator_sessions"]["Update"]["normalized_spec"],
      seller_cost_estimate_usdc: quote.seller_cost_estimate_usdc,
      happy_path_fee_usdc: quote.happy_path_fee_usdc,
      guaranteed_total_usdc: quote.guaranteed_total_usdc,
      disclosed_contingent_fee_pct: quote.disclosed_contingent_fee_pct,
      matched_listing_ids: quote.matched_listing_ids as never,
    })
    .eq("id", active.id)
    .select()
    .single();

  const gateResult: GateResult = chargeable ? "retry_charged" : "retry_free";
  await recordAttempt(
    active.id,
    attemptNo,
    rawText,
    spec,
    gateResult,
    charged,
    paymentId,
  );

  return {
    session: (updated ?? active) as SessionRow,
    gate_result: gateResult,
    attempt_no: attemptNo,
    charged_usdc: charged,
    seller_match_type: quote.match_type,
  };
}

export type CreditResult = {
  /** Quote-phase nanopayment retry fees credited toward the task. */
  credited_quote_fee_usdc: number;
  /** Fee-inclusive figure the task is now settled against. */
  guaranteed_total_usdc: number;
  /** guaranteed_total_usdc minus what quote-phase fees already covered. */
  remaining_due_usdc: number;
  /** Buyer-side happy-path skim, routed to Treasury — seller's quoted amount is untouched. */
  platform_fee_usdc: number;
};

/**
 * A matching final submission credits held quote-phase escrow toward the task
 * payment rather than sweeping it, and settles the task against the
 * fee-inclusive guaranteed_total_usdc (not the seller's raw quoted amount).
 */
export async function creditSessionToTask(
  sessionId: string,
  taskId: string,
): Promise<CreditResult> {
  const supabase = createServiceSupabase();
  const { data: session } = await supabase
    .from("estimator_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) throw new Error("Estimator session not found");

  const quoteFeeCredit = Number(session.escrow_held_usdc);
  if (quoteFeeCredit > 0) {
    await supabase.from("payments").insert({
      task_id: taskId,
      from_wallet_id: session.payer_wallet_id,
      kind: "quote_fee",
      status: "released",
      amount_usdc: quoteFeeCredit,
      chain_id: ARC_CHAIN_ID,
      metadata: { credited_to_task: taskId, estimator_session_id: sessionId },
    });
  }

  const guaranteedTotal = Number(session.guaranteed_total_usdc ?? 0);
  const platformFee = Number(session.happy_path_fee_usdc ?? 0);
  const contingentPct = session.disclosed_contingent_fee_pct;

  // Buyer-side skim, added on top and routed to Treasury — never deducted
  // from the seller's payout, so seller payouts stay predictable.
  if (platformFee > 0) {
    const treasury = await ensureTreasuryWallet();
    await supabase.from("payments").insert({
      task_id: taskId,
      from_wallet_id: session.payer_wallet_id,
      kind: "platform_fee",
      status: "released",
      amount_usdc: platformFee,
      chain_id: ARC_CHAIN_ID,
      metadata: {
        estimator_session_id: sessionId,
        treasury_address: treasury.address,
        reason: "happy_path_skim",
      },
    });
  }

  await supabase
    .from("tasks")
    .update({
      guaranteed_total_usdc: guaranteedTotal || null,
      disclosed_contingent_fee_pct: contingentPct,
    })
    .eq("id", taskId);

  await supabase
    .from("estimator_sessions")
    .update({ status: "credited", task_id: taskId, escrow_held_usdc: 0 })
    .eq("id", sessionId);

  return {
    credited_quote_fee_usdc: quoteFeeCredit,
    guaranteed_total_usdc: guaranteedTotal,
    remaining_due_usdc: Math.max(0, guaranteedTotal - quoteFeeCredit),
    platform_fee_usdc: platformFee,
  };
}

/**
 * Sweep every active session idle past the abandonment window. Intended to be
 * driven by a keeper/cron; safe to run repeatedly.
 */
export async function sweepAbandonedSessions(): Promise<
  { session_id: string; amount_usdc: number }[]
> {
  const supabase = createServiceSupabase();
  const cutoff = new Date(
    Date.now() - ABANDONMENT_MINUTES * 60_000,
  ).toISOString();

  const { data: stale } = await supabase
    .from("estimator_sessions")
    .select("*")
    .eq("status", "active")
    .lt("last_activity_at", cutoff);

  const swept: { session_id: string; amount_usdc: number }[] = [];
  for (const session of stale ?? []) {
    const amount = await sweepSessionToTreasury(session, "abandoned");
    swept.push({ session_id: session.id, amount_usdc: amount });
  }
  return swept;
}

// ── helpers ────────────────────────────────────────────────────

/**
 * Pulls a seller cost estimate from 2-3 comparable Marketplace listings and
 * derives the fee-inclusive quote figures from it.
 */
async function quoteFor(spec: ParsedSpec): Promise<
  GuaranteedQuote & { matched_listing_ids: string[]; match_type: "keyword" | "fallback" }
> {
  const { seller_cost_estimate_usdc, matched_listing_ids, match_type } =
    await estimateSellerCost(spec);
  return {
    ...computeGuaranteedQuote(seller_cost_estimate_usdc),
    matched_listing_ids,
    match_type,
  };
}

async function createSession(
  payerWalletId: string,
  spec: ParsedSpec,
): Promise<{ session: SessionRow; match_type: "keyword" | "fallback" }> {
  const supabase = createServiceSupabase();
  const quote = await quoteFor(spec);
  const { data, error } = await supabase
    .from("estimator_sessions")
    .insert({
      payer_wallet_id: payerWalletId,
      subject: spec.subject,
      subject_key: spec.subject_key,
      difficulty: spec.difficulty,
      scope_quantity: spec.scope_quantity,
      normalized_spec: spec as never,
      attempt_count: 1,
      last_activity_at: new Date().toISOString(),
      seller_cost_estimate_usdc: quote.seller_cost_estimate_usdc,
      happy_path_fee_usdc: quote.happy_path_fee_usdc,
      guaranteed_total_usdc: quote.guaranteed_total_usdc,
      disclosed_contingent_fee_pct: quote.disclosed_contingent_fee_pct,
      matched_listing_ids: quote.matched_listing_ids as never,
    })
    .select()
    .single();
  if (error || !data) {
    throw new Error(`Failed to create estimator session: ${error?.message}`);
  }
  return { session: data, match_type: quote.match_type };
}

async function recordAttempt(
  sessionId: string,
  attemptNo: number,
  rawText: string,
  spec: ParsedSpec,
  gateResult: GateResult,
  charged: number,
  paymentId: string | null = null,
) {
  const supabase = createServiceSupabase();
  await supabase.from("estimator_attempts").insert({
    session_id: sessionId,
    attempt_no: attemptNo,
    raw_text: rawText,
    parsed_spec: spec as never,
    gate_result: gateResult,
    charged_usdc: charged,
    payment_id: paymentId,
  });
}

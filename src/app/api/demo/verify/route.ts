import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { verifyAnswer, demoVerificationFeeUsdc, VERIFY_MODEL } from "@/lib/agents/verify";
import { estimateCallCostUsd } from "@/lib/llm-cost";
import { createServiceSupabase } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types.generated";
import { ARC_CHAIN_ID } from "@/lib/arc";
import { transferUsdc, waitForTxHash } from "@/lib/escrow";
import { ensureTreasuryWallet } from "@/lib/app-wallets";
import { getSiteReliability, computePayoutUsdc, NANOPAYMENT_SITE } from "@/lib/nanopayment-insurance";
import {
  createDemoVerificationPaymentSignature,
  getDemoVerificationPaymentRequiredHeader,
  settleDemoVerificationPayment,
} from "@/lib/gateway/verify-payment";

/**
 * POST /api/demo/verify
 * Body: { instruction: string, deliverable: unknown, nanopayment?: { paymentId: string | null, amountUsdc: number, site: string } }
 *
 * SnapBack's real core loop: one real judged CORRECT/INCORRECT verdict
 * (lib/agents/verify.ts) on the real agent-to-agent nanopayment
 * /api/demo/answer just made. No escrow, no dispute filing, no judge panel.
 *
 * The validation fee below is charged the moment this runs, kept regardless
 * of verdict — same as before. New: on an INCORRECT verdict, this insures
 * the user for real, paying out of Treasury, priced off the paid site's
 * aggregate correctness rate across every wallet's past validations (see
 * lib/nanopayment-insurance.ts) — every validation, correct or not, is
 * recorded to nanopayment_validations so that rate keeps improving.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  let instruction: string;
  let deliverable: unknown;
  let nanopayment: { paymentId: string | null; amountUsdc: number; site: string } | undefined;
  try {
    ({ instruction, deliverable, nanopayment } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!instruction || !instruction.trim() || deliverable === undefined) {
    return NextResponse.json({ error: "instruction and deliverable are required" }, { status: 400 });
  }

  // Run the real judge call FIRST, before any fee is settled or recorded.
  // Previously the verification fee was charged and logged before this call,
  // so a verifyAnswer failure left a real fee record on the buyer's wallet_id
  // with no verdict and no nanopayment_validations row to explain it.
  // Reordering makes that structurally impossible: nothing below can settle
  // or record a charge without a verdict already in hand.
  let verdict: "CORRECT" | "INCORRECT";
  let reasoning: string;
  let llmCost: { model: string; input_tokens: number; output_tokens: number; real_cost_usdc: number | null };
  try {
    const result = await verifyAnswer(instruction, deliverable);
    verdict = result.verdict;
    reasoning = result.reasoning;
    llmCost = {
      model: VERIFY_MODEL,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      real_cost_usdc: estimateCallCostUsd(VERIFY_MODEL, result.usage),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Fee settlement runs only once a verdict genuinely exists. The fee itself
  // is still unconditional on CORRECT vs INCORRECT — this only makes it
  // conditional on verifyAnswer having actually produced a result at all.
  const paymentSignatureHeader =
    request.headers.get("PAYMENT-SIGNATURE") ??
    request.headers.get("X-PAYMENT") ??
    null;

  const { paymentRequiredHeader } = await getDemoVerificationPaymentRequiredHeader();

  let settlement: { success?: boolean; errorReason?: string; transaction?: string } | null = null;
  if (!paymentSignatureHeader) {
    try {
      const signedPayment = await createDemoVerificationPaymentSignature();
      settlement = await settleDemoVerificationPayment(signedPayment.paymentSignatureHeader["PAYMENT-SIGNATURE"] ?? null);
    } catch (err) {
      console.error("demo verify payment signature/settlement error:", err);
      const message = err instanceof Error ? err.message : "Payment settlement failed";
      return NextResponse.json(
        { error: message },
        { status: 402, headers: { "PAYMENT-REQUIRED": paymentRequiredHeader } },
      );
    }
  } else {
    try {
      settlement = await settleDemoVerificationPayment(paymentSignatureHeader);
    } catch (err) {
      console.error("demo verify payment signature/settlement error:", err);
      const message = err instanceof Error ? err.message : "Payment settlement failed";
      return NextResponse.json(
        { error: message },
        { status: 402, headers: { "PAYMENT-REQUIRED": paymentRequiredHeader } },
      );
    }
  }

  if (!settlement?.success) {
    console.error("demo verify settlement result:", JSON.stringify(settlement, null, 2));
    console.error("demo verify payment settlement rejected:", settlement?.errorReason ?? "Payment settlement failed");
    return NextResponse.json(
      { error: settlement?.errorReason ?? "Payment settlement failed" },
      { status: 402, headers: { "PAYMENT-REQUIRED": paymentRequiredHeader } },
    );
  }

  const feeUsdc = demoVerificationFeeUsdc();
  const supabase = createServiceSupabase();
  let validationFeePaymentId: string | null = null;
  try {
    const { data } = await supabase
      .from("payments")
      .insert({
        from_wallet_id: wallet.id,
        kind: "verification_fee",
        status: "released",
        amount_usdc: feeUsdc,
        tx_hash: settlement?.transaction ?? null,
        chain_id: ARC_CHAIN_ID,
        metadata: { reason: "demo_verify_fee" },
      })
      .select("id")
      .single();
    validationFeePaymentId = data?.id ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record the verification fee payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const site = nanopayment?.site ?? NANOPAYMENT_SITE;
  const nanopaymentUsdc = nanopayment?.amountUsdc ?? 0;

  let payoutUsdc = 0;
  let payoutPaymentId: string | null = null;

  // Everything below this point runs after a real fee charge is already
  // recorded (validationFeePaymentId) — nothing in here may throw
  // uncaught. Three historical payments (e1e27a62, f8e02c93, dc2337f0 —
  // Aug 1-3) were left with no nanopayment_validations row at all because
  // an unguarded getSiteReliability call / the final insert below threw
  // (two predate the nanopayment_validations table's own migration; the
  // third landed in a window right after the metadata-column migration,
  // consistent with a deploy/migration-ordering race) and the framework's
  // generic 500 swallowed it with no record of which fee payment was
  // orphaned. This try/catch doesn't make that class of failure
  // impossible, but it makes it loud and traceable instead of silent.
  try {
    if (verdict === "INCORRECT") {
      const reliability = await getSiteReliability(site);
      payoutUsdc = computePayoutUsdc(nanopaymentUsdc, reliability);

      if (payoutUsdc > 0) {
        try {
          const treasury = await ensureTreasuryWallet();
          const circleTxId = await transferUsdc(treasury.circle_wallet_id, wallet.address as Address, String(payoutUsdc));
          const txHash = circleTxId ? await waitForTxHash(circleTxId) : null;

          const { data: payoutPayment } = await supabase
            .from("payments")
            .insert({
              to_wallet_id: wallet.id,
              kind: "insurance_payout",
              status: "released",
              amount_usdc: payoutUsdc,
              tx_hash: txHash,
              chain_id: ARC_CHAIN_ID,
              metadata: { reason: "nanopayment_validation_incorrect", site },
            })
            .select("id")
            .single();
          payoutPaymentId = payoutPayment?.id ?? null;
        } catch (err) {
          console.error("nanopayment insurance payout failed:", err);
          const { data: failedPayment } = await supabase
            .from("payments")
            .insert({
              to_wallet_id: wallet.id,
              kind: "insurance_payout",
              status: "failed",
              amount_usdc: 0,
              tx_hash: null,
              chain_id: ARC_CHAIN_ID,
              metadata: {
                reason: "nanopayment_validation_incorrect",
                site,
                error: err instanceof Error ? err.message : String(err),
              },
            })
            .select("id")
            .single();
          payoutPaymentId = failedPayment?.id ?? null;
          payoutUsdc = 0;
        }
      }
    }

    await supabase.from("nanopayment_validations").insert({
      wallet_id: wallet.id,
      site,
      instruction,
      nanopayment_usdc: nanopaymentUsdc,
      validation_fee_usdc: feeUsdc,
      verdict: verdict === "CORRECT" ? "correct" : "incorrect",
      payout_usdc: payoutUsdc,
      nanopayment_payment_id: nanopayment?.paymentId ?? null,
      validation_fee_payment_id: validationFeePaymentId,
      payout_payment_id: payoutPaymentId,
      // reasoning/deliverable persisted here (not just returned below) so the
      // dashboard's transaction detail modal can show them after the fact —
      // previously both were discarded the moment this response was sent.
      metadata: { llm_cost: llmCost, reasoning, deliverable: deliverable as Json },
    });
  } catch (err) {
    console.error(
      `demo verify: fee payment ${validationFeePaymentId} charged but nanopayment_validations was never recorded — `,
      err,
    );
    return NextResponse.json(
      { error: "Verification fee was charged but recording the result failed. Contact support with this reference: " + validationFeePaymentId },
      { status: 500 },
    );
  }

  return NextResponse.json({ verdict, reasoning, payoutUsdc, nanopaymentUsdc, site, llmCost });
}

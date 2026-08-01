import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { verifyAnswer, demoVerificationFeeUsdc } from "@/lib/agents/verify";
import { transferUsdc, waitForTxHash } from "@/lib/escrow";
import { ensureTreasuryWallet } from "@/lib/app-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ARC_CHAIN_ID } from "@/lib/arc";
import {
  createDemoVerificationPaymentSignature,
  getDemoVerificationPaymentRequiredHeader,
  settleDemoVerificationPayment,
} from "@/lib/gateway/verify-payment";

/**
 * POST /api/demo/verify
 * Body: { instruction: string, deliverable: unknown }
 *
 * Home page's "Verify" step — one real judged CORRECT/INCORRECT verdict
 * (lib/agents/verify.ts), reusing the judge panel's model/quality bar
 * without its dispute/tier machinery. No escrow, no seller payout.
 *
 * App-funded verification payment (demo): the real payment is signed by the
 * backend-owned Gateway EOA payer, not the logged-in user's SCA wallet.
 * Treasury remains the payTo receiver, so the fee is still routed to the
 * treasury wallet while the signing account is a dedicated app-funded EOA.
 * If the charge itself fails (e.g. insufficient balance), verification never
 * runs and nothing is recorded. Deliberately no refund-on-technical-failure
 * path — a rare Claude API error after a successful charge still keeps the fee.
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
  try {
    ({ instruction, deliverable } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!instruction || !instruction.trim() || deliverable === undefined) {
    return NextResponse.json({ error: "instruction and deliverable are required" }, { status: 400 });
  }

  const paymentSignatureHeader =
    request.headers.get("PAYMENT-SIGNATURE") ??
    request.headers.get("X-PAYMENT") ??
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment") ??
    null;

  const { paymentRequiredHeader } = await getDemoVerificationPaymentRequiredHeader();

  let settlement: { success?: boolean; errorReason?: string } | null = null;
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
  try {
    const treasury = await ensureTreasuryWallet();
    const txId = await transferUsdc(wallet.circle_wallet_id, treasury.address as Address, String(feeUsdc));
    if (!txId) {
      throw new Error("Verification fee transfer did not return a transaction id");
    }
    const txHash = await waitForTxHash(txId);
    await supabase.from("payments").insert({
      from_wallet_id: wallet.id,
      kind: "verification_fee",
      status: "released",
      amount_usdc: feeUsdc,
      tx_hash: txHash,
      chain_id: ARC_CHAIN_ID,
      metadata: { reason: "demo_verify_fee" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to charge the verification fee";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const { verdict, reasoning } = await verifyAnswer(instruction, deliverable);
    return NextResponse.json({ verdict, reasoning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

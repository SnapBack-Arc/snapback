import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { verifyAnswer, demoVerificationFeeUsdc } from "@/lib/agents/verify";
import { transferUsdc, waitForTxHash } from "@/lib/escrow";
import { ensureTreasuryWallet } from "@/lib/app-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ARC_CHAIN_ID } from "@/lib/arc";

/**
 * POST /api/demo/verify
 * Body: { instruction: string, deliverable: unknown }
 *
 * Home page's "Verify" step — one real judged CORRECT/INCORRECT verdict
 * (lib/agents/verify.ts), reusing the judge panel's model/quality bar
 * without its dispute/tier machinery. No escrow, no seller payout.
 *
 * A flat real fee (demoVerificationFeeUsdc(), env DEMO_VERIFICATION_FEE_USDC)
 * is charged from the buyer's wallet to Treasury BEFORE the judge call runs
 * — always kept, regardless of the CORRECT/INCORRECT verdict. If the charge
 * itself fails (e.g. insufficient balance), verification never runs and
 * nothing is recorded. Deliberately no refund-on-technical-failure path
 * (charge-first keeps this to one money-moving step, not two) — a rare
 * Claude API error after a successful charge still keeps the fee, same as
 * any other real, already-executed transfer in this app.
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

import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getUsdcBalance } from "@/lib/viem";
import { transferUsdc, waitForTxHash } from "@/lib/escrow";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ARC_CHAIN_ID } from "@/lib/arc";

/**
 * POST /api/wallet/withdraw
 * Body: { toAddress, amount }  (amount = human USDC, e.g. "5.0")
 *
 * A real on-chain USDC transfer out of the user's own wallet — reuses
 * transferUsdc, the same function that pays out real insurance payouts
 * (see /api/demo/verify). Only possible for developer-controlled wallets:
 * the server can sign for those with CIRCLE_ENTITY_SECRET. A user-controlled
 * wallet needs its own PIN confirmation via Circle's Web SDK to authorize an
 * outbound transfer, which isn't wired into this app yet — those wallets get
 * an honest 403 rather than a call that would silently never complete.
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

  if (wallet.control !== "developer") {
    return NextResponse.json(
      {
        error:
          "Withdraw isn't available for this wallet type yet — it needs a PIN-confirmation flow that hasn't been built for user-controlled wallets.",
      },
      { status: 403 },
    );
  }

  let toAddress: string;
  let amount: string;
  try {
    ({ toAddress, amount } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  if (typeof toAddress !== "string" || !isAddress(toAddress)) {
    return NextResponse.json({ error: "Enter a valid Arc Testnet address" }, { status: 400 });
  }
  const parsedAmount = Number(amount);
  if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  const balance = await getUsdcBalance(wallet.address as Address);
  if (parsedAmount > Number(balance.formatted)) {
    return NextResponse.json({ error: "Amount exceeds your USDC balance" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  try {
    const circleTxId = await transferUsdc(wallet.circle_wallet_id, toAddress as Address, amount);
    const txHash = circleTxId ? await waitForTxHash(circleTxId) : null;

    const { data: payment } = await supabase
      .from("payments")
      .insert({
        from_wallet_id: wallet.id,
        kind: "withdrawal",
        status: "released",
        amount_usdc: parsedAmount,
        circle_tx_id: circleTxId ?? null,
        tx_hash: txHash,
        chain_id: ARC_CHAIN_ID,
        metadata: { to_address: toAddress },
      })
      .select("id")
      .single();

    return NextResponse.json({
      status: "released",
      txHash,
      amountUsdc: parsedAmount,
      toAddress,
      paymentId: payment?.id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Withdraw failed";
    await supabase.from("payments").insert({
      from_wallet_id: wallet.id,
      kind: "withdrawal",
      status: "failed",
      amount_usdc: parsedAmount,
      chain_id: ARC_CHAIN_ID,
      metadata: { to_address: toAddress, error: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

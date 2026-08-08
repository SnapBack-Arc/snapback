import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { executeWalletSwap, isLiquidityUnavailableError } from "@/lib/swap-kit";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ARC_CHAIN_ID } from "@/lib/arc";
import type { Database } from "@/lib/supabase/types.generated";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

/**
 * POST /api/wallet/swap
 * Body: { tokenIn, tokenOut, amountIn }
 *
 * Real same-chain swap execution via Circle's App Kit (see lib/swap-kit.ts)
 * — a real transaction with a real tx hash, not a simulated fill. Same
 * wallet.control gate as /api/wallet/withdraw and /api/wallet/swap/estimate.
 *
 * amount_usdc on the recorded payments row is a best-effort USD-equivalent,
 * not a priced conversion — exact for a USDC leg, an approximation
 * (flagged in metadata.approximate_usd) for a EURC/cirBTC leg, since this
 * app has no price feed. See lib/dashboard-data.ts-style honesty: never
 * silently pass off an approximation as an exact figure elsewhere in the UI.
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
          "Swap isn't available for this wallet type yet — it needs a PIN-confirmation flow that hasn't been built for user-controlled wallets.",
      },
      { status: 403 },
    );
  }

  let tokenIn: string;
  let tokenOut: string;
  let amountIn: string;
  try {
    ({ tokenIn, tokenOut, amountIn } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!tokenIn || !tokenOut || !amountIn || Number(amountIn) <= 0) {
    return NextResponse.json({ error: "tokenIn, tokenOut, and a positive amountIn are required" }, { status: 400 });
  }
  if (tokenIn.toUpperCase() === tokenOut.toUpperCase()) {
    return NextResponse.json({ error: "Choose two different tokens" }, { status: 400 });
  }

  const supabase = createServiceSupabase();

  try {
    const result = await executeWalletSwap({ walletAddress: wallet.address, tokenIn, tokenOut, amountIn });

    const status: PaymentStatus =
      result.progress.status === "DONE" ? "released" : result.progress.status === "PENDING" ? "pending" : "failed";
    const approximateUsd = approximateUsdAmount(tokenIn, tokenOut, result.amountIn, result.amountOut);

    const { data: payment } = await supabase
      .from("payments")
      .insert({
        from_wallet_id: wallet.id,
        kind: "swap",
        status,
        amount_usdc: approximateUsd.amount,
        tx_hash: result.txHash || null,
        chain_id: ARC_CHAIN_ID,
        metadata: {
          token_in: result.tokenIn,
          token_out: result.tokenOut,
          amount_in: result.amountIn,
          amount_out: result.amountOut ?? null,
          fees: (result.fees ?? []).map((f) => ({ token: f.token, amount: f.amount, type: f.type })),
          progress: { status: result.progress.status, substatus: result.progress.substatus ?? null },
          approximate_usd: approximateUsd.isApproximate,
        },
      })
      .select("id")
      .single();

    return NextResponse.json({
      status,
      txHash: result.txHash || null,
      explorerUrl: result.explorerUrl ?? null,
      tokenIn: result.tokenIn,
      tokenOut: result.tokenOut,
      amountIn: result.amountIn,
      amountOut: result.amountOut ?? null,
      paymentId: payment?.id ?? null,
    });
  } catch (err) {
    // Same documented thin-testnet-liquidity limitation as the estimate
    // route can also surface here — a quote can go stale by the time
    // execution runs. Not this app's bug; see isLiquidityUnavailableError.
    const isLiquidity = isLiquidityUnavailableError(err);
    const message = isLiquidity
      ? "Testnet liquidity is limited for this amount — try a smaller amount."
      : err instanceof Error
        ? err.message
        : "Swap failed";
    await supabase.from("payments").insert({
      from_wallet_id: wallet.id,
      kind: "swap",
      status: "failed",
      amount_usdc: 0,
      chain_id: ARC_CHAIN_ID,
      metadata: { token_in: tokenIn, token_out: tokenOut, amount_in: amountIn, error: message },
    });
    return NextResponse.json({ error: message, ...(isLiquidity ? { reason: "no_route" } : {}) }, { status: 502 });
  }
}

/** Flat 1:1 USDC-equivalent placeholder — exact when either leg is USDC
 *  itself, approximate otherwise (no price feed for EURC/cirBTC). */
function approximateUsdAmount(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  amountOut?: string,
): { amount: number; isApproximate: boolean } {
  if (tokenIn.toUpperCase() === "USDC") return { amount: Number(amountIn), isApproximate: false };
  if (amountOut !== undefined && tokenOut.toUpperCase() === "USDC") {
    return { amount: Number(amountOut), isApproximate: false };
  }
  return { amount: Number(amountOut ?? amountIn), isApproximate: true };
}

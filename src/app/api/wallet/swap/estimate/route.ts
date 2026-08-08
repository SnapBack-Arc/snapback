import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { estimateWalletSwap, isLiquidityUnavailableError } from "@/lib/swap-kit";

/**
 * POST /api/wallet/swap/estimate
 * Body: { tokenIn, tokenOut, amountIn }
 *
 * Real quote from Circle's App Kit (Stablecoin Service on Arc Testnet) — not
 * a fabricated preview. Same wallet.control gate as execute/withdraw.
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

  try {
    const estimate = await estimateWalletSwap({ walletAddress: wallet.address, tokenIn, tokenOut, amountIn });
    return NextResponse.json({
      tokenIn: estimate.tokenIn,
      tokenOut: estimate.tokenOut,
      amountIn: estimate.amountIn,
      estimatedOutput: estimate.estimatedOutput,
      fees: estimate.fees ?? [],
    });
  } catch (err) {
    // Thin Arc Testnet liquidity is a documented, expected limitation (see
    // Circle's own quickstart), not a bug — surfaced with its own reason
    // code so the modal can show a specific hint instead of a raw SDK error.
    if (isLiquidityUnavailableError(err)) {
      return NextResponse.json(
        { error: "Testnet liquidity is limited for this amount — try a smaller amount.", reason: "no_route" },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to get a swap quote";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

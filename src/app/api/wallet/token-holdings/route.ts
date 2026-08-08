import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getTokenHoldings } from "@/lib/token-holdings";

/**
 * GET /api/wallet/token-holdings — real per-token balances (see
 * lib/token-holdings.ts) plus their flat-1:1 USD sum, used for both the
 * Token Holdings list and the Total Wallet Balance stat.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  try {
    const holdings = await getTokenHoldings(wallet);
    const totalUsd = holdings.reduce((s, h) => s + h.usdValue, 0);
    const isApproximate = holdings.some((h) => h.isApproximateUsd);
    return NextResponse.json({ holdings, totalUsd, isApproximate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load token holdings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

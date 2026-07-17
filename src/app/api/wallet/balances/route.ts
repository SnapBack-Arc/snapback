import { NextResponse } from "next/server";
import type { Address } from "viem";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getNativeBalance, getUsdcBalance } from "@/lib/viem";
import { getGatewayBalance } from "@/lib/gateway";

/**
 * GET /api/wallet/balances — USDC (ERC-20, 6dp), native gas (USDC-as-gas, 18dp),
 * and Gateway available balance for the user's wallet. Each value is a string.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const wallet = await getUserWallet(session.uid);
    if (!wallet) {
      return NextResponse.json({ error: "no wallet" }, { status: 404 });
    }
    const address = wallet.address as Address;
    const [usdc, gas, gateway] = await Promise.all([
      getUsdcBalance(address),
      getNativeBalance(address),
      getGatewayBalance(address),
    ]);
    return NextResponse.json({
      address,
      usdc: usdc.formatted,
      gas: gas.formatted,
      gateway: gateway?.formatted ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read balances";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

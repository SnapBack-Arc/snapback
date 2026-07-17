import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

/** GET /api/wallet — the logged-in user's ARC-TESTNET wallet, or null. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const wallet = await getUserWallet(session.uid);
    return NextResponse.json({ wallet });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load wallet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

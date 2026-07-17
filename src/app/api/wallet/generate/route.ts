import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet, createArcWalletForUser } from "@/lib/circle-wallets";

/**
 * POST /api/wallet/generate — create the user's ARC-TESTNET SCA wallet.
 * Idempotent: returns the existing wallet if one already exists.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const existing = await getUserWallet(session.uid);
    if (existing) return NextResponse.json({ wallet: existing });

    const wallet = await createArcWalletForUser(session.uid);
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate wallet";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

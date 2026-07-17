import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet, createArcWalletForUser } from "@/lib/circle-wallets";
import { isDemoModeEnabled, DEMO_NEW_ACCOUNT_EMAIL, DEMO_NEW_WALLET_REF_ID } from "@/lib/demo/config";

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

    // newAccount's wallet is reset (deleted) on every demo selection, but its
    // underlying Circle wallet is reused via refId — see lib/demo/reset.ts —
    // so a faucet funding done once survives every subsequent demo reset.
    const refId =
      isDemoModeEnabled() && session.email === DEMO_NEW_ACCOUNT_EMAIL
        ? DEMO_NEW_WALLET_REF_ID
        : undefined;
    const wallet = await createArcWalletForUser(session.uid, refId);
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate wallet";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { persistUserControlledWallet } from "@/lib/circle-user-wallets";

/**
 * POST /api/auth/wallet-complete
 * Body: { userToken }
 * Called after the client's Circle SDK reports the PIN-setup challenge
 * (started in /api/auth/session) completed. Fetches the resulting
 * user-controlled wallet from Circle and persists it. Uses the session
 * cookie (not a client-supplied id) to identify which user it belongs to.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { userToken } = await request.json();
    if (typeof userToken !== "string") {
      return NextResponse.json({ error: "userToken is required" }, { status: 400 });
    }

    const wallet = await persistUserControlledWallet(session.uid, userToken);
    return NextResponse.json({ wallet: { id: wallet.id, address: wallet.address } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wallet setup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

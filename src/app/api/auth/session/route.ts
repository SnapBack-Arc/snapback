import { NextResponse } from "next/server";
import { resolveCircleUserId } from "@/lib/circle-user";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSession, clearSession } from "@/lib/session";
import { getUserControlledWalletsClient } from "@/lib/circle";
import { getUserWallet } from "@/lib/circle-wallets";
import { CIRCLE_ARC_BLOCKCHAIN } from "@/lib/arc";

/**
 * POST /api/auth/session
 * Body: { email, userToken }
 * Validates the web-SDK userToken with Circle, upserts the Supabase user, and
 * sets a signed session cookie. If the user has no wallet yet, also starts
 * Circle's PIN-setup challenge (createUserPinWithWallets) and returns its
 * challengeId so the client can complete it in Circle's hosted UI — the
 * wallet itself isn't persisted until that challenge completes (see
 * /api/auth/wallet-complete).
 */
export async function POST(request: Request) {
  try {
    const { email, userToken } = await request.json();
    if (typeof email !== "string" || typeof userToken !== "string") {
      return NextResponse.json(
        { error: "email and userToken are required" },
        { status: 400 },
      );
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Validate the login and get the Circle user id (best-effort).
    const circleUserId = await resolveCircleUserId(userToken);

    const supabase = createServiceSupabase();
    const { data, error } = await supabase
      .from("users")
      .upsert(
        { email: normalizedEmail, circle_user_id: circleUserId },
        { onConflict: "email" },
      )
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to upsert user" },
        { status: 500 },
      );
    }

    await createSession(data.id, data.email);

    const existingWallet = await getUserWallet(data.id);
    if (existingWallet) {
      return NextResponse.json({ user: { id: data.id, email: data.email } });
    }

    // First-time login with no wallet yet: start real PIN-setup wallet
    // creation. createUserPinWithWallets is the correct endpoint for
    // initial signup (createWallet requires an existing PIN).
    const client = getUserControlledWalletsClient();
    const pin = await client.createUserPinWithWallets({
      userToken,
      blockchains: [CIRCLE_ARC_BLOCKCHAIN],
      accountType: "SCA",
    });
    const challengeId = pin.data?.challengeId;
    if (!challengeId) {
      throw new Error("Circle did not return a PIN-setup challenge");
    }

    return NextResponse.json({
      user: { id: data.id, email: data.email },
      challengeId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/auth/session — logout. */
export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

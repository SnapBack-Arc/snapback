import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createPinOnlyUser } from "@/lib/circle-user";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSession } from "@/lib/session";

/**
 * POST /api/auth/pin-signup
 * Body: { email }
 * PIN-only signup fallback alongside the email-OTP flow (see
 * /api/auth/session): skips device token + OTP verification entirely.
 * Creates a brand-new Circle end user, mints its userToken directly, and
 * starts the PIN-setup challenge. Returns the userToken/encryptionKey so the
 * client can complete the challenge with sdk.execute() via
 * sdk.updateConfigs({ authentication: ... }); the resulting wallet is
 * persisted the same way as the OTP flow, via /api/auth/wallet-complete.
 *
 * New users only: if the email already has an account (OTP or otherwise),
 * this rejects rather than upserting, so it can never silently overwrite an
 * existing user's circle_user_id.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createServiceSupabase();
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please use \"Sign up with email\" instead." },
        { status: 409 },
      );
    }

    const userId = randomUUID();
    const { userToken, encryptionKey, challengeId } = await createPinOnlyUser(userId);

    const { data, error } = await supabase
      .from("users")
      .insert({ email: normalizedEmail, circle_user_id: userId })
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to create user" },
        { status: 500 },
      );
    }

    await createSession(data.id, data.email);

    return NextResponse.json({
      user: { id: data.id, email: data.email },
      userToken,
      encryptionKey,
      challengeId,
    });
  } catch (err) {
    console.error("[diag] pin-signup error:", JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
    const message = err instanceof Error ? err.message : "PIN signup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

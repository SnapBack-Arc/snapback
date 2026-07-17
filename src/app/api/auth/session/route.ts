import { NextResponse } from "next/server";
import { resolveCircleUserId } from "@/lib/circle-user";
import { createServiceSupabase } from "@/lib/supabase/server";
import { createSession, clearSession } from "@/lib/session";

/**
 * POST /api/auth/session
 * Body: { email, userToken }
 * Validates the web-SDK userToken with Circle, upserts the Supabase user, and
 * sets a signed session cookie.
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
    return NextResponse.json({ user: { id: data.id, email: data.email } });
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

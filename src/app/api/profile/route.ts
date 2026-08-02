import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createServiceSupabase } from "@/lib/supabase/server";

const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * PATCH /api/profile
 * Body: { displayName: string }
 *
 * Sets users.display_name for the logged-in account — the first real write
 * path to this column for a genuine (non judge-panel-seeded) user.
 */
export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let displayName: string;
  try {
    ({ displayName } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof displayName !== "string") {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const trimmed = displayName.trim();
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json(
      { error: `displayName must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer` },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabase();
  const { error } = await supabase
    .from("users")
    .update({ display_name: trimmed.length > 0 ? trimmed : null })
    .eq("id", session.uid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ displayName: trimmed.length > 0 ? trimmed : null });
}

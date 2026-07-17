import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { isDemoModeEnabled, demoPersonaEmail, type DemoPersona } from "@/lib/demo/config";
import { ensureDemoTestAccountSeeded, ensureUserId } from "@/lib/demo/seed";
import { resetDemoNewAccount } from "@/lib/demo/reset";

/**
 * POST /api/auth/demo
 * Body: { persona: "test" | "new" }
 *
 * Bypasses real Circle email-OTP for the two fixed demo accounts, gated
 * behind NEXT_PUBLIC_DEMO_MODE (checked here too, not just hidden in the UI
 * — a disabled flag must 404 even against a hand-crafted request).
 *
 * "test" seeds (once, idempotently) testAccount@snapback.com with a fixed
 * history and reuses it every time. "new" resets newAccount@snapback.com
 * back to a wallet-less state on every call, so it always re-triggers the
 * real first-time onboarding flow.
 */
export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let persona: string;
  try {
    ({ persona } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (persona !== "test" && persona !== "new") {
    return NextResponse.json({ error: "persona must be 'test' or 'new'" }, { status: 400 });
  }

  try {
    const email = demoPersonaEmail(persona as DemoPersona);
    const userId =
      persona === "test"
        ? (await ensureDemoTestAccountSeeded()).userId
        : await ensureUserId(email);

    if (persona === "new") {
      await resetDemoNewAccount(userId);
    }

    await createSession(userId, email);
    return NextResponse.json({ user: { id: userId, email } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

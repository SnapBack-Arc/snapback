import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { isDemoModeEnabled, demoPersonaEmail, type DemoPersona } from "@/lib/demo/config";
import { ensureDemoTestAccountSeeded, ensureDemoAdminAccountSeeded, ensureUserId } from "@/lib/demo/seed";
import { resetDemoNewAccount } from "@/lib/demo/reset";

/**
 * POST /api/auth/demo
 * Body: { persona: "test" | "new" | "admin" }
 *
 * Bypasses real Circle email-OTP for the fixed demo accounts, gated behind
 * NEXT_PUBLIC_DEMO_MODE (checked here too, not just hidden in the UI — a
 * disabled flag must 404 even against a hand-crafted request).
 *
 * "test" seeds (once, idempotently) testAccount@snapback.com with a fixed
 * history and reuses it every time. "new" resets newAccount@snapback.com
 * back to a wallet-less state on every call, so it always re-triggers the
 * real first-time onboarding flow. "admin" ensures adminAccount@snapback.com
 * has a real wallet (no fabricated history) — whether it actually lands on
 * /admin is decided purely by requireAdmin()'s ADMIN_WALLET_ADDRESSES check
 * against that wallet's real address, same gate a real admin wallet goes
 * through.
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
  if (persona !== "test" && persona !== "new" && persona !== "admin") {
    return NextResponse.json({ error: "persona must be 'test', 'new', or 'admin'" }, { status: 400 });
  }

  try {
    const email = demoPersonaEmail(persona as DemoPersona);
    let userId: string;
    if (persona === "test") {
      userId = (await ensureDemoTestAccountSeeded()).userId;
    } else if (persona === "admin") {
      userId = (await ensureDemoAdminAccountSeeded()).userId;
    } else {
      userId = await ensureUserId(email);
      await resetDemoNewAccount(userId);
    }

    await createSession(userId, email);
    return NextResponse.json({ user: { id: userId, email } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Demo login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

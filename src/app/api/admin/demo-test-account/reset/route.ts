import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { resetDemoTestAccount } from "@/lib/admin-actions";

/**
 * POST /api/admin/demo-test-account/reset
 * Body: { confirmText: "CONFIRM" }
 *
 * Wipes testAccount@snapback.com's task/payment history back to the 5
 * baseline seeded cases, discarding any real activity layered on top. The
 * only way this account's history is ever cleared — see
 * lib/demo/seed.ts's ensureDemoTestAccountSeeded docblock for why the old
 * login-triggered auto-purge was removed.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let confirmText: unknown;
  try {
    ({ confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }

  try {
    const result = await resetDemoTestAccount(auth.wallet.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reset demo test account";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

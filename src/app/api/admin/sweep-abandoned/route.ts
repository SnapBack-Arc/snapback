import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { sweepAllAbandonedNow } from "@/lib/admin-actions";

/**
 * POST /api/admin/sweep-abandoned
 * Body: { confirmText: "CONFIRM" }
 *
 * Sweeps every currently-active Estimator session's held escrow to Treasury
 * right now, not just the ones already past the idle-abandonment window.
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
    const result = await sweepAllAbandonedNow(auth.wallet.id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sweep sessions";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

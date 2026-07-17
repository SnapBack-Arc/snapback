import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { manualSweepSession } from "@/lib/admin-actions";

/**
 * POST /api/admin/sessions/[id]/sweep
 * Body: { confirmText: "CONFIRM" }
 *
 * Sweeps one active Estimator quote-phase session's held escrow to Treasury
 * immediately, regardless of the abandonment idle window.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

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
    const result = await manualSweepSession(auth.wallet.id, id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sweep session";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

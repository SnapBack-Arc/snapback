import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { triggerAutoReleaseForTask } from "@/lib/admin-actions";

/**
 * POST /api/admin/tasks/[id]/auto-release
 * Body: { confirmText: "CONFIRM" }
 *
 * Calls SnapBackEscrow.autoRelease() on-chain, signed by the admin's own
 * wallet (the call is permissionless — any wallet can trigger it once the
 * accept window has elapsed). Reverts on-chain if the window hasn't elapsed
 * yet; that revert surfaces here as a 502.
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
    const result = await triggerAutoReleaseForTask(
      auth.wallet.id,
      auth.wallet.circle_wallet_id,
      id,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to trigger autoRelease";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

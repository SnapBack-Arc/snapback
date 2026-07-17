import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { flagWallet } from "@/lib/wallet-flags";

/**
 * POST /api/admin/users/[walletId]/flag
 * Body: { reason: string, confirmText: "CONFIRM" }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ walletId: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { walletId } = await params;

  let reason: unknown;
  let confirmText: unknown;
  try {
    ({ reason, confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    await flagWallet(auth.wallet.id, walletId, reason.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to flag user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

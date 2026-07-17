import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { unflagWallet } from "@/lib/wallet-flags";

/**
 * POST /api/admin/users/[walletId]/unflag
 * Body: { confirmText: "CONFIRM" }
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
    await unflagWallet(auth.wallet.id, walletId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unflag user";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

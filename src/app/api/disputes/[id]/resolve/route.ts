import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { isAdminAddress } from "@/lib/admin";
import { resolveDispute } from "@/lib/disputes/service";

/**
 * POST /api/disputes/[id]/resolve
 * Body: { outcome: "favor_payer" | "favor_payee" }
 *
 * Records a judge panel's verdict: settles the filing fee (forfeit on a
 * loss, refund on a win) and updates the buyer's dispute-abuse stats.
 *
 * There's no on-chain event listener bridging JudgeRegistry.finalize() to
 * this ledger yet — this is the manual trigger point in the meantime,
 * mirroring how /api/validate is the manual trigger for validation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet || !isAdminAddress(wallet.address)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let outcome: string;
  try {
    ({ outcome } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (outcome !== "favor_payer" && outcome !== "favor_payee") {
    return NextResponse.json(
      { error: "outcome must be 'favor_payer' or 'favor_payee'" },
      { status: 400 },
    );
  }

  try {
    await resolveDispute(id, outcome);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve dispute";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

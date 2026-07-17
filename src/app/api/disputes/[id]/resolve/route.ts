import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { resolveDispute } from "@/lib/disputes/service";
import { logAdminAction } from "@/lib/admin-audit";

/**
 * POST /api/disputes/[id]/resolve
 * Body: { outcome: "favor_payer" | "favor_payee", confirmText: "CONFIRM" }
 *
 * Records a verdict: settles the filing fee (forfeit on a loss, refund on a
 * win) and updates the buyer's dispute-abuse stats.
 *
 * There is no real judge-draw/vote pipeline wired up yet (JudgeRegistry's
 * on-chain selectPanel/finalize are real but owner-gated by the Foundry
 * deployer key, never a live Circle wallet, and the real judgePool has no
 * staked judges) — this route is the admin's manual override in the
 * meantime, the "force-resolve a stuck dispute" admin-dashboard action.
 * It settles the off-chain bookkeeping only; it does not itself touch the
 * on-chain escrow (SnapBackEscrow.resolveDispute is onlyArbiter = the
 * JudgeRegistry contract, not this route).
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

  let outcome: string;
  let confirmText: unknown;
  try {
    ({ outcome, confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }
  if (outcome !== "favor_payer" && outcome !== "favor_payee") {
    return NextResponse.json(
      { error: "outcome must be 'favor_payer' or 'favor_payee'" },
      { status: 400 },
    );
  }

  try {
    await resolveDispute(id, outcome);
    await logAdminAction({
      adminWalletId: auth.wallet.id,
      action: "force_resolve_dispute",
      targetType: "dispute",
      targetId: id,
      details: { outcome },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resolve dispute";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { resolveDispute } from "@/lib/disputes/service";
import { logAdminAction } from "@/lib/admin-audit";

/**
 * POST /api/disputes/[id]/resolve
 * Body: { outcome: "favor_payer" | "favor_payee", confirmText: "CONFIRM" }
 *
 * Records a verdict: settles the filing fee (forfeit on a loss, refund on a
 * win), updates the buyer's dispute-abuse stats, and — for a `standard`
 * dispute — actually resolves the frozen job on-chain by calling
 * SnapBackEscrow.resolveDispute(jobId, favorBuyer, reason) as the contract's
 * `arbiter` (lib/disputes/service.ts:resolveDispute).
 *
 * The real AI judge panel (lib/disputes/judge-panel.ts) is now the default
 * resolution path and calls this same `resolveDispute` itself — this route
 * is the admin's emergency manual override, kept for a dispute the panel
 * can't cleanly resolve (escalated with no clean 5-judge majority) or any
 * other stuck case, the "force-resolve a stuck dispute" admin-dashboard
 * action. It is no longer the default/expected path.
 *
 * PRIORITY FIX: SnapBackEscrow.arbiter used to be JudgeRegistry — a contract
 * nothing calls — so this route previously only ever updated the off-chain
 * `disputes` row while the on-chain job stayed frozen and funds never moved.
 * `arbiter` is now repointed (contracts/script/SetArbiterToAppWallet.s.sol)
 * at a Circle-managed `arbiter` app_wallet this route signs through, same
 * as every other on-chain call in this app — never a raw key.
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

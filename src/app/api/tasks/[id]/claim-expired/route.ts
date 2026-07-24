import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { claimExpiredTaskRefund, TaskNotExpiredError } from "@/lib/tasks/claim-expired";

/**
 * POST /api/tasks/[id]/claim-expired
 *
 * Buyer reclaims escrow for a task whose seller never submitted before the
 * on-chain expiry window — see lib/tasks/claim-expired.ts. Ownership
 * (task.payer_wallet_id === this wallet) is enforced inside the service
 * function, same pattern as /api/tasks/[id]/contest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: taskId } = await params;

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  try {
    const result = await claimExpiredTaskRefund(taskId, wallet.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TaskNotExpiredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to claim expired escrow";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

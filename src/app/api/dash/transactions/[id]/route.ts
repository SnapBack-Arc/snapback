import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { isAdminAddress } from "@/lib/admin";
import { getTransactionDetail } from "@/lib/transaction-detail";

/**
 * GET /api/dash/transactions/[id]
 *
 * Behind-the-scenes detail for one nanopayment_validations row, for the
 * dashboard's click-to-expand modal. Callable by the row's own wallet owner,
 * or by an admin viewing a user's dashboard from /admin/system/users/[walletId]
 * (same allowlist DashboardView is already reused for) — anyone else gets 403.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  const { id } = await params;
  const detail = await getTransactionDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const isOwner = detail.walletId === wallet.id;
  if (!isOwner && !isAdminAddress(wallet.address)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json(detail);
}

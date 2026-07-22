import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { filePostApprovalContest } from "@/lib/disputes/contest";

/**
 * POST /api/tasks/[id]/contest
 * Body: { reason, confirmText }
 *
 * Files a post-approval contest against an already auto-approved task —
 * distinct from a standard dispute since the validator already found no
 * fault. Charges an upfront fee higher than a normal dispute filing fee;
 * escalates to the same 3-judge panel via lib/disputes/service.ts.
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

  let reason: string;
  let confirmText: string;
  try {
    ({ reason, confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  if (reason.trim().length < 20) {
    return NextResponse.json({ error: "reason must be at least 20 characters" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  try {
    const result = await filePostApprovalContest(taskId, wallet.id, reason.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to file contest";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

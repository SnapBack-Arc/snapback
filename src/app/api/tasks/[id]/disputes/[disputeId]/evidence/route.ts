import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { submitDisputeEvidence } from "@/lib/disputes/evidence";

/**
 * POST /api/tasks/[id]/disputes/[disputeId]/evidence
 * Body: { text }
 *
 * Lets either party to a task (buyer or seller — symmetric, see
 * lib/disputes/evidence.ts) submit supporting evidence/a rebuttal while a
 * dispute on that task is still open and its evidence window hasn't closed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; disputeId: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id: taskId, disputeId } = await params;

  let text: unknown;
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  const supabase = createServiceSupabase();
  const { data: task } = await supabase
    .from("tasks")
    .select("payer_wallet_id, payee_wallet_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const role =
    task.payer_wallet_id === wallet.id ? "buyer" : task.payee_wallet_id === wallet.id ? "seller" : null;
  if (!role) {
    return NextResponse.json({ error: "not a party to this task" }, { status: 403 });
  }

  try {
    await submitDisputeEvidence({ disputeId, taskId, role, text: text.trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit evidence";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

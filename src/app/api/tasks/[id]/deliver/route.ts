import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { runResearchSourcingAgent } from "@/lib/agents/research-sourcing";
import { runValidation } from "@/lib/validator-service";

const RESEARCH_SOURCING_AGENT_MARKER = "research-sourcing";

/**
 * POST /api/tasks/[id]/deliver
 *
 * Triggers the ONE real, non-simulated worker agent (Research & Sourcing —
 * see lib/agents/research-sourcing.ts and README.md "Simulated vs. real
 * sellers") to actually execute a task and submit its deliverable. This is
 * the only place that's special-cased to this one listing — once the
 * deliverable exists, it goes through runValidation() exactly like any
 * other seller's submission would, no special-casing there.
 *
 * Every other seed listing has no execution behind it at all; there is no
 * equivalent "deliver" trigger for them, by design — they're placeholder
 * inventory demonstrating the payment/escrow/dispute infrastructure, not
 * simulated workers.
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
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  const { id: taskId } = await params;
  const supabase = createServiceSupabase();
  const { data: task } = await supabase
    .from("tasks")
    .select("*, listings(sla)")
    .eq("id", taskId)
    .maybeSingle();

  if (!task || (task.payer_wallet_id !== wallet.id && task.payee_wallet_id !== wallet.id)) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const listingSla = task.listings?.sla as { agent?: string } | null;
  if (listingSla?.agent !== RESEARCH_SOURCING_AGENT_MARKER) {
    return NextResponse.json(
      { error: "This task's seller doesn't have an automated worker to run." },
      { status: 400 },
    );
  }

  try {
    const deliverable = await runResearchSourcingAgent(task.description ?? task.title);
    const result = await runValidation(taskId, deliverable);
    return NextResponse.json({ deliverable, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

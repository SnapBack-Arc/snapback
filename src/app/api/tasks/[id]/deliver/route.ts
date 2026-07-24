import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { runResearchSourcingAgent } from "@/lib/agents/research-sourcing";
import { runValidation } from "@/lib/validator-service";
import { BASE_CHAIN_ID } from "@/lib/base";

const RESEARCH_SOURCING_AGENT_MARKER = "research-sourcing";

/**
 * POST /api/tasks/[id]/deliver
 *
 * Triggers SnapBack's one real, non-simulated worker agent (Research &
 * Sourcing — see lib/agents/research-sourcing.ts and README.md "Research &
 * Sourcing — the one real integration") to actually execute a task and
 * submit its deliverable. This is the only place that's special-cased to
 * this listing — once the deliverable exists, it goes through
 * runValidation() exactly like any other seller's submission would, no
 * special-casing there.
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
    const { deliverable, parallelPayment, parallelPaymentError } = await runResearchSourcingAgent(
      task.description ?? task.title,
    );

    // Real-money ledger entry for the Parallel marketplace payment — always
    // written, whether it succeeded (real amount, real tx hash, real Base
    // mainnet chain_id) or failed (recorded as $0, status 'failed', so the
    // ledger never shows the expected $0.01 for a charge that didn't
    // actually happen).
    await supabase.from("payments").insert(
      parallelPayment
        ? {
            task_id: taskId,
            kind: "marketplace_payment",
            status: "released",
            amount_usdc: parallelPayment.amountUsdc,
            tx_hash: parallelPayment.txHash,
            chain_id: BASE_CHAIN_ID,
            metadata: {
              service: "parallel",
              payer_address: parallelPayment.payerAddress,
              payee_address: parallelPayment.payeeAddress,
              network: "eip155:8453",
            },
          }
        : {
            task_id: taskId,
            kind: "marketplace_payment",
            status: "failed",
            amount_usdc: 0,
            tx_hash: null,
            chain_id: BASE_CHAIN_ID,
            metadata: {
              service: "parallel",
              reason: "payment_failed_fell_back_to_web_search",
              error: parallelPaymentError,
            },
          },
    );

    const result = await runValidation(taskId, deliverable);
    return NextResponse.json({ deliverable, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

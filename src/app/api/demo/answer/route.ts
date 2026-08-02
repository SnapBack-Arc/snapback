import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { runResearchSourcingAgent } from "@/lib/agents/research-sourcing";
import { createServiceSupabase } from "@/lib/supabase/server";
import { BASE_CHAIN_ID } from "@/lib/base";
import { NANOPAYMENT_SITE } from "@/lib/nanopayment-insurance";

/**
 * POST /api/demo/answer
 * Body: { instruction: string }
 *
 * Home page's "Get Answer" step — this is the real agent-to-agent
 * nanopayment SnapBack exists to insure: a genuine, non-simulated x402
 * payment to Parallel (lib/agents/parallel-client.ts) alongside Claude's own
 * web_search, same real spend runResearchSourcingAgent makes for a funded
 * task (see /api/tasks/[id]/deliver). No task/escrow/seller here — this
 * nanopayment is standalone, tracked by wallet directly (task_id stays
 * null, same as any task-less marketplace_payment row), and its amount +
 * payment id are handed back to the client so the "Verify" step can insure
 * this exact charge if the answer turns out wrong. If the real Parallel
 * payment fails, the answer still comes back (Claude's web_search alone),
 * just with nothing to insure — recorded as $0, never the expected charge
 * for a payment that didn't happen.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  let instruction: string;
  try {
    ({ instruction } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!instruction || !instruction.trim()) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }

  try {
    const { deliverable, parallelPayment, parallelPaymentError } = await runResearchSourcingAgent(instruction);

    const supabase = createServiceSupabase();
    const { data: paymentRow } = await supabase
      .from("payments")
      .insert(
        parallelPayment
          ? {
              kind: "marketplace_payment",
              status: "released",
              amount_usdc: parallelPayment.amountUsdc,
              tx_hash: parallelPayment.txHash,
              chain_id: BASE_CHAIN_ID,
              metadata: {
                service: "parallel",
                site: NANOPAYMENT_SITE,
                payer_address: parallelPayment.payerAddress,
                payee_address: parallelPayment.payeeAddress,
                network: "eip155:8453",
                demo: true,
              },
            }
          : {
              kind: "marketplace_payment",
              status: "failed",
              amount_usdc: 0,
              tx_hash: null,
              chain_id: BASE_CHAIN_ID,
              metadata: {
                service: "parallel",
                site: NANOPAYMENT_SITE,
                reason: "payment_failed_fell_back_to_web_search",
                error: parallelPaymentError,
                demo: true,
              },
            },
      )
      .select("id")
      .single();

    return NextResponse.json({
      deliverable,
      nanopayment: {
        paymentId: paymentRow?.id ?? null,
        amountUsdc: parallelPayment?.amountUsdc ?? 0,
        site: NANOPAYMENT_SITE,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get an answer";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

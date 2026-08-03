import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { runDemoAnswerAgent } from "@/lib/agents/demo-answer";
import { createServiceSupabase } from "@/lib/supabase/server";
import { BASE_CHAIN_ID } from "@/lib/base";
import { NANOPAYMENT_SITE } from "@/lib/nanopayment-insurance";
import { estimateCallCostUsd } from "@/lib/llm-cost";

/**
 * POST /api/demo/answer
 * Body: { instruction: string }
 *
 * Home page's "Get Answer" step — this is the real agent-to-agent
 * nanopayment SnapBack exists to insure: a genuine, non-simulated x402
 * payment to Parallel (lib/agents/parallel-client.ts). Unlike the funded-task
 * delivery path (runResearchSourcingAgent, see /api/tasks/[id]/deliver),
 * this step's only job is to produce something for "Verify" to judge, not to
 * do independent research itself — so it spends one cheap claude-haiku-4-5
 * call (lib/agents/demo-answer.ts) lightly reformatting Parallel's real
 * result, no web_search, no research/structure split. No task/escrow/seller
 * here — this nanopayment is standalone, tracked by wallet directly (task_id
 * stays null, same as any task-less marketplace_payment row), and its amount
 * + payment id are handed back to the client so the "Verify" step can insure
 * this exact charge if the answer turns out wrong. If the real Parallel
 * payment fails, the answer still comes back (the formatting call says so
 * plainly instead of fabricating one), just with nothing to insure —
 * recorded as $0, never the expected charge for a payment that didn't
 * happen.
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
    const { deliverable, parallelPayment, parallelPaymentError, usage } = await runDemoAnswerAgent(instruction);

    // Real cost of the one Haiku formatting call this step makes — logged
    // regardless of whether Parallel's payment succeeded, since that call
    // runs either way (lib/agents/demo-answer.ts). null only if the rate
    // table (lib/llm-cost.ts) ever falls behind a model change again.
    const llmCost = {
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      real_cost_usdc: estimateCallCostUsd(usage.model, usage),
    };

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
                llm_cost: llmCost,
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
                reason: "payment_failed_no_live_search_data",
                error: parallelPaymentError,
                demo: true,
                llm_cost: llmCost,
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
      llmCost,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get an answer";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

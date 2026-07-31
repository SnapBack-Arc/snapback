import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { runFreeResearch } from "@/lib/agents/research-sourcing";

/**
 * POST /api/demo/answer
 * Body: { instruction: string }
 *
 * Home page's "Get Answer" step — a real but free Claude web_search answer,
 * standing in for "some free marketplace agent answered you." Deliberately
 * never touches the paid Parallel/x402 call /api/tasks/[id]/deliver uses for
 * a funded task; no escrow, no seller, nothing charged here.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
    const { deliverable } = await runFreeResearch(instruction);
    return NextResponse.json({ deliverable });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get an answer";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

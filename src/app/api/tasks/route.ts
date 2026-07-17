import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createAndFundTask } from "@/lib/tasks/create";

/**
 * POST /api/tasks
 * Body: { estimatorSessionId, listingId, title, description?, policyId? }
 *
 * Buyer commissions a task from an Estimator quote + a chosen Marketplace
 * listing: creates the task, credits the quote-phase escrow toward it, and
 * creates + funds the matching ERC-8183 job on-chain.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: {
    estimatorSessionId?: string;
    listingId?: string;
    title?: string;
    description?: string;
    policyId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { estimatorSessionId, listingId, title, description, policyId } = body;
  if (!estimatorSessionId || !listingId || !title) {
    return NextResponse.json(
      { error: "estimatorSessionId, listingId, and title are required" },
      { status: 400 },
    );
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  try {
    const result = await createAndFundTask({
      buyerWalletId: wallet.id,
      estimatorSessionId,
      listingId,
      title,
      description,
      policyId: policyId ?? null,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

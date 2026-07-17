import { NextResponse } from "next/server";
import { sweepAbandonedSessions } from "@/lib/estimator/service";
import { requireServerEnv } from "@/lib/env";

/**
 * POST /api/estimator/sweep — keeper endpoint.
 *
 * Sweeps quote-phase escrow for sessions idle past the abandonment window to the
 * Treasury Wallet. Not user-facing: guarded by a shared secret so a cron/keeper
 * can call it. Safe to run repeatedly.
 */
export async function POST(request: Request) {
  const provided = request.headers.get("x-keeper-secret");
  let expected: string;
  try {
    expected = requireServerEnv("KEEPER_SECRET");
  } catch {
    return NextResponse.json(
      { error: "KEEPER_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const swept = await sweepAbandonedSessions();
    return NextResponse.json({ swept_count: swept.length, swept });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sweep failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

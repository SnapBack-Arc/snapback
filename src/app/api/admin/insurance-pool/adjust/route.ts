import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { adjustInsurancePool } from "@/lib/admin-actions";

/**
 * POST /api/admin/insurance-pool/adjust
 * Body: { direction: "top_up" | "withdraw", amount_usdc: number, reason: string, confirmText: "CONFIRM" }
 *
 * Bookkeeping-only: the insurance pool is a logical sub-balance of the
 * Treasury wallet (see insurance_pool_adjustments in the 0009 migration),
 * not a separate on-chain wallet — no real fund movement happens here.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let direction: unknown;
  let amount_usdc: unknown;
  let reason: unknown;
  let confirmText: unknown;
  try {
    ({ direction, amount_usdc, reason, confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }
  if (direction !== "top_up" && direction !== "withdraw") {
    return NextResponse.json(
      { error: 'direction must be "top_up" or "withdraw"' },
      { status: 400 },
    );
  }
  if (typeof amount_usdc !== "number" || !(amount_usdc > 0)) {
    return NextResponse.json({ error: "amount_usdc must be a positive number" }, { status: 400 });
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const result = await adjustInsurancePool(auth.wallet.id, direction, amount_usdc, reason.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to adjust insurance pool";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

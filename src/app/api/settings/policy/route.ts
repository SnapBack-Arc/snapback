import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";
import { getActivePolicy } from "@/lib/policy-data";

type PolicyBody = {
  name: string;
  maxAmountUsdc: number | null;
  dailyLimitUsdc: number | null;
  accuracyTolerance: number | null;
};

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/settings/policy
 *
 * Creates or updates the wallet's active spending/safety policy — the first
 * write path this app has ever had to the `policies` table (previously
 * read-only: lib/estimator/fees.ts's budget-ceiling check, lib/admin-data.ts,
 * lib/validator-service.ts). Since there's no DB constraint enforcing a
 * single active policy per wallet, this always updates the existing active
 * row in place rather than inserting a second one, so the "most recent
 * active row" read those call sites already do stays correct.
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

  let body: PolicyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const accuracyTolerance = toNullableNumber(body.accuracyTolerance);
  if (accuracyTolerance !== null && (accuracyTolerance < 0 || accuracyTolerance > 1)) {
    return NextResponse.json({ error: "accuracyTolerance must be between 0 and 1" }, { status: 400 });
  }

  const fields = {
    name,
    max_amount_usdc: toNullableNumber(body.maxAmountUsdc),
    daily_limit_usdc: toNullableNumber(body.dailyLimitUsdc),
    accuracy_tolerance: accuracyTolerance,
  };

  const supabase = createServiceSupabase();
  const existing = await getActivePolicy(wallet.id);

  const { data, error } = existing
    ? await supabase.from("policies").update(fields).eq("id", existing.id).select().single()
    : await supabase
        .from("policies")
        .insert({ ...fields, wallet_id: wallet.id, active: true })
        .select()
        .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to save policy" }, { status: 500 });
  }
  return NextResponse.json({ policy: data });
}

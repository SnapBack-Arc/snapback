import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * GET /api/wallet/withdrawals
 *
 * Recent withdrawal destinations for the Withdraw modal's "Recents" list —
 * real prior withdrawals only (deduped by address), never seeded. Starts
 * empty for every wallet and only grows once a real withdrawal completes.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const wallet = await getUserWallet(session.uid);
  if (!wallet) {
    return NextResponse.json({ error: "no wallet" }, { status: 404 });
  }

  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("payments")
    .select("tx_hash, created_at, metadata")
    .eq("from_wallet_id", wallet.id)
    .eq("kind", "withdrawal")
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const seen = new Set<string>();
  const recents: { address: string; lastUsedAt: string }[] = [];
  for (const r of rows) {
    const address = (r.metadata as { to_address?: string } | null)?.to_address;
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    recents.push({ address, lastUsedAt: r.created_at });
    if (recents.length >= 5) break;
  }

  return NextResponse.json({ recents });
}

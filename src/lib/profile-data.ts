import "server-only";
import { createServiceSupabase } from "@/lib/supabase/server";

export type ProfileData = {
  displayName: string | null;
  memberSince: string;
  tasksAsBuyer: number;
  tasksAsSeller: number;
  validationsRun: number;
  validationsFlagged: number;
  totalInsuredUsdc: number;
};

export async function getProfileData(userId: string, walletId: string | null): Promise<ProfileData> {
  const supabase = createServiceSupabase();

  const [{ data: user }, { count: tasksAsBuyer }, { count: tasksAsSeller }, { data: validations }] =
    await Promise.all([
      supabase.from("users").select("display_name, created_at").eq("id", userId).maybeSingle(),
      walletId
        ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("payer_wallet_id", walletId)
        : Promise.resolve({ count: 0 }),
      walletId
        ? supabase.from("tasks").select("id", { count: "exact", head: true }).eq("payee_wallet_id", walletId)
        : Promise.resolve({ count: 0 }),
      walletId
        ? supabase.from("nanopayment_validations").select("verdict, payout_usdc").eq("wallet_id", walletId)
        : Promise.resolve({ data: [] as { verdict: string; payout_usdc: number }[] }),
    ]);

  const validationRows = validations ?? [];

  return {
    displayName: user?.display_name ?? null,
    memberSince: user?.created_at ?? new Date().toISOString(),
    tasksAsBuyer: tasksAsBuyer ?? 0,
    tasksAsSeller: tasksAsSeller ?? 0,
    validationsRun: validationRows.length,
    validationsFlagged: validationRows.filter((v) => v.verdict === "incorrect").length,
    totalInsuredUsdc: validationRows.reduce((s, v) => s + Number(v.payout_usdc), 0),
  };
}

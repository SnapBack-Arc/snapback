import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import DashboardView from "@/components/DashboardView";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getDashboardData } from "@/lib/dashboard-data";
import { isAdminAddress } from "@/lib/admin";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  if (wallet && isAdminAddress(wallet.address)) redirect("/admin/system");

  const data = wallet
    ? await getDashboardData(wallet.id)
    : {
        nanopaymentsMonitored: 0,
        nanopaymentsMonitoredDeltaPct: null,
        paidBackThisMonthUsdc: 0,
        flaggedNanopaymentsThisMonthCount: 0,
        flaggedTodayPct: null,
        flaggedTodayCount: 0,
        flagRateLast7Days: [],
        recentTransactions: [],
      };

  return (
    <main className="min-h-screen">
      <Nav email={session.email} />
      <DashboardView data={data} hasWallet={!!wallet} />
    </main>
  );
}

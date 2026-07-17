import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import WalletDashboard from "@/components/WalletDashboard";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <WalletDashboard initialWallet={wallet} />
    </main>
  );
}

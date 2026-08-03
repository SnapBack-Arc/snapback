import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import WalletDashboard from "@/components/WalletDashboard";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getPaymentsForWallet } from "@/lib/history";
import { isCompletedDepositLeg, isPaidBackToWallet } from "@/lib/admin-history-format";

export default async function WalletPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const payments = wallet ? await getPaymentsForWallet(wallet.id) : [];

  const lifetimeDepositsUsdc = payments
    .filter(isCompletedDepositLeg)
    .reduce((s, p) => s + Number(p.amount_usdc), 0);
  const lifetimePaidBackUsdc = wallet
    ? payments
        .filter((p) => isPaidBackToWallet(p, wallet.id))
        .reduce((s, p) => s + Number(p.amount_usdc), 0)
    : 0;

  return (
    <main className="min-h-screen">
      <Nav />
      <WalletDashboard
        initialWallet={wallet}
        payments={payments}
        lifetimeDepositsUsdc={lifetimeDepositsUsdc}
        lifetimePaidBackUsdc={lifetimePaidBackUsdc}
      />
    </main>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import PaymentHistoryTable from "@/components/PaymentHistoryTable";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getPaymentsForWallet } from "@/lib/history";

export default async function WalletHistoryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  if (!wallet) redirect("/wallet");

  const payments = await getPaymentsForWallet(wallet.id);

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
        <div>
          <Link href="/wallet" className="text-sm text-[#a1a1aa] hover:text-[#fafafa]">
            ← Back to Wallet
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-[#fafafa]">Transaction history</h1>

        <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] backdrop-blur-[28px]">
          <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
            {payments.length} transaction{payments.length === 1 ? "" : "s"}
          </div>
          <PaymentHistoryTable payments={payments} />
        </section>
      </div>
    </main>
  );
}

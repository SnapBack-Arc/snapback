import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getPaymentsForWallet } from "@/lib/history";
import { explorerTxUrl } from "@/lib/arc";
import { formatDate, formatUsdc, statusClasses } from "@/lib/format";

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const payments = wallet ? await getPaymentsForWallet(wallet.id) : [];

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-2xl font-bold text-white">Payment history</h1>

        {!wallet ? (
          <Empty>Generate a wallet to see payments.</Empty>
        ) : payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tx</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 bg-zinc-950">
                {payments.map((p) => (
                  <tr key={p.id} className="text-zinc-300">
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">
                        {p.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatUsdc(p.amount_usdc)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${statusClasses(p.status)}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.tx_hash ? (
                        <a
                          href={explorerTxUrl(p.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-emerald-400 hover:underline"
                        >
                          {p.tx_hash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span className="text-zinc-600">pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(p.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getTasksForWallet } from "@/lib/history";
import { formatDate, formatUsdc, statusClasses } from "@/lib/format";

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const tasks = wallet ? await getTasksForWallet(wallet.id) : [];

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <h1 className="text-2xl font-bold text-white">Task history</h1>

        {!wallet ? (
          <Empty>Generate a wallet to start commissioning tasks.</Empty>
        ) : tasks.length === 0 ? (
          <Empty>No tasks yet.</Empty>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const role =
                task.payer_wallet_id === wallet.id ? "Buyer" : "Seller";
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-white">
                          {task.title}
                        </h2>
                        <span className="rounded-full bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-300">
                          {role}
                        </span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-sm text-zinc-400">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses(task.status)}`}
                    >
                      {task.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
                    <span>Amount: {formatUsdc(task.amount_usdc)}</span>
                    <span>Quotes: {task.quotes.length}</span>
                    <span>Disputes: {task.disputes.length}</span>
                    <span>Created: {formatDate(task.created_at)}</span>
                  </div>

                  {task.disputes.length > 0 && (
                    <div className="mt-3 border-t border-zinc-800 pt-3">
                      {task.disputes.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center gap-2 text-xs text-zinc-400"
                        >
                          <span
                            className={`rounded-full px-2 py-0.5 ${statusClasses(d.status)}`}
                          >
                            dispute · {d.status}
                          </span>
                          <span>outcome: {d.outcome}</span>
                          {d.reason && <span>· {d.reason}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
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

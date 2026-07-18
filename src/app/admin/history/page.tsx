import Link from "next/link";
import { listBuyersWithTaskHistory } from "@/lib/admin-history";
import { shortAddress } from "@/lib/format";

/**
 * Read-only task history & money trail — level 1 (buyer list). This page
 * and /admin/history/[walletId] never call an admin action route or write
 * to admin_audit_log; they only SELECT via lib/admin-history.ts and
 * lib/history.ts's getTaskById(), the same function the buyer-facing task
 * detail page already uses.
 */
export default async function AdminHistoryPage() {
  const buyers = await listBuyersWithTaskHistory();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task history &amp; money trail</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Read-only record of every real buyer&apos;s tasks — what was asked, what was delivered,
            how it was judged, and every real fund movement. Nothing on this page takes an action.
          </p>
        </div>
        <Link href="/admin/users" className="text-sm text-emerald-400 hover:underline">
          Users (operations) →
        </Link>
      </div>

      {buyers.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
          No buyers with tasks yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {buyers.map((b) => (
                <tr key={b.wallet_id} className="text-zinc-300 hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/history/${b.wallet_id}`}
                      className="font-mono text-emerald-400 hover:underline"
                    >
                      {shortAddress(b.address)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{b.email || "—"}</td>
                  <td className="px-4 py-3">{b.task_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

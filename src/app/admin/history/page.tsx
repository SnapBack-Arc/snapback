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
    <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa]">Task history &amp; money trail</h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">
            Read-only record of every real buyer&apos;s tasks — what was asked, what was delivered,
            how it was judged, and every real fund movement. Nothing on this page takes an action.
          </p>
        </div>
        <Link href="/admin/users" className="text-sm text-[#10b981] hover:underline">
          Users (operations) →
        </Link>
      </div>

      {buyers.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-[#a1a1aa]">
          No buyers with tasks yet.
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#71717a]">
                <tr>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff14]">
                {buyers.map((b) => (
                  <tr key={b.wallet_id} className="text-[#fafafa] hover:bg-[#ffffff0a]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/history/${b.wallet_id}`}
                        className="font-mono text-[#10b981] hover:underline"
                      >
                        {shortAddress(b.address)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa]">{b.email || "—"}</td>
                    <td className="px-4 py-3">{b.task_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

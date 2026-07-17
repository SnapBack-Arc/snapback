import Link from "next/link";
import { listUsersForAdmin } from "@/lib/admin-data";
import { shortAddress, formatDate, formatUsdc } from "@/lib/format";

export default async function AdminUsersPage() {
  const users = await listUsersForAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-white">Users</h1>

      {users.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-400">
          No users yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Tasks</th>
                <th className="px-4 py-3">Volume</th>
                <th className="px-4 py-3">Disputes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {users.map((u) => (
                <tr key={u.wallet_id} className="text-zinc-300 hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.wallet_id}`}
                      className="font-mono text-emerald-400 hover:underline"
                    >
                      {shortAddress(u.address)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{u.email || "—"}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {formatDate(u.joined_at)}
                  </td>
                  <td className="px-4 py-3">{u.task_count}</td>
                  <td className="px-4 py-3 font-mono">
                    {formatUsdc(u.total_volume_usdc)}
                  </td>
                  <td className="px-4 py-3">{u.dispute_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

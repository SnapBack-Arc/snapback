import Link from "next/link";
import { listUsersForAdmin } from "@/lib/admin-data";
import { shortAddress, formatDate, formatUsdc } from "@/lib/format";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const users = await listUsersForAdmin(q);

  return (
    <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
      <h1 className="text-2xl font-bold text-[#fafafa]">Users</h1>

      <form action="/admin/users" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by address or email…"
          className="w-full max-w-sm rounded-lg border border-[#3f3f46] bg-[#18181b] px-3 py-2 text-sm text-[#fafafa] outline-none focus:border-[#10b981]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#10b981] px-4 py-2 text-sm font-semibold text-[#052e1f] transition hover:bg-[#34d399]"
        >
          Search
        </button>
        {q && (
          <Link
            href="/admin/users"
            className="rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#a1a1aa] transition hover:bg-[#ffffff0a]"
          >
            Clear
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-[#a1a1aa]">
          {q ? `No users match "${q}".` : "No users yet."}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#71717a]">
                <tr>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Tasks</th>
                  <th className="px-4 py-3">Volume</th>
                  <th className="px-4 py-3">Disputes</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ffffff14]">
                {users.map((u) => (
                  <tr key={u.wallet_id} className="text-[#fafafa] hover:bg-[#ffffff0a]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/users/${u.wallet_id}`}
                        className="font-mono text-[#10b981] hover:underline"
                      >
                        {shortAddress(u.address)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa]">{u.email || "—"}</td>
                    <td className="px-4 py-3 text-[#71717a]">{formatDate(u.joined_at)}</td>
                    <td className="px-4 py-3">{u.task_count}</td>
                    <td className="px-4 py-3 font-mono">{formatUsdc(u.total_volume_usdc)}</td>
                    <td className="px-4 py-3">{u.dispute_count}</td>
                    <td className="px-4 py-3">
                      {u.flagged && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                          Paused
                        </span>
                      )}
                    </td>
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

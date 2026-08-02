"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SystemUserRow } from "@/lib/admin-data";

function formatDollars(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SystemUserList({ users }: { users: SystemUserRow[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(term) || u.email.toLowerCase().includes(term),
    );
  }, [users, search]);

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users by name or email..."
        className="mx-auto block w-full max-w-xl rounded-full border border-[#ffffff14] bg-[#18181b73] px-5 py-3 text-center text-sm text-[#fafafa] placeholder:text-[#71717a] backdrop-blur-[20px] focus:border-[#10b981] focus:outline-none"
      />

      <div className="text-xs uppercase tracking-wide text-[#71717a]">
        {filtered.length.toLocaleString()} users
      </div>

      <div className="glass-card divide-y divide-[#ffffff14] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#a1a1aa]">No users match that search.</div>
        ) : (
          filtered.map((u) => {
            const content = (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffffff14] text-sm font-semibold text-[#fafafa]">
                    {u.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#fafafa]">{u.displayName}</div>
                    <div className="truncate text-xs text-[#71717a]">{u.email}</div>
                    <div className="font-mono text-xs text-[#52525b]">{u.userId}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-6 text-right">
                  <div>
                    <div className="font-mono text-sm font-semibold text-[#fafafa]">
                      {u.monitored.toLocaleString()}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-[#71717a]">monitored</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-semibold text-amber-400">
                      {u.flaggedPct === null ? "—" : `${Math.round(u.flaggedPct)}%`}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-[#71717a]">flagged</div>
                  </div>
                  <div>
                    <div className="font-mono text-sm font-semibold text-emerald-400">
                      {formatDollars(u.paidBackUsdc)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-[#71717a]">paid back</div>
                  </div>
                </div>
              </>
            );
            return u.walletId ? (
              <Link
                key={u.userId}
                href={`/admin/system/users/${u.walletId}`}
                className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-[#ffffff08]"
              >
                {content}
              </Link>
            ) : (
              <div key={u.userId} className="flex items-center justify-between gap-4 px-6 py-4 opacity-60">
                {content}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

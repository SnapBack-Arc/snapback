"use client";

import { useState } from "react";
import type { FlagRateDay, RecentFlaggedExample } from "@/lib/dashboard-data";
import type { SiteReliability } from "@/lib/nanopayment-insurance";
import { formatDate } from "@/lib/format";

/**
 * Replaces the old bare "N flagged today" ring — a 0 there reads as "nothing
 * ever goes wrong", which undersells what this app actually does. This
 * version leads with volume ("N checked today"), and an expandable panel
 * backs "0 flagged" with real signals instead of just a quiet number: a
 * 7-day trend, a real catch from this wallet's own history (or, honestly,
 * the platform-wide rate if this wallet has never had one), and a one-line
 * explanation of what flagging actually does. Nothing here is invented —
 * every figure traces back to real nanopayment_validations rows.
 */
export default function FlaggedTodayWidget({
  flaggedTodayPct,
  flaggedTodayCount,
  todayCheckedCount,
  flagRateLast7Days,
  recentFlaggedExample,
  siteReliability,
}: {
  flaggedTodayPct: number | null;
  flaggedTodayCount: number;
  todayCheckedCount: number;
  flagRateLast7Days: FlagRateDay[];
  recentFlaggedExample: RecentFlaggedExample | null;
  siteReliability: SiteReliability;
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanPct = flaggedTodayPct === null ? null : 100 - flaggedTodayPct;

  const last7Checked = flagRateLast7Days.reduce((s, d) => s + d.total, 0);
  const last7Flagged = flagRateLast7Days.reduce((s, d) => s + d.flagged, 0);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-4">
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#84cc16 ${(cleanPct ?? 0) * 3.6}deg, var(--glass-border) 0deg)`,
          }}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0c0c0e]">
            <span className="font-mono text-sm font-semibold text-[#84cc16]">
              {cleanPct === null ? "—" : `${Math.round(cleanPct)}%`}
            </span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-[#71717a]">Checked today</div>
          <div className="font-mono text-lg font-semibold text-[#fafafa]">{todayCheckedCount.toLocaleString()}</div>
          <div className="text-xs text-[#71717a]">
            {flaggedTodayCount.toLocaleString()} flagged{cleanPct !== null ? ` · ${Math.round(cleanPct)}% clean` : ""}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-between text-xs text-[#a1a1aa] hover:text-[#fafafa]"
      >
        <span>What flagging actually catches</span>
        <span>{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[#ffffff14] pt-3 text-xs">
          <p className="text-[#a1a1aa]">
            Last 7 days: <span className="font-mono text-[#fafafa]">{last7Flagged}</span> flagged out of{" "}
            <span className="font-mono text-[#fafafa]">{last7Checked}</span> checked
            {last7Checked > 0 ? ` (${Math.round((last7Flagged / last7Checked) * 100)}%)` : ""}.
          </p>

          {recentFlaggedExample ? (
            <p className="text-[#a1a1aa]">
              Real catch: <span className="text-[#d4d4d8]">&ldquo;{recentFlaggedExample.title}&rdquo;</span> from{" "}
              {recentFlaggedExample.site} on {formatDate(recentFlaggedExample.createdAt)} — refunded{" "}
              <span className="text-emerald-400">${recentFlaggedExample.payoutUsdc.toFixed(2)}</span>.
            </p>
          ) : siteReliability.totalCount > 0 ? (
            <p className="text-[#a1a1aa]">
              You haven&apos;t had a flagged nanopayment yet. Across every SnapBack wallet, {siteReliability.site}{" "}
              answers come back correct {Math.round(siteReliability.smoothedCorrectRate * 100)}% of the time —
              flagging is what catches the rest before you pay for a wrong one.
            </p>
          ) : (
            <p className="text-[#a1a1aa]">
              You haven&apos;t had a flagged nanopayment yet, and there&apos;s no site history yet either — flagging
              kicks in the moment a paid answer doesn&apos;t match what was actually asked.
            </p>
          )}

          <p className="text-[#71717a]">
            Every nanopayment is judged against your original request the moment you verify it — a mismatch gets
            flagged automatically, and an unusual miss for that source is insured with a real payout, not just noted.
          </p>
        </div>
      )}
    </div>
  );
}

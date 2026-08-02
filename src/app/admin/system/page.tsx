import Link from "next/link";
import { getSystemOverview } from "@/lib/admin-data";

function formatDollars(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function AdminSystemPage() {
  const data = await getSystemOverview();

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 900px 500px at 50% -10%, #7c3aed26 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa]">System dashboard</h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">Coverage and flag activity across every user on SnapBack.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Stat label="Total nanopayments monitored" value={data.totalNanopaymentsMonitored.toLocaleString()} />
          <Stat
            label="Avg. flag rate"
            value={data.avgFlagRatePct === null ? "—" : `${data.avgFlagRatePct.toFixed(1)}%`}
            valueClass="text-amber-400"
          />
          <Stat label="Total paid back" value={formatDollars(data.totalPaidBackUsdc)} valueClass="text-emerald-400" />
          <Stat label="Total users" value={data.totalUsers.toLocaleString()} />
          <Stat label="Verification fees collected" value={formatDollars(data.verificationFeesCollectedUsdc)} />
          <Stat
            label="Net position"
            value={formatDollars(data.netPositionUsdc)}
            valueClass={data.netPositionUsdc >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>

        <Link
          href="/admin/system/users"
          className="flex items-center justify-between gap-6 rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px] transition hover:border-[#ffffff2a] hover:bg-[#18181b]"
        >
          <div>
            <div className="text-lg font-semibold text-[#fafafa]">All users</div>
            <p className="mt-1 text-sm text-[#a1a1aa]">
              {data.totalUsers.toLocaleString()} users covered by SnapBack — browse each one's own
              monitoring dashboard.
            </p>
          </div>
          <span className="text-2xl text-[#71717a]">→</span>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-bold text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

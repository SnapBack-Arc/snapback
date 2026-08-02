import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import ProfileNameForm from "@/components/ProfileNameForm";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getProfileData } from "@/lib/profile-data";
import { shortAddress } from "@/lib/format";
import { ARC_EXPLORER_URL } from "@/lib/arc";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const data = await getProfileData(session.uid, wallet?.id ?? null);

  return (
    <main className="min-h-screen">
      <Nav email={session.email} />
      <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa]">Profile</h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">Your identity and standing on SnapBack.</p>
        </div>

        <section className="glass-card space-y-4 p-6">
          <div className="text-xs uppercase tracking-wide text-[#71717a]">Identity</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-[#71717a]">Email</div>
              <div className="mt-1 text-sm text-[#fafafa]">{session.email}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[#71717a]">Member since</div>
              <div className="mt-1 text-sm text-[#fafafa]">
                {new Date(data.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[#71717a]">Wallet address</div>
              {wallet ? (
                <a
                  href={`${ARC_EXPLORER_URL}/address/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block font-mono text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:underline"
                >
                  {shortAddress(wallet.address)}
                </a>
              ) : (
                <div className="mt-1 text-sm text-[#71717a]">No wallet yet</div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[#71717a]">Network</div>
              <div className="mt-1 text-sm text-[#fafafa]">{wallet?.blockchain ?? "—"}</div>
            </div>
          </div>
          <div className="border-t border-[#ffffff14] pt-4">
            <ProfileNameForm initialDisplayName={data.displayName} />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <StatCard label="Tasks as buyer" value={data.tasksAsBuyer.toLocaleString()} />
          <StatCard label="Tasks as seller" value={data.tasksAsSeller.toLocaleString()} />
        </div>

        <section className="glass-card p-6">
          <div className="mb-4 text-xs uppercase tracking-wide text-[#71717a]">Validation history</div>
          {data.validationsRun > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <MiniStat label="Nanopayments validated" value={data.validationsRun} />
              <MiniStat label="Flagged" value={data.validationsFlagged} valueClass="text-red-400" />
              <MiniStat
                label="Total insured"
                value={`$${data.totalInsuredUsdc.toFixed(2)}`}
                valueClass="text-emerald-400"
              />
            </div>
          ) : (
            <p className="text-sm text-[#a1a1aa]">
              No nanopayments validated yet — try the Demo page to get an agent-to-agent answer
              verified.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold text-[#fafafa]">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number | string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

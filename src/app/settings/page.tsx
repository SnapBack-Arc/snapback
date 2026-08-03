import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import PolicyForm from "@/components/PolicyForm";
import ThemeToggle from "@/components/ThemeToggle";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";
import { getActivePolicy } from "@/lib/policy-data";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getUserWallet(session.uid);
  const policy = wallet ? await getActivePolicy(wallet.id) : null;

  return (
    <main className="min-h-screen">
      <Nav />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
        <div>
          <h1 className="text-2xl font-bold text-[#fafafa]">Settings</h1>
          <p className="mt-1 text-sm text-[#a1a1aa]">
            Your standing policy — applied to every nanopayment SnapBack validates for you.
          </p>
        </div>

        <section className="glass-card p-6">
          <div className="mb-4 text-xs uppercase tracking-wide text-[#71717a]">Appearance</div>
          <ThemeToggle />
        </section>

        {!wallet ? (
          <div className="glass-card p-8 text-center text-sm text-[#a1a1aa]">
            Generate a wallet before setting a spending policy.
          </div>
        ) : (
          <section className="glass-card p-6">
            <div className="mb-4 text-xs uppercase tracking-wide text-[#71717a]">Spending &amp; safety policy</div>
            <PolicyForm initialPolicy={policy} />
          </section>
        )}

        <section className="glass-card p-6 opacity-70">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[#71717a]">Notifications</span>
            <span className="rounded-full border border-dashed border-[#f59e0b66] bg-[#f59e0b0f] px-2 py-0.5 text-[10px] font-semibold italic text-[#f59e0b]">
              Not live yet
            </span>
          </div>
          <p className="text-sm text-[#a1a1aa]">
            Email or webhook alerts when one of your nanopayments gets flagged — no notification path
            exists in this app yet.
          </p>
        </section>

        <section className="glass-card p-6 opacity-70">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-[#71717a]">Danger zone</span>
            <span className="rounded-full border border-dashed border-[#f59e0b66] bg-[#f59e0b0f] px-2 py-0.5 text-[10px] font-semibold italic text-[#f59e0b]">
              Not live yet
            </span>
          </div>
          <p className="text-sm text-[#a1a1aa]">
            Deleting your account isn&apos;t wired up — there&apos;s no account-deletion path in this app
            yet, so this stays disabled rather than pretending to work.
          </p>
        </section>
      </div>
    </main>
  );
}

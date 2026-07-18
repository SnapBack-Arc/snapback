import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import TaskSubmissionFlow from "@/components/TaskSubmissionFlow";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Can't commission a task (or hold quote-phase escrow) without a wallet —
  // send them to generate one first, same as every other wallet-scoped page.
  const wallet = await getUserWallet(session.uid);
  if (!wallet) redirect("/dashboard");

  // Populated when landing here via a rejected task's "Resubmit as a new
  // task" link (src/app/tasks/[id]/page.tsx) — the original spec plus the
  // validator-rejection feedback's carry-forward context, pre-filled but
  // fully editable. This is a brand-new, separately-quoted-and-funded task
  // through the normal flow below; nothing here submits or charges anything
  // automatically.
  const { prefill } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <TaskSubmissionFlow initialSpecText={prefill} />
    </main>
  );
}

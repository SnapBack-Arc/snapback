import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import TaskSubmissionFlow from "@/components/TaskSubmissionFlow";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Can't commission a task (or hold quote-phase escrow) without a wallet —
  // send them to generate one first, same as every other wallet-scoped page.
  const wallet = await getUserWallet(session.uid);
  if (!wallet) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <TaskSubmissionFlow />
    </main>
  );
}

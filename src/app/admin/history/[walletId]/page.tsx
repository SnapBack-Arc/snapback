import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceSupabase } from "@/lib/supabase/server";
import { listTaskIdsForBuyer } from "@/lib/admin-history";
import { getTaskById, type TaskDetail } from "@/lib/history";
import { shortAddress } from "@/lib/format";
import TaskHistoryAccordion from "@/components/admin/TaskHistoryAccordion";

/**
 * Read-only — level 2/3 (task rows + expanded story + money trail) for one
 * buyer. Fetches full detail up front via the existing getTaskById() (same
 * function the buyer-facing task page uses) and hands it to a client
 * component that only ever toggles local expand/collapse state — no action
 * route, no admin_audit_log write, anywhere on this page.
 */
export default async function AdminHistoryBuyerPage({
  params,
}: {
  params: Promise<{ walletId: string }>;
}) {
  const { walletId } = await params;
  const supabase = createServiceSupabase();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, address, users(email)")
    .eq("id", walletId)
    .maybeSingle();
  if (!wallet) notFound();
  const user = wallet.users as unknown as { email: string } | null;

  const taskIds = await listTaskIdsForBuyer(walletId);
  const tasks = (
    await Promise.all(taskIds.map((id) => getTaskById(id, walletId)))
  ).filter((t): t is TaskDetail => t !== null);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link href="/admin/history" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All buyers
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <h1 className="font-mono text-xl font-bold text-white">{shortAddress(wallet.address)}</h1>
          {user?.email && <span className="text-sm text-zinc-500">{user.email}</span>}
        </div>
        <p className="mt-1 text-sm text-zinc-400">{tasks.length} task(s)</p>
      </div>

      <TaskHistoryAccordion tasks={tasks} />
    </div>
  );
}

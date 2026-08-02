import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function AdminDeniedPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card max-w-sm space-y-3 p-8 text-center">
        <h1 className="text-xl font-bold text-[#fafafa]">You aren&apos;t allowed here</h1>
        <p className="text-sm text-[#a1a1aa]">
          This section is restricted to SnapBack admin accounts.
        </p>
        <Link
          href="/dash"
          className="mt-2 inline-block rounded-xl bg-[#10b981] px-4 py-2 text-sm font-semibold text-[#052e1f] transition hover:bg-[#34d399]"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}

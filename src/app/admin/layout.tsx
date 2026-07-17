import { requireAdmin } from "@/lib/admin";
import Nav from "@/components/Nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireAdmin();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav email={session.email} />
      <div className="border-b border-amber-900/40 bg-amber-950/20 px-6 py-2 text-center text-xs text-amber-400">
        Admin area — visible only to allowlisted wallet addresses
      </div>
      {children}
    </div>
  );
}

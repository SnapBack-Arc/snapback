import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import { getSession } from "@/lib/session";

// Honest placeholder — the real Dashboard content hasn't been designed
// yet. Deliberately not an alias of /tasks or any other existing page;
// this is its own route so a future redesign has somewhere real to land.
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen">
      <Nav email={session.email} />
      <div className="mx-auto flex max-w-[1600px] items-center justify-center px-16 py-32">
        <div className="glass-card px-12 py-10 text-center">
          <h1 className="text-xl font-semibold text-[#fafafa]">Dashboard</h1>
          <p className="mt-2 text-sm text-[#a1a1aa]">Redesign coming next.</p>
        </div>
      </div>
    </main>
  );
}

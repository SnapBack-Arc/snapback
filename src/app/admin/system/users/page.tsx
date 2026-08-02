import Link from "next/link";
import { getSystemOverview } from "@/lib/admin-data";
import SystemUserList from "@/components/admin/SystemUserList";

export default async function AdminSystemUsersPage() {
  const data = await getSystemOverview();

  return (
    <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
      <div>
        <Link href="/admin/system" className="text-sm text-[#a1a1aa] hover:text-[#fafafa]">
          ← Back to System dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-[#fafafa]">All users</h1>
        <p className="mt-1 text-sm text-[#a1a1aa]">
          Click a user to see their own monitoring dashboard.
        </p>
      </div>

      <SystemUserList users={data.users} />
    </div>
  );
}

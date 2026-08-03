import { requireAdmin } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";
import { getMyUserId } from "@/lib/my-user-id";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireAdmin();
  const userId = await getMyUserId(session.uid);

  return (
    <div className="min-h-screen">
      <AdminNav email={session.email} userId={userId} />
      {children}
    </div>
  );
}

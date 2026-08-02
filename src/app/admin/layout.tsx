import { requireAdmin } from "@/lib/admin";
import AdminNav from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireAdmin();

  return (
    <div className="min-h-screen">
      <AdminNav email={session.email} />
      {children}
    </div>
  );
}

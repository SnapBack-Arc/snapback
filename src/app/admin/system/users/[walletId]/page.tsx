import Link from "next/link";
import { notFound } from "next/navigation";
import { getWalletOwner } from "@/lib/admin-data";
import { getDashboardData } from "@/lib/dashboard-data";
import DashboardView from "@/components/DashboardView";

export default async function AdminUserDashboardPage({
  params,
}: {
  params: Promise<{ walletId: string }>;
}) {
  const { walletId } = await params;

  const owner = await getWalletOwner(walletId);
  if (!owner) notFound();

  const data = await getDashboardData(walletId);

  return (
    <div className="mx-auto w-full space-y-2 px-[clamp(1rem,3vw,4rem)] pt-8">
      <Link href="/admin/system/users" className="text-sm text-[#a1a1aa] hover:text-[#fafafa]">
        ← Back to all users
      </Link>
      <DashboardView
        data={data}
        hasWallet
        title={`${owner.displayName}'s dashboard`}
        subtitle={`Nanopayments ${owner.email} has been involved in this month.`}
      />
    </div>
  );
}

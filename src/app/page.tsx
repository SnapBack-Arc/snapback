import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import VerifyFlow from "@/components/VerifyFlow";
import HomeMarketing from "@/components/home/HomeMarketing";
import { getSession } from "@/lib/session";
import { getUserWallet } from "@/lib/circle-wallets";

export default async function Home() {
  const session = await getSession();
  if (!session) return <HomeMarketing />;

  // The Verify step charges a small real fee from this wallet (see
  // /api/demo/verify) — send them to generate one first, same as every
  // other wallet-scoped page.
  const wallet = await getUserWallet(session.uid);
  if (!wallet) redirect("/wallet");

  return (
    <main className="min-h-screen">
      <Nav email={session.email} />
      <VerifyFlow />
    </main>
  );
}

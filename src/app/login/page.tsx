import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Snap<span className="text-emerald-400">Back</span>
          </h1>
          <p className="text-sm text-zinc-400">
            Sign in with email to access your Arc wallet.
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-zinc-600">
          Powered by Circle User-Controlled Wallets · Arc Testnet
        </p>
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/wallet");

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <LoginForm />
    </main>
  );
}

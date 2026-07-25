import Image from "next/image";
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
        <div className="space-y-6 text-center">
          <p className="text-xs text-zinc-600">
            Powered by Circle User-Controlled Wallets · Arc Testnet
          </p>
          {/*
            Official Arc "Built on" badge — white lockup (public/arc-logo-white.png,
            from Circle's own Arc_Logos.zip brand asset kit), the correct variant for
            this page's dark (zinc-950) background. Unmodified, undistorted (width/
            height preserve the source's exact 500:171 aspect ratio), rendered at
            52px height (above the 50px minimum, kept close to the floor and
            monochrome/muted so it stays secondary to the SnapBack wordmark above).
            space-y-6 above gives it ~24px of clear space from the text line, and
            nothing else sits beside or below it, comfortably clearing Arc's "1x
            inner-arch-height" clear-space rule on every side.
          */}
          <div className="flex justify-center">
            <Image
              src="/arc-logo-white.png"
              alt="Built on Arc"
              width={152}
              height={52}
              priority
            />
          </div>
        </div>
      </div>
    </main>
  );
}

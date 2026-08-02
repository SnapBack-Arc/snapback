"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/wallet", label: "Wallet" },
  { href: "/", label: "Demo" },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="border-b border-[#ffffff14] bg-[#0c0c0eb3] backdrop-blur-[20px]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-16 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-[#fafafa]">
            Snap<span className="text-[#10b981]">Back</span>
          </span>
          <div className="flex gap-1">
            {LINKS.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-[#ffffff14] text-[#fafafa]"
                      : "text-[#a1a1aa] hover:text-[#fafafa]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-[#71717a] sm:inline">{email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-[#3f3f46] px-3 py-1.5 text-sm text-[#a1a1aa] transition hover:bg-[#ffffff0a]"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

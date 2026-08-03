"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SettingsMenu from "@/components/SettingsMenu";

const LINKS = [
  { href: "/admin/system", label: "System" },
  { href: "/admin/treasury", label: "Treasury" },
];

export default function AdminNav({ email, userId }: { email: string; userId: string }) {
  const pathname = usePathname();

  return (
    <nav className="relative z-40 border-b border-[#ffffff14] bg-[#0c0c0eb3] backdrop-blur-[20px]">
      <div className="mx-auto flex w-full items-center justify-between px-[clamp(1rem,3vw,4rem)] py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 font-semibold text-[#fafafa]">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#10b981] text-xs font-bold text-[#052e1f]">
              S
            </span>
            SnapBack
          </span>
          <div className="flex gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
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
        <SettingsMenu email={email} userId={userId} />
      </div>
    </nav>
  );
}

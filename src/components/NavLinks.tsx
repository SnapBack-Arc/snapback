"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dash", label: "Dashboard" },
  { href: "/wallet", label: "Wallet" },
  { href: "/demo", label: "Demo" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              active ? "bg-[#ffffff14] text-[#fafafa]" : "text-[#a1a1aa] hover:text-[#fafafa]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}

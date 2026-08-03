"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SettingsMenu({ email, userId }: { email: string; userId: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [spins, setSpins] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative flex items-center">
      <button
        onClick={() => {
          setMenuOpen((open) => !open);
          setSpins((s) => s + 1);
        }}
        aria-label="Settings"
        aria-expanded={menuOpen}
        className="rounded-lg p-2 text-[#a1a1aa] transition hover:bg-[#ffffff0a] hover:text-[#fafafa]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-5 w-5 transition-transform duration-500 ease-in-out"
          style={{ transform: `rotate(${spins * 360}deg)` }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>
      <div
        className={`absolute right-0 top-full z-50 mt-2 w-56 origin-top-right rounded-lg border border-[#ffffff14] bg-[#18181bf2] p-1.5 shadow-lg backdrop-blur-[28px] transition-all duration-200 ease-out ${
          menuOpen
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
        aria-hidden={!menuOpen}
      >
        <div className="px-2.5 py-2">
          <div className="truncate text-xs text-[#71717a]">{email}</div>
          <div className="mt-0.5 font-mono text-[11px] text-[#52525b]">ID {userId}</div>
        </div>
        <div className="mt-1 space-y-0.5">
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm font-semibold text-[#fafafa] transition hover:bg-[#ffffff0a]"
          >
            Profile
          </Link>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            tabIndex={menuOpen ? 0 : -1}
            className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm font-semibold text-[#fafafa] transition hover:bg-[#ffffff0a]"
          >
            Settings
          </Link>
        </div>
        <div className="my-1.5 border-t border-[#ffffff14]" />
        <button
          onClick={logout}
          tabIndex={menuOpen ? 0 : -1}
          className="w-full rounded-md px-2.5 py-1.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

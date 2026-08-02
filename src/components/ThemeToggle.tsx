"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/** Real, working theme switch — persisted to localStorage and applied via
 *  data-theme on <html>, which the light-theme overrides in globals.css key
 *  off. See layout.tsx's inline script for the before-paint apply on load. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setTheme(stored === "light" ? "light" : "dark");
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div className="inline-flex rounded-lg border border-[#3f3f46] p-1">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => applyTheme(t)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
            theme === t
              ? "bg-emerald-500 text-zinc-950"
              : "text-[#a1a1aa] hover:text-[#fafafa]"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

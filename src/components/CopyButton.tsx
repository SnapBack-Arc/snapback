"use client";

import { useState } from "react";

/** Small copy-to-clipboard icon button — shared by the wallet address
 *  display and the Deposit modal's "Copy Address" action. */
export default function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — no-op, button
      // simply doesn't confirm; nothing else to fall back to safely.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1.5 text-[#71717a] transition-colors hover:text-[#fafafa] ${className}`}
    >
      {copied ? (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-emerald-400" aria-hidden="true">
          <path
            d="M4 10.5l3.5 3.5L16 6"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth={1.5} />
          <path
            d="M4.5 13H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v.5"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      )}
      {copied && <span className="text-xs text-emerald-400">Copied</span>}
    </button>
  );
}

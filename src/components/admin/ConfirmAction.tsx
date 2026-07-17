"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Every admin action that moves funds or changes user/dispute state uses
 * this: collapsed to a single button, expands to a typed "CONFIRM" gate
 * before the request fires. The server independently re-checks confirmText
 * too (see any /api/admin/* route) — this component is the UX, not the
 * enforcement.
 */
export default function ConfirmAction({
  label,
  confirmLabel,
  url,
  body,
  variant = "default",
  onDone,
}: {
  label: string;
  confirmLabel?: string;
  url: string;
  body?: Record<string, unknown>;
  variant?: "default" | "danger";
  onDone?: (result: unknown) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, confirmText }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Action failed");
      setExpanded(false);
      setConfirmText("");
      onDone?.(result);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  }

  const buttonClass =
    variant === "danger"
      ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
      : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700";

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${buttonClass}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 p-2.5">
      <p className="text-xs text-zinc-400">
        Type <span className="font-mono text-zinc-200">CONFIRM</span> to {confirmLabel ?? label.toLowerCase()}.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="CONFIRM"
          disabled={submitting}
          className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={run}
          disabled={submitting || confirmText !== "CONFIRM"}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            variant === "danger"
              ? "bg-red-500 text-zinc-950 hover:bg-red-400"
              : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          }`}
        >
          {submitting ? "Working…" : "Go"}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
            setConfirmText("");
          }}
          disabled={submitting}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

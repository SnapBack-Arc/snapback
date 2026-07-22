"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, formatUsdc } from "@/lib/format";

const MIN_REASON_LENGTH = 20;

/**
 * Lets a buyer file a post-approval contest (POST /api/tasks/[id]/contest)
 * on an auto-approved delivery within the contest window — the one path in
 * the app where a buyer actively disputes a result the validator already
 * approved, hence the typed-CONFIRM gate (same convention as
 * admin/ConfirmAction.tsx) ahead of the flat 50%-of-quote fee.
 */
export default function ContestDeliveryButton({
  taskId,
  feeUsdc,
  deadlineIso,
}: {
  taskId: string;
  feeUsdc: number;
  deadlineIso: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"collapsed" | "form" | "confirm">("collapsed");
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("collapsed");
    setReason("");
    setConfirmText("");
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/contest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, confirmText }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to file contest");
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to file contest");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "collapsed") {
    return (
      <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
        >
          Contest this delivery
        </button>
        <p className="text-xs text-zinc-500">Contest window closes {formatDate(deadlineIso)}.</p>
      </div>
    );
  }

  if (step === "form") {
    return (
      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div>
          <p className="text-sm font-medium text-amber-300">Contest this delivery</p>
          <p className="mt-1 text-xs text-zinc-400">
            What&apos;s wrong with this delivery? This goes to the AI judge panel alongside the
            task spec, seller SLA, and delivered work.
          </p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What's wrong with this delivery?"
          rows={4}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
        />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {reason.trim().length}/{MIN_REASON_LENGTH} min characters
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("confirm")}
            disabled={reason.trim().length < MIN_REASON_LENGTH}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-sm text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div>
        <p className="text-sm font-medium text-amber-300">Confirm contest</p>
        <p className="mt-2 text-xs text-zinc-500">Your objection:</p>
        <p className="mt-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
          {reason}
        </p>
      </div>
      <p className="text-xs text-amber-200/80">
        Filing this contest will charge you {formatUsdc(feeUsdc)} (50% of the guaranteed total)
        regardless of outcome.
      </p>
      <div>
        <p className="text-xs text-zinc-400">
          Type <span className="font-mono text-zinc-200">CONFIRM</span> to file this contest.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CONFIRM"
            disabled={submitting}
            className="w-28 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-amber-500 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting || confirmText !== "CONFIRM"}
            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Filing…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => setStep("form")}
            disabled={submitting}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Back
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

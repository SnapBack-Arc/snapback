"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

/**
 * Lets a buyer reclaim escrow for a task whose seller never submitted a
 * deliverable (POST /api/tasks/[id]/claim-expired) once the on-chain expiry
 * window has elapsed. Before that, shows a disabled/informational state
 * with the date it becomes available — see lib/tasks/claim-expired.ts.
 * Same typed-CONFIRM gate as ContestDeliveryButton for the other costly
 * buyer-initiated action on this page, minus the reason step (there's
 * nothing to explain — the seller simply never delivered).
 */
export default function ClaimExpiredButton({
  taskId,
  expiredAtIso,
}: {
  taskId: string;
  expiredAtIso: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"collapsed" | "confirm">("collapsed");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer — reads Date.now() once at mount, not on every render
  // (react-hooks/purity: Date.now() is impure and can't be called directly
  // during render).
  const [eligible] = useState(() => Date.now() >= new Date(expiredAtIso).getTime());

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/claim-expired`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to claim expired escrow");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim expired escrow");
    } finally {
      setSubmitting(false);
    }
  }

  if (!eligible) {
    return (
      <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-300">
          Refund available after {formatDate(expiredAtIso)}
        </p>
        <p className="text-xs text-zinc-500">
          This task&apos;s seller hasn&apos;t submitted a deliverable yet. If that&apos;s still true
          once this window elapses, you&apos;ll be able to reclaim your full escrowed payment here.
        </p>
      </div>
    );
  }

  if (step === "collapsed") {
    return (
      <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-300">Refund available</p>
        <p className="text-xs text-zinc-400">
          This task&apos;s seller never submitted a deliverable, and the refund window has elapsed.
          You can reclaim your full escrowed payment.
        </p>
        <button
          type="button"
          onClick={() => setStep("confirm")}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
        >
          Claim refund
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium text-amber-300">Confirm refund claim</p>
      <p className="text-xs text-zinc-400">
        This calls SnapBackEscrow.claimExpired on-chain and returns your full escrowed payment.
      </p>
      <div>
        <p className="text-xs text-zinc-400">
          Type <span className="font-mono text-zinc-200">CONFIRM</span> to claim this refund.
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
            {submitting ? "Claiming…" : "Submit"}
          </button>
          <button
            type="button"
            onClick={() => setStep("collapsed")}
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

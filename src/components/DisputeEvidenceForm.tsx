"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

const MIN_EVIDENCE_LENGTH = 20;

/**
 * Lets a buyer or seller submit supporting evidence/a rebuttal while a
 * dispute on their task is still open (POST /api/tasks/[id]/disputes/
 * [disputeId]/evidence) — symmetric for both roles, unlike
 * ContestDeliveryButton (buyer-only). No fee, no typed-CONFIRM gate: unlike
 * filing a contest, this isn't a party choosing to escalate anything, just
 * supporting a dispute that's already real and already under review.
 */
export default function DisputeEvidenceForm({
  taskId,
  disputeId,
  role,
  deadlineIso,
}: {
  taskId: string;
  disputeId: string;
  role: "buyer" | "seller";
  deadlineIso: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/disputes/${disputeId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to submit evidence");
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit evidence");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return <p className="text-xs text-emerald-400">Submitted — the judge panel will weigh this.</p>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div>
        <p className="text-xs font-medium text-zinc-300">
          {role === "buyer" ? "Submit additional evidence" : "Submit a rebuttal"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Goes to the judge panel as extra context alongside the rest of the case — not a new rule, just
          more for the panel to weigh. Window closes {formatDate(deadlineIso)}.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={role === "buyer" ? "What else should the panel know?" : "What's your side of this?"}
        rows={3}
        disabled={submitting}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {text.trim().length}/{MIN_EVIDENCE_LENGTH} min characters
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || text.trim().length < MIN_EVIDENCE_LENGTH}
          className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LIVE_CATEGORY } from "@/lib/categories";

/**
 * Manually triggers the Research & Sourcing agent's real execution
 * (Claude + live web search — see lib/agents/research-sourcing.ts) for a
 * task, then refreshes the page to show the resulting validation outcome.
 * Only rendered by the task detail page when the task's listing actually
 * has an automated worker behind it.
 */
export default function DeliverButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setLongRunning(false);
    setError(null);
    // If the delivery gets disputed, the request stays open through the AI
    // judge panel's real Claude calls (lib/disputes/judge-panel.ts) before
    // it returns — typically ~4-12s on top of the agent/validator run. This
    // just swaps the button text after a beat so that doesn't read as a
    // hang; the request itself is unchanged.
    const longRunningTimer = setTimeout(() => setLongRunning(true), 4000);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliver`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Delivery failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delivery failed");
    } finally {
      clearTimeout(longRunningTimer);
      setRunning(false);
      setLongRunning(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div>
        <p className="text-sm font-medium text-cyan-300">{LIVE_CATEGORY.label} agent</p>
        <p className="mt-1 text-xs text-zinc-400">
          This seller is a real worker, not a placeholder — running it actually calls Claude with
          live web search, produces a sourced deliverable, and submits it through the same
          validator every other delivery goes through.
        </p>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running
          ? longRunning
            ? "Reviewing delivery — AI judge panel may be weighing in…"
            : "Researching…"
          : "Run agent — deliver this task"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

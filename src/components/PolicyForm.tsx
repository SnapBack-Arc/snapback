"use client";

import { useState } from "react";
import type { PolicyRow } from "@/lib/supabase/types";

export default function PolicyForm({ initialPolicy }: { initialPolicy: PolicyRow | null }) {
  const [name, setName] = useState(initialPolicy?.name ?? "My spending policy");
  const [maxAmountUsdc, setMaxAmountUsdc] = useState(initialPolicy?.max_amount_usdc?.toString() ?? "");
  const [dailyLimitUsdc, setDailyLimitUsdc] = useState(initialPolicy?.daily_limit_usdc?.toString() ?? "");
  const [accuracyTolerance, setAccuracyTolerance] = useState(
    initialPolicy?.accuracy_tolerance?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, maxAmountUsdc, dailyLimitUsdc, accuracyTolerance }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save policy");
      setStatus("Policy saved — applies to your next nanopayment validation.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-[#71717a]">Policy name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={saving}
          className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Per-nanopayment ceiling (USDC)"
          hint="Max SnapBack will insure a single nanopayment for."
          value={maxAmountUsdc}
          onChange={setMaxAmountUsdc}
          disabled={saving}
        />
        <Field
          label="Daily limit (USDC)"
          hint="Rolling 24h spending ceiling across all your nanopayments."
          value={dailyLimitUsdc}
          onChange={setDailyLimitUsdc}
          disabled={saving}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-[#71717a]">
          Minimum accuracy tolerance (0–1)
        </label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={accuracyTolerance}
          onChange={(e) => setAccuracyTolerance(e.target.value)}
          placeholder="e.g. 0.9"
          disabled={saving}
          className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500"
        />
        <p className="mt-1 text-xs text-[#71717a]">
          The lowest accuracy SnapBack&apos;s validator will accept before flagging an answer as
          incorrect. Leave blank to skip this check.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save policy"}
        </button>
        {status && <p className="text-sm text-emerald-400">{status}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-[#71717a]">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="No limit"
        disabled={disabled}
        className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500"
      />
      <p className="mt-1 text-xs text-[#71717a]">{hint}</p>
    </div>
  );
}

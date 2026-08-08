"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { shortAddress, formatDate } from "@/lib/format";
import { explorerTxUrl } from "@/lib/arc";

type Recent = { address: string; lastUsedAt: string };
type Result = { status: string; txHash: string | null; amountUsdc: number; toAddress: string };

export default function WithdrawModal({
  onClose,
  walletControl,
  usdcBalance,
}: {
  onClose: () => void;
  walletControl: "developer" | "user";
  usdcBalance: string | null;
}) {
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [recents, setRecents] = useState<Recent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const available = walletControl === "developer";

  useEffect(() => {
    if (!available) return;
    let active = true;
    fetch("/api/wallet/withdrawals")
      .then((res) => res.json())
      .then((body) => {
        if (active && Array.isArray(body.recents)) setRecents(body.recents);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [available]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress, amount }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Withdraw failed");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!available) {
    return (
      <Modal title="Withdraw" onClose={onClose}>
        <p className="text-sm text-[#a1a1aa]">
          Withdraw isn&apos;t available for this wallet yet. This wallet is a Circle{" "}
          <span className="text-[#fafafa]">user-controlled</span> wallet — sending funds out requires your own PIN
          confirmation through Circle, and that confirmation flow hasn&apos;t been built into SnapBack yet. Nothing
          about this is a limitation of your funds or balance; it&apos;s a feature we haven&apos;t wired up for this
          wallet type.
        </p>
      </Modal>
    );
  }

  if (result) {
    return (
      <Modal title="Withdraw" onClose={onClose}>
        <div className="space-y-3 text-center">
          <div className="text-emerald-400">Withdrawal sent</div>
          <div className="text-2xl font-bold text-[#fafafa]">${result.amountUsdc.toFixed(2)}</div>
          <div className="text-xs text-[#71717a]">to {shortAddress(result.toAddress)}</div>
          {result.txHash && (
            <a
              href={explorerTxUrl(result.txHash)}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-emerald-400 hover:underline"
            >
              View on Arcscan
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#ffffff0a]"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Withdraw" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wide text-[#71717a]">
            Address, domain or identity
          </label>
          <input
            type="text"
            required
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="0x…"
            disabled={submitting}
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 font-mono text-sm text-[#fafafa] outline-none focus:border-emerald-500 disabled:opacity-60"
          />
        </div>

        {recents.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs uppercase tracking-wide text-[#71717a]">Recents</div>
            <div className="space-y-1">
              {recents.map((r) => (
                <button
                  key={r.address}
                  type="button"
                  onClick={() => setToAddress(r.address)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-[#a1a1aa] hover:bg-[#ffffff0a]"
                >
                  <span className="font-mono">{shortAddress(r.address)}</span>
                  <span className="text-xs text-[#71717a]">{formatDate(r.lastUsedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide text-[#71717a]">
            <span>Amount (USDC)</span>
            {usdcBalance && <span>Balance: {Number(usdcBalance).toFixed(2)}</span>}
          </div>
          <input
            type="number"
            min="0"
            step="0.000001"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={submitting}
            className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500 disabled:opacity-60"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Withdraw"}
        </button>
      </form>
    </Modal>
  );
}

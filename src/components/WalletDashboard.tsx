"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WalletRow, PaymentRow } from "@/lib/supabase/types";
import { shortAddress } from "@/lib/format";
import { ARC_EXPLORER_URL } from "@/lib/arc";
import PaymentHistoryTable from "@/components/PaymentHistoryTable";

const HISTORY_PREVIEW_COUNT = 5;

const FAUCET_URL =
  process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet.circle.com";

type Balances = {
  usdc: string;
  gas: string;
  gateway: string | null;
};

function formatDollars(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "$—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "$—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function WalletDashboard({
  initialWallet,
  payments,
  lifetimeDepositsUsdc,
  lifetimePaidBackUsdc,
}: {
  initialWallet: WalletRow | null;
  payments: PaymentRow[];
  lifetimeDepositsUsdc: number;
  lifetimePaidBackUsdc: number;
}) {
  const [wallet, setWallet] = useState<WalletRow | null>(initialWallet);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [generating, setGenerating] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBalances = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    const res = await fetch("/api/wallet/balances");
    if (res.ok) {
      setBalances(await res.json());
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to load balances");
    }
  }, [wallet]);

  // Fetch balances once the wallet is known. setState runs only after the
  // awaited fetch resolves (guarded against unmount), not synchronously.
  useEffect(() => {
    let active = true;
    if (!wallet) return;
    (async () => {
      const res = await fetch("/api/wallet/balances");
      if (!active) return;
      if (res.ok) setBalances(await res.json());
    })();
    return () => {
      active = false;
    };
  }, [wallet]);

  async function generateWallet() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/generate", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to generate wallet");
      setWallet(body.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate wallet");
    } finally {
      setGenerating(false);
    }
  }

  async function deposit(e: React.FormEvent) {
    e.preventDefault();
    setDepositing(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/wallet/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: depositAmount }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        throw new Error(body.error ?? "Deposit failed");
      }
      setStatus(
        body.status === "submitted"
          ? "Deposit submitted (approve + deposit)."
          : (body.message ?? "Deposit in progress."),
      );
      setDepositAmount("");
      loadBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setDepositing(false);
    }
  }

  return (
    <div className="mx-auto w-full space-y-6 px-[clamp(1rem,3vw,4rem)] py-12">
      <h1 className="text-2xl font-bold text-[#fafafa]">Wallet</h1>

      {!wallet ? (
        <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 text-center backdrop-blur-[28px]">
          <p className="mb-4 text-[#a1a1aa]">
            You don&apos;t have an Arc Testnet wallet yet.
          </p>
          <button
            onClick={generateWallet}
            disabled={generating}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate wallet"}
          </button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: address, balance, faucet */}
            <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]">
              <div className="mb-1 text-xs uppercase tracking-wide text-[#71717a]">
                Arc Testnet address
              </div>
              <a
                href={`${ARC_EXPLORER_URL}/address/${wallet.address}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:underline"
              >
                {shortAddress(wallet.address)}
              </a>

              <div className="mb-1 mt-6 text-xs uppercase tracking-wide text-[#71717a]">
                USDC balance
              </div>
              <div className="font-mono text-4xl font-bold text-[#fafafa]">
                {balances ? formatDollars(balances.usdc) : "$—"}
              </div>

              <div className="mt-6 flex gap-3">
                <a
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  Faucet
                </a>
                <button
                  onClick={loadBalances}
                  className="rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#ffffff0a]"
                >
                  Refresh
                </button>
              </div>
            </section>

            {/* Right: Gateway deposit / withdraw / swap */}
            <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px]">
              <div className="mb-3 text-xs uppercase tracking-wide text-[#71717a]">
                Gateway deposit
              </div>
              <form onSubmit={deposit} className="space-y-3">
                <input
                  type="number"
                  min="0"
                  step="0.000001"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount USDC"
                  required
                  disabled={depositing}
                  className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500"
                />
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="submit"
                    disabled={depositing}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {depositing ? "Depositing…" : "Deposit"}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Not live yet — no Gateway withdrawal path exists in this app"
                    className="cursor-not-allowed rounded-lg border border-dashed border-[#f59e0b66] bg-[#f59e0b0f] px-4 py-2 text-sm font-semibold italic text-[#f59e0b] opacity-70"
                  >
                    Withdraw
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Not live yet — no token-swap path exists in this app"
                    className="cursor-not-allowed rounded-lg border border-dashed border-[#f59e0b66] bg-[#f59e0b0f] px-4 py-2 text-sm font-semibold italic text-[#f59e0b] opacity-70"
                  >
                    Swap
                  </button>
                </div>
              </form>
              {status && <p className="mt-3 text-sm text-emerald-400">{status}</p>}
              <p className="mt-3 text-xs text-[#71717a]">
                Withdraw and Swap aren&apos;t wired to anything real yet — Deposit is the only live Gateway action.
              </p>
            </section>
          </div>

          {/* Lifetime stats */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <StatCard label="Lifetime deposits" value={formatDollars(lifetimeDepositsUsdc)} />
            <StatCard label="Lifetime paid back" value={formatDollars(lifetimePaidBackUsdc)} valueClass="text-emerald-400" />
            <StatCard label="Lifetime transactions" value={payments.length.toLocaleString()} />
          </div>

          {/* Transaction history */}
          <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] backdrop-blur-[28px]">
            <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
              Transaction history
            </div>
            <PaymentHistoryTable payments={payments.slice(0, HISTORY_PREVIEW_COUNT)} />
            {payments.length > HISTORY_PREVIEW_COUNT && (
              <div className="border-t border-[#ffffff14] px-6 py-4">
                <Link
                  href="/wallet/history"
                  className="text-sm font-medium text-emerald-400 hover:underline"
                >
                  View more ({payments.length - HISTORY_PREVIEW_COUNT} more)
                </Link>
              </div>
            )}
          </section>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-5 backdrop-blur-[28px]">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-xl text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletRow } from "@/lib/supabase/types";

const FAUCET_URL =
  process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet.circle.com";
const EXPLORER_URL =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app";

type Balances = {
  usdc: string;
  gas: string;
  gateway: string | null;
};

export default function WalletDashboard({
  initialWallet,
}: {
  initialWallet: WalletRow | null;
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
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-white">Wallet</h1>

      {!wallet ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="mb-4 text-zinc-300">
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
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
              Address (Arc Testnet · SCA)
            </div>
            <a
              href={`${EXPLORER_URL}/address/${wallet.address}`}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-sm text-emerald-400 hover:underline"
            >
              {wallet.address}
            </a>
          </section>

          <section className="grid grid-cols-3 gap-3">
            <Balance label="USDC" value={balances?.usdc} suffix="USDC" />
            <Balance label="Gas (native)" value={balances?.gas} suffix="USDC" />
            <Balance
              label="Gateway"
              value={balances?.gateway ?? undefined}
              suffix="USDC"
            />
          </section>

          <div className="flex gap-3">
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Fund via faucet ↗
            </a>
            <button
              onClick={loadBalances}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">
              Deposit to Gateway
            </h2>
            <form onSubmit={deposit} className="flex gap-3">
              <input
                type="number"
                min="0"
                step="0.000001"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount in USDC"
                required
                disabled={depositing}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={depositing}
                className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {depositing ? "Depositing…" : "Approve + Deposit"}
              </button>
            </form>
            {status && <p className="mt-3 text-sm text-emerald-400">{status}</p>}
          </section>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function Balance({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | undefined;
  suffix: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg text-white">
        {value ?? "—"}
        <span className="ml-1 text-xs text-zinc-500">{suffix}</span>
      </div>
    </div>
  );
}

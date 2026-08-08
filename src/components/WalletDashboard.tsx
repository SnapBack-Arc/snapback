"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WalletRow, PaymentRow } from "@/lib/supabase/types";
import type { TokenHolding } from "@/lib/token-holdings";
import { shortAddress } from "@/lib/format";
import { ARC_EXPLORER_URL } from "@/lib/arc";
import PaymentHistoryTable from "@/components/PaymentHistoryTable";
import CopyButton from "@/components/CopyButton";
import ReceiveModal from "@/components/wallet/ReceiveModal";
import WithdrawModal from "@/components/wallet/WithdrawModal";
import SwapModal from "@/components/wallet/SwapModal";
import TokenHoldingsList from "@/components/wallet/TokenHoldingsList";

const HISTORY_PREVIEW_COUNT = 5;

const FAUCET_URL =
  process.env.NEXT_PUBLIC_ARC_FAUCET_URL ?? "https://faucet.circle.com";

type Balances = {
  usdc: string;
  gas: string;
  gateway: string | null;
};

type ModalKind = "deposit" | "withdraw" | "swap" | null;

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
  const [gatewayAmount, setGatewayAmount] = useState("");
  const [gatewayDepositing, setGatewayDepositing] = useState(false);
  const [gatewayAdvancedOpen, setGatewayAdvancedOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<ModalKind>(null);
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [holdingsTotalUsd, setHoldingsTotalUsd] = useState(0);
  const [holdingsApproximate, setHoldingsApproximate] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

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

  const loadHoldings = useCallback(async () => {
    if (!wallet) return;
    setHoldingsLoading(true);
    try {
      const res = await fetch("/api/wallet/token-holdings");
      if (res.ok) {
        const body = await res.json();
        setHoldings(body.holdings ?? []);
        setHoldingsTotalUsd(body.totalUsd ?? 0);
        setHoldingsApproximate(!!body.isApproximate);
      }
    } finally {
      setHoldingsLoading(false);
    }
  }, [wallet]);

  // Fetch balances and holdings once the wallet is known. setState runs only
  // after the awaited fetch resolves (guarded against unmount), not
  // synchronously — holdingsLoading's own initial value is already true, so
  // nothing needs to set it going into this fetch, only coming out of it.
  useEffect(() => {
    let active = true;
    if (!wallet) return;
    (async () => {
      const res = await fetch("/api/wallet/balances");
      if (!active) return;
      if (res.ok) setBalances(await res.json());
    })();
    (async () => {
      const res = await fetch("/api/wallet/token-holdings");
      if (!active) return;
      if (res.ok) {
        const body = await res.json();
        setHoldings(body.holdings ?? []);
        setHoldingsTotalUsd(body.totalUsd ?? 0);
        setHoldingsApproximate(!!body.isApproximate);
      }
      if (active) setHoldingsLoading(false);
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

  async function depositToGateway(e: React.FormEvent) {
    e.preventDefault();
    setGatewayDepositing(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/wallet/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: gatewayAmount }),
      });
      const body = await res.json();
      if (!res.ok && res.status !== 202) {
        throw new Error(body.error ?? "Send to Gateway failed");
      }
      setStatus(
        body.status === "submitted"
          ? "Sent to Gateway (approve + deposit)."
          : (body.message ?? "Send to Gateway in progress."),
      );
      setGatewayAmount("");
      loadBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send to Gateway failed");
    } finally {
      setGatewayDepositing(false);
    }
  }

  function closeModalAndRefresh() {
    setOpenModal(null);
    loadBalances();
    loadHoldings();
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
          {/* Address, balance, actions, faucet — with Token Holdings filling
              the empty horizontal space beside it on wide screens. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-6 backdrop-blur-[28px] lg:col-span-2">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-[#71717a]">
                <span>Arc Testnet address</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`${ARC_EXPLORER_URL}/address/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-[#a1a1aa] hover:text-[#fafafa] hover:underline"
                >
                  {shortAddress(wallet.address)}
                </a>
                <CopyButton value={wallet.address} label="Copy address" />
              </div>

              <div className="mb-1 mt-6 text-xs uppercase tracking-wide text-[#71717a]">
                USDC balance
              </div>
              <div className="font-mono text-4xl font-bold text-[#fafafa]">
                {balances ? formatDollars(balances.usdc) : "$—"}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => setOpenModal("deposit")}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  Deposit
                </button>
                <button
                  onClick={() => setOpenModal("withdraw")}
                  className="rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#fafafa] hover:bg-[#ffffff0a]"
                >
                  Withdraw
                </button>
                <button
                  onClick={() => setOpenModal("swap")}
                  className="rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#fafafa] hover:bg-[#ffffff0a]"
                >
                  Swap
                </button>
                <a
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[#3f3f46] px-4 py-2 text-sm text-[#a1a1aa] hover:bg-[#ffffff0a]"
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

            <div className="lg:col-span-1">
              <TokenHoldingsList holdings={holdings} loading={holdingsLoading} maxVisible={5} />
            </div>
          </div>

          {/* Lifetime stats */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Sent to Gateway"
              value={formatDollars(lifetimeDepositsUsdc)}
              sub={balances?.gateway ? `Gateway balance: ${formatDollars(balances.gateway)}` : undefined}
            />
            <StatCard label="Lifetime paid back" value={formatDollars(lifetimePaidBackUsdc)} valueClass="text-emerald-400" />
            <StatCard
              label="Total wallet balance"
              value={holdingsLoading ? "$—" : formatDollars(holdingsTotalUsd)}
              sub={holdingsApproximate ? "≈ includes an approximate (placeholder) value" : undefined}
            />
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

          {/* Advanced / secondary: Send to Gateway — a distinct action from
              Deposit (see lib/gateway.ts docblock): this locks USDC into
              Circle's GatewayWallet contract for CCTP-style cross-chain
              transfers, it does not fund this wallet. Kept separate and
              de-emphasized so it's never confused with the real Deposit
              action above. */}
          <section className="rounded-xl border border-dashed border-[#3f3f46] bg-[#18181b40] p-4">
            <button
              type="button"
              onClick={() => setGatewayAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-xs uppercase tracking-wide text-[#71717a] hover:text-[#a1a1aa]"
            >
              <span>Advanced: Send to Gateway</span>
              <span>{gatewayAdvancedOpen ? "▴" : "▾"}</span>
            </button>
            {gatewayAdvancedOpen && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-[#71717a]">
                  Locks USDC from this wallet into Circle&apos;s Gateway contract for cross-chain transfers — this
                  moves USDC out of your spendable balance, it does not deposit funds into this wallet. Most people
                  want the Deposit button above instead.
                </p>
                <form onSubmit={depositToGateway} className="flex gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.000001"
                    value={gatewayAmount}
                    onChange={(e) => setGatewayAmount(e.target.value)}
                    placeholder="Amount USDC"
                    required
                    disabled={gatewayDepositing}
                    className="w-full rounded-lg border border-[#3f3f46] bg-[#09090b] px-3 py-2 text-[#fafafa] outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={gatewayDepositing}
                    className="shrink-0 rounded-lg bg-[#3f3f46] px-4 py-2 text-sm font-semibold text-[#fafafa] hover:bg-[#52525b] disabled:opacity-60"
                  >
                    {gatewayDepositing ? "Sending…" : "Send to Gateway"}
                  </button>
                </form>
                {status && <p className="text-sm text-emerald-400">{status}</p>}
              </div>
            )}
          </section>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {wallet && openModal === "deposit" && (
        <ReceiveModal address={wallet.address} onClose={() => setOpenModal(null)} />
      )}
      {wallet && openModal === "withdraw" && (
        <WithdrawModal
          walletControl={wallet.control}
          usdcBalance={balances?.usdc ?? null}
          onClose={closeModalAndRefresh}
        />
      )}
      {wallet && openModal === "swap" && (
        <SwapModal walletControl={wallet.control} holdings={holdings} onClose={closeModalAndRefresh} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#ffffff14] bg-[#18181b73] p-5 backdrop-blur-[28px]">
      <div className="text-xs uppercase tracking-wide text-[#71717a]">{label}</div>
      <div className={`mt-1 font-mono text-xl text-[#fafafa] ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[#71717a]">{sub}</div>}
    </div>
  );
}

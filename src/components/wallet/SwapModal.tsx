"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import type { TokenHolding } from "@/lib/token-holdings";

const SWAP_TOKENS = ["USDC", "EURC", "CIRBTC"] as const;
const TOKEN_LABELS: Record<string, string> = { USDC: "USDC", EURC: "EURC", CIRBTC: "cirBTC" };
const QUICK_PCTS = [30, 50, 80] as const;

type Quote = { estimatedOutput: { token: string; amount: string } } | null;
type Result = { status: string; txHash: string | null; explorerUrl: string | null; amountOut: string | null };

/** A small, testnet-liquidity-friendly default — Circle's own quickstart
 *  example uses 1.00 USDC; thin Arc Testnet liquidity is documented to make
 *  larger amounts more likely to fail with "no route". */
const SUGGESTED_AMOUNT = 1;

function label(symbol: string): string {
  return TOKEN_LABELS[symbol.toUpperCase()] ?? symbol;
}

function holdingFor(holdings: TokenHolding[], symbol: string): TokenHolding | undefined {
  return holdings.find((h) => h.symbol.toUpperCase() === symbol.toUpperCase());
}

function suggestedAmountFor(balance: number): string {
  if (balance <= 0) return "";
  return Math.min(SUGGESTED_AMOUNT, balance).toString();
}

export default function SwapModal({
  onClose,
  walletControl,
  holdings,
}: {
  onClose: () => void;
  walletControl: "developer" | "user";
  holdings: TokenHolding[];
}) {
  const payableTokens = holdings.filter((h) => h.amount > 0).map((h) => h.symbol.toUpperCase());
  const [tokenIn, setTokenIn] = useState<string>(payableTokens[0] ?? "USDC");
  const [tokenOut, setTokenOut] = useState<string>(SWAP_TOKENS.find((t) => t !== payableTokens[0]) ?? "EURC");
  const [amountIn, setAmountIn] = useState(() => suggestedAmountFor(holdingFor(holdings, payableTokens[0])?.amount ?? 0));
  const [quote, setQuote] = useState<Quote>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const available = walletControl === "developer";
  const payBalance = holdingFor(holdings, tokenIn)?.amount ?? 0;
  // Includes the current tokenIn even when its balance is 0 — reachable
  // right after flipping into a token the wallet doesn't hold yet.
  const payTokenOptions = Array.from(new Set([...payableTokens, tokenIn]));

  function updateAmountIn(value: string) {
    setAmountIn(value);
    setQuote(null);
    setErrorReason(null);
  }

  function updateTokenIn(next: string) {
    setTokenIn(next);
    if (next === tokenOut) setTokenOut(SWAP_TOKENS.find((t) => t !== next) ?? tokenOut);
    setQuote(null);
    setErrorReason(null);
  }

  function updateTokenOut(next: string) {
    setTokenOut(next);
    setQuote(null);
    setErrorReason(null);
  }

  function flip() {
    const nextAmountIn = quote ? quote.estimatedOutput.amount : amountIn;
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(nextAmountIn);
    setQuote(null);
    setError(null);
    setErrorReason(null);
  }

  // Stale quotes are cleared eagerly by the input handlers below (setQuote(null)
  // right alongside the input state change) rather than here, so this effect
  // never needs to setState synchronously in its own body — only inside the
  // timer/fetch callbacks, which are genuinely async.
  useEffect(() => {
    if (!available || !amountIn || Number(amountIn) <= 0 || tokenIn === tokenOut) {
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      setQuoting(true);
      setError(null);
      setErrorReason(null);
      fetch("/api/wallet/swap/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIn, tokenOut, amountIn }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (!active) return;
          if (!res.ok) {
            setErrorReason(body.reason ?? null);
            throw new Error(body.error ?? "Failed to get a quote");
          }
          setQuote(body);
        })
        .catch((err) => {
          if (!active) return;
          setQuote(null);
          setError(err instanceof Error ? err.message : "Failed to get a quote");
        })
        .finally(() => {
          if (active) setQuoting(false);
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [available, tokenIn, tokenOut, amountIn]);

  async function confirmSwap() {
    setSubmitting(true);
    setError(null);
    setErrorReason(null);
    try {
      const res = await fetch("/api/wallet/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenIn, tokenOut, amountIn }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorReason(body.reason ?? null);
        throw new Error(body.error ?? "Swap failed");
      }
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!available) {
    return (
      <Modal title="Swap" onClose={onClose}>
        <p className="text-sm text-[#a1a1aa]">
          Swap isn&apos;t available for this wallet yet — same reason as Withdraw: it needs a PIN-confirmation flow
          for user-controlled wallets that hasn&apos;t been built into SnapBack yet.
        </p>
      </Modal>
    );
  }

  if (payableTokens.length === 0) {
    return (
      <Modal title="Swap" onClose={onClose}>
        <p className="text-sm text-[#a1a1aa]">
          No tokens available to swap yet — claim USDC, EURC, or cirBTC from the{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            Arc Testnet faucet
          </a>{" "}
          first.
        </p>
      </Modal>
    );
  }

  if (result) {
    return (
      <Modal title="Swap" onClose={onClose}>
        <div className="space-y-3 text-center">
          <div className={result.status === "released" ? "text-emerald-400" : "text-amber-400"}>
            {result.status === "released" ? "Swap complete" : "Swap submitted"}
          </div>
          {result.amountOut && (
            <div className="text-2xl font-bold text-[#fafafa]">
              {Number(result.amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 })} {label(tokenOut)}
            </div>
          )}
          {result.explorerUrl && (
            <a
              href={result.explorerUrl}
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
    <Modal title="Swap" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-[#3f3f46] bg-[#09090b] p-3">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-[#71717a]">
            <span>Pay with</span>
            <span>Balance: {payBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.000001"
              value={amountIn}
              onChange={(e) => updateAmountIn(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
              className="w-full bg-transparent text-lg text-[#fafafa] outline-none disabled:opacity-60"
            />
            <select
              value={tokenIn}
              onChange={(e) => updateTokenIn(e.target.value)}
              disabled={submitting}
              className="rounded-lg border border-[#3f3f46] bg-[#18181b] px-2 py-1.5 text-sm text-[#fafafa] outline-none disabled:opacity-60"
            >
              {payTokenOptions.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            {QUICK_PCTS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => updateAmountIn(((payBalance * pct) / 100).toString())}
                disabled={submitting || payBalance <= 0}
                className="rounded-md border border-[#3f3f46] px-2 py-1 text-xs text-[#a1a1aa] hover:bg-[#ffffff0a] disabled:opacity-40"
              >
                {pct}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => updateAmountIn(payBalance.toString())}
              disabled={submitting || payBalance <= 0}
              className="rounded-md border border-[#3f3f46] px-2 py-1 text-xs text-[#a1a1aa] hover:bg-[#ffffff0a] disabled:opacity-40"
            >
              Max
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={flip}
            disabled={submitting}
            aria-label="Reverse pay and receive"
            title="Reverse pay and receive"
            className="-my-2 flex h-8 w-8 items-center justify-center rounded-full border border-[#3f3f46] bg-[#18181b] text-[#a1a1aa] hover:bg-[#ffffff0a] hover:text-[#fafafa] disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M6 4v9M6 13l-2.5-2.5M6 13l2.5-2.5M14 16V7M14 7l-2.5 2.5M14 7l2.5 2.5"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="rounded-lg border border-[#3f3f46] bg-[#09090b] p-3">
          <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-[#71717a]">
            <span>Receive</span>
            <span>Balance: {(holdingFor(holdings, tokenOut)?.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full text-lg text-[#fafafa]">
              {quoting ? (
                <span className="text-sm text-[#71717a]">Fetching quote…</span>
              ) : quote ? (
                Number(quote.estimatedOutput.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })
              ) : (
                <span className="text-[#71717a]">0.00</span>
              )}
            </div>
            <select
              value={tokenOut}
              onChange={(e) => updateTokenOut(e.target.value)}
              disabled={submitting}
              className="rounded-lg border border-[#3f3f46] bg-[#18181b] px-2 py-1.5 text-sm text-[#fafafa] outline-none disabled:opacity-60"
            >
              {SWAP_TOKENS.filter((t) => t !== tokenIn).map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            {errorReason === "no_route" && (
              <button
                type="button"
                onClick={() => updateAmountIn(suggestedAmountFor(payBalance))}
                disabled={payBalance <= 0}
                className="text-xs text-emerald-400 hover:underline disabled:opacity-40"
              >
                Try {label(tokenIn)} {suggestedAmountFor(payBalance) || SUGGESTED_AMOUNT}
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={confirmSwap}
          disabled={submitting || !quote || quoting}
          className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {submitting ? "Swapping…" : "Swap"}
        </button>
      </div>
    </Modal>
  );
}

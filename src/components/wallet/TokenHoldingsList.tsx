import type { TokenHolding } from "@/lib/token-holdings";
import { shortAddress } from "@/lib/format";

/** Presentational — data is fetched once by the wallet page and shared with
 *  the Total Wallet Balance stat and the Swap modal, so this just renders. */
export default function TokenHoldingsList({
  holdings,
  loading,
}: {
  holdings: TokenHolding[];
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-[#ffffff14] bg-[#18181b73] backdrop-blur-[28px]">
      <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
        Token holdings
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-[#a1a1aa]">Loading…</div>
      ) : holdings.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#a1a1aa]">
          No tokens held yet — use Deposit or the{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            Arc Testnet faucet
          </a>{" "}
          to get started.
        </div>
      ) : (
        <div className={`divide-y divide-[#ffffff14] ${holdings.length > 10 ? "max-h-[420px] overflow-y-auto" : ""}`}>
          {holdings.map((h) => (
            <div key={`${h.symbol}-${h.tokenAddress ?? "native"}`} className="flex items-center justify-between px-6 py-3">
              <div>
                <div className="font-semibold text-[#fafafa]">{h.symbol}</div>
                <div className="text-xs text-[#71717a]">
                  {h.name}
                  {h.tokenAddress && <span className="ml-1 font-mono">· {shortAddress(h.tokenAddress)}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-[#fafafa]">
                  {h.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </div>
                <div className="text-xs text-[#71717a]">
                  {h.isApproximateUsd ? "≈" : "$"}
                  {h.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

import type { TokenHolding } from "@/lib/token-holdings";
import { shortAddress } from "@/lib/format";

const ROW_HEIGHT_PX = 60;

/** Presentational — data is fetched once by the wallet page and shared with
 *  the Total Wallet Balance stat and the Swap modal, so this just renders.
 *  Sorted by USD value, tallest holdings first; once there are more than
 *  `maxVisible`, the list becomes scrollable instead of growing forever. */
export default function TokenHoldingsList({
  holdings,
  loading,
  maxVisible = 5,
}: {
  holdings: TokenHolding[];
  loading: boolean;
  maxVisible?: number;
}) {
  const sorted = [...holdings].sort((a, b) => b.usdValue - a.usdValue);

  return (
    <section className="flex h-full flex-col rounded-xl border border-[#ffffff14] bg-[#18181b73] backdrop-blur-[28px]">
      <div className="border-b border-[#ffffff14] px-6 py-4 text-xs uppercase tracking-wide text-[#71717a]">
        Token holdings
      </div>
      {loading ? (
        <div className="p-8 text-center text-sm text-[#a1a1aa]">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="p-8 text-center text-sm text-[#a1a1aa]">
          No tokens held yet — use Deposit or the{" "}
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            Arc Testnet faucet
          </a>{" "}
          to get started.
        </div>
      ) : (
        <div
          className={`divide-y divide-[#ffffff14] ${sorted.length > maxVisible ? "overflow-y-auto" : ""}`}
          style={sorted.length > maxVisible ? { maxHeight: `${ROW_HEIGHT_PX * maxVisible}px` } : undefined}
        >
          {sorted.map((h) => (
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

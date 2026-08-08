import "server-only";
import type { Address } from "viem";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { getUsdcBalance, getEurcBalance, getCirbtcBalance } from "@/lib/viem";
import { ARC_USDC_ADDRESS, ARC_EURC_ADDRESS, ARC_CIRBTC_ADDRESS } from "@/lib/arc";
import { estimateWalletSwap } from "@/lib/swap-kit";
import type { WalletRow } from "@/lib/supabase/types";

/**
 * Real per-wallet token holdings. Primary source is Circle's own balance
 * indexer (getWalletTokenBalance). NOTE — investigated live (see /wallet
 * follow-up, item 2): this indexer currently 404s ("Cannot find target
 * wallet in the system", code 156001) for every developer-controlled Arc
 * Testnet wallet tested, on this endpoint specifically, even though the
 * same wallet/client works for every other Circle API call this app makes.
 * That looks like a real gap in Circle's Arc Testnet balances coverage, not
 * something fixable here — so the RPC fallback below is, in practice, the
 * live path today. It reads USDC/EURC/cirBTC directly, the same pattern
 * already proven for USDC, rather than depending on the indexer at all.
 * Diagnostic logging is kept in place (tagged [token-holdings]) since the
 * indexer could start working without warning.
 */

export type TokenHolding = {
  symbol: string;
  name: string;
  tokenAddress: string | null;
  amount: number;
  usdValue: number;
  isApproximateUsd: boolean;
};

type RpcTokenSpec = {
  symbol: string;
  name: string;
  address: string;
  getBalance: (address: Address) => Promise<{ formatted: string }>;
};

const RPC_TOKENS: RpcTokenSpec[] = [
  { symbol: "USDC", name: "USD Coin", address: ARC_USDC_ADDRESS, getBalance: getUsdcBalance },
  { symbol: "EURC", name: "Euro Coin", address: ARC_EURC_ADDRESS, getBalance: getEurcBalance },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: ARC_CIRBTC_ADDRESS, getBalance: getCirbtcBalance },
];

/**
 * USD value for one holding. USDC is exact by definition. Everything else
 * tries a real live swap quote into USDC first (cheap — estimateWalletSwap
 * is the same call the Swap modal already makes) rather than assuming 1:1,
 * because 1:1 would be a rough approximation for EURC but wildly, obviously
 * wrong for cirBTC (Bitcoin priced as if it were a dollar). Only falls back
 * to the flat 1:1 placeholder — clearly flagged approximate — when a real
 * quote genuinely isn't available (no swap capability for this wallet type,
 * or thin testnet liquidity for the amount).
 */
async function priceHolding(
  wallet: WalletRow,
  symbol: string,
  amount: number,
): Promise<{ usdValue: number; isApproximateUsd: boolean }> {
  if (symbol.toUpperCase() === "USDC") return { usdValue: amount, isApproximateUsd: false };
  if (wallet.control === "developer" && amount > 0) {
    try {
      const quote = await estimateWalletSwap({
        walletAddress: wallet.address,
        tokenIn: symbol,
        tokenOut: "USDC",
        amountIn: amount.toString(),
      });
      return { usdValue: Number(quote.estimatedOutput.amount), isApproximateUsd: false };
    } catch {
      // Thin testnet liquidity / no route for this amount — fall through.
    }
  }
  return { usdValue: amount, isApproximateUsd: true };
}

export async function getTokenHoldings(wallet: WalletRow): Promise<TokenHolding[]> {
  if (wallet.control === "developer") {
    try {
      const client = getDeveloperControlledWalletsClient();
      const res = await client.getWalletTokenBalance({ id: wallet.circle_wallet_id, includeAll: true });
      const balances = res.data?.tokenBalances ?? [];
      console.log(
        `[token-holdings] wallet=${wallet.id} circle_wallet_id=${wallet.circle_wallet_id} raw tokenBalances=`,
        JSON.stringify(balances),
      );
      if (balances.length > 0) {
        const holdings = await Promise.all(
          balances
            .filter((b) => Number(b.amount) > 0)
            .map(async (b) => {
              const symbol = b.token.symbol ?? b.token.name ?? "Unknown";
              const amount = Number(b.amount);
              const priced = await priceHolding(wallet, symbol, amount);
              return {
                symbol,
                name: b.token.name ?? symbol,
                tokenAddress: b.token.tokenAddress ?? null,
                amount,
                ...priced,
              };
            }),
        );
        console.log(
          `[token-holdings] wallet=${wallet.id} indexer path used, ${balances.length} raw -> ${holdings.length} after amount>0 filter:`,
          holdings.map((h) => `${h.symbol}=${h.amount}`).join(", ") || "(none)",
        );
        return holdings;
      }
      console.log(`[token-holdings] wallet=${wallet.id} indexer returned an empty tokenBalances array — falling back to RPC`);
    } catch (err) {
      console.error(`[token-holdings] wallet=${wallet.id} getWalletTokenBalance threw — falling back to RPC:`, err);
    }
  }

  const rpcBalances = await Promise.all(
    RPC_TOKENS.map(async (t) => ({ ...t, amount: Number((await t.getBalance(wallet.address as Address)).formatted) })),
  );
  const nonZero = rpcBalances.filter((t) => t.amount > 0);
  console.log(
    `[token-holdings] wallet=${wallet.id} RPC fallback path used:`,
    nonZero.map((t) => `${t.symbol}=${t.amount}`).join(", ") || "(none)",
  );

  return Promise.all(
    nonZero.map(async (t) => {
      const priced = await priceHolding(wallet, t.symbol, t.amount);
      return { symbol: t.symbol, name: t.name, tokenAddress: t.address, amount: t.amount, ...priced };
    }),
  );
}

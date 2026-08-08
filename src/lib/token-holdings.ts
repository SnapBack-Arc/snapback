import "server-only";
import type { Address } from "viem";
import { getDeveloperControlledWalletsClient } from "@/lib/circle";
import { getUsdcBalance } from "@/lib/viem";
import { ARC_USDC_ADDRESS } from "@/lib/arc";
import type { WalletRow } from "@/lib/supabase/types";

/**
 * Real per-wallet token holdings. Primary source is Circle's own balance
 * indexer (getWalletTokenBalance) — it reports whatever real tokens Circle
 * has actually detected at this address, so it organically picks up EURC or
 * cirBTC once a wallet holds them, with no hardcoded token list on our side.
 * Falls back to the direct RPC USDC read (same one the wallet page already
 * uses) when the indexer call fails or comes back empty — also the only
 * path available for user-controlled wallets, since querying their balance
 * via the indexer needs a fresh userToken this server never holds.
 */

export type TokenHolding = {
  symbol: string;
  name: string;
  tokenAddress: string | null;
  amount: number;
  /** Flat 1:1 USDC-equivalent placeholder — exact only for USDC itself. */
  usdValue: number;
  isApproximateUsd: boolean;
};

export async function getTokenHoldings(wallet: WalletRow): Promise<TokenHolding[]> {
  if (wallet.control === "developer") {
    try {
      const client = getDeveloperControlledWalletsClient();
      const res = await client.getWalletTokenBalance({ id: wallet.circle_wallet_id, includeAll: true });
      const balances = res.data?.tokenBalances ?? [];
      // TEMPORARY diagnostic logging (see /wallet investigation, item 2) —
      // logs the indexer's raw response before any filtering, so a genuine
      // "Circle knows about EURC/cirBTC but reports amount 0" or "Circle's
      // Arc indexer simply hasn't caught up" can be told apart from a bug
      // in the filter/mapping below. Remove once the real cause is found.
      console.log(
        `[token-holdings] wallet=${wallet.id} circle_wallet_id=${wallet.circle_wallet_id} raw tokenBalances=`,
        JSON.stringify(balances),
      );
      if (balances.length > 0) {
        const holdings = balances
          .filter((b) => Number(b.amount) > 0)
          .map((b) => {
            const symbol = b.token.symbol ?? b.token.name ?? "Unknown";
            const amount = Number(b.amount);
            const isUsdc = symbol.toUpperCase() === "USDC";
            return {
              symbol,
              name: b.token.name ?? symbol,
              tokenAddress: b.token.tokenAddress ?? null,
              amount,
              usdValue: amount,
              isApproximateUsd: !isUsdc,
            };
          });
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

  const usdc = await getUsdcBalance(wallet.address as Address);
  const amount = Number(usdc.formatted);
  console.log(`[token-holdings] wallet=${wallet.id} RPC fallback path used, USDC amount=${amount}`);
  if (amount <= 0) return [];
  return [
    {
      symbol: "USDC",
      name: "USD Coin",
      tokenAddress: ARC_USDC_ADDRESS,
      amount,
      usdValue: amount,
      isApproximateUsd: false,
    },
  ];
}

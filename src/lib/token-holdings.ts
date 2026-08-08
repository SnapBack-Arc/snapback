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
      if (balances.length > 0) {
        return balances
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
      }
    } catch {
      // Indexer unavailable — fall through to the RPC fallback below.
    }
  }

  const usdc = await getUsdcBalance(wallet.address as Address);
  const amount = Number(usdc.formatted);
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

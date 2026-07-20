/**
 * Base mainnet — real chain, used only by the `parallel_payer` wallet
 * (lib/app-wallets.ts) to pay Parallel's x402 endpoint in real USDC. Every
 * other chain constant in this app (lib/arc.ts) is Arc Testnet; this file
 * exists so the one real-money path doesn't borrow a testnet explorer link.
 */

export const BASE_CHAIN_ID = 8453;

export const BASE_EXPLORER_URL = "https://basescan.org";

/** Build a block-explorer link for a transaction hash on real Base mainnet. */
export function baseExplorerTxUrl(hash: string): string {
  return `${BASE_EXPLORER_URL}/tx/${hash}`;
}

import "server-only";
import { AppKit, type SwapEstimate, type SwapResult } from "@circle-fin/app-kit";
import { createCircleWalletsAdapter, type CircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import { requireServerEnv } from "@/lib/env";

/**
 * Real same-chain swap between real Arc Testnet assets (USDC/EURC/cirBTC),
 * via Circle's App Kit — same shape as the rest of this app's Circle
 * integration: server-side only, authenticated with the same
 * CIRCLE_API_KEY/CIRCLE_ENTITY_SECRET already used by
 * getDeveloperControlledWalletsClient() (see lib/circle.ts). Only usable for
 * developer-controlled wallets — the adapter signs with the entity secret,
 * which a user-controlled wallet's own PIN must authorize instead (not
 * wired up yet, see /api/wallet/withdraw's same gating for why).
 *
 * CIRCLE_KIT_KEY is optional — the SDK's documented "permissionless mode"
 * (no key) works today with the credentials this app already has; a Kit Key
 * only raises rate limits / adds partner attribution, set it if one exists.
 */

const ARC_TESTNET_SWAP_CHAIN = "Arc_Testnet" as const;

let kit: AppKit | null = null;
let adapter: CircleWalletsAdapter | null = null;

function getKit(): AppKit {
  if (!kit) kit = new AppKit();
  return kit;
}

function getAdapter(): CircleWalletsAdapter {
  if (!adapter) {
    adapter = createCircleWalletsAdapter({
      apiKey: requireServerEnv("CIRCLE_API_KEY"),
      entitySecret: requireServerEnv("CIRCLE_ENTITY_SECRET"),
    });
  }
  return adapter;
}

function swapConfig(): { kitKey: string } | undefined {
  const kitKey = process.env.CIRCLE_KIT_KEY;
  return kitKey ? { kitKey } : undefined;
}

/** SDK token aliases are upper-case ('USDC', 'EURC', 'CIRBTC') — this holds
 *  for every asset this app deals with, so a plain uppercase is enough,
 *  regardless of how a symbol is cased when displayed (e.g. "cirBTC"). */
export function toSwapTokenAlias(symbol: string): string {
  return symbol.toUpperCase();
}

export type WalletSwapParams = {
  walletAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
};

function swapParams(params: WalletSwapParams) {
  return {
    from: { adapter: getAdapter(), chain: ARC_TESTNET_SWAP_CHAIN, address: params.walletAddress },
    tokenIn: toSwapTokenAlias(params.tokenIn),
    tokenOut: toSwapTokenAlias(params.tokenOut),
    amountIn: params.amountIn,
    config: swapConfig(),
  };
}

export async function estimateWalletSwap(params: WalletSwapParams): Promise<SwapEstimate> {
  return getKit().estimateSwap(swapParams(params));
}

export async function executeWalletSwap(params: WalletSwapParams): Promise<SwapResult> {
  return getKit().swap(swapParams(params));
}

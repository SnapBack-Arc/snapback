import { createPublicClient, http, formatUnits, type Address } from "viem";
import {
  arcTestnet,
  erc20Abi,
  ARC_USDC_ADDRESS,
  ARC_EURC_ADDRESS,
  ARC_CIRBTC_ADDRESS,
  ARC_NATIVE_DECIMALS,
  USDC_DECIMALS,
  EURC_DECIMALS,
  CIRBTC_DECIMALS,
} from "@/lib/arc";

/** Shared read-only client for Arc Testnet. */
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

/**
 * Native gas balance (USDC-as-gas, 18 decimals). Returns { raw, formatted }.
 * Do not confuse with the ERC-20 USDC balance below.
 */
export async function getNativeBalance(address: Address) {
  const raw = await publicClient.getBalance({ address });
  return { raw, formatted: formatUnits(raw, ARC_NATIVE_DECIMALS) };
}

async function getErc20Balance(tokenAddress: Address, decimals: number, account: Address) {
  const raw = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  return { raw, formatted: formatUnits(raw, decimals) };
}

/**
 * ERC-20 USDC balance via the 0x3600… interface (6 decimals).
 * This is the spendable USDC used for payments, distinct from gas.
 */
export async function getUsdcBalance(address: Address) {
  return getErc20Balance(ARC_USDC_ADDRESS, USDC_DECIMALS, address);
}

/** ERC-20 EURC balance (6 decimals) — see ARC_EURC_ADDRESS for provenance. */
export async function getEurcBalance(address: Address) {
  return getErc20Balance(ARC_EURC_ADDRESS, EURC_DECIMALS, address);
}

/** ERC-20 cirBTC balance (8 decimals) — see ARC_CIRBTC_ADDRESS for provenance. */
export async function getCirbtcBalance(address: Address) {
  return getErc20Balance(ARC_CIRBTC_ADDRESS, CIRBTC_DECIMALS, address);
}

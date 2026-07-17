import { createPublicClient, http, formatUnits, type Address } from "viem";
import {
  arcTestnet,
  erc20Abi,
  ARC_USDC_ADDRESS,
  ARC_NATIVE_DECIMALS,
  USDC_DECIMALS,
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

/**
 * ERC-20 USDC balance via the 0x3600… interface (6 decimals).
 * This is the spendable USDC used for payments, distinct from gas.
 */
export async function getUsdcBalance(address: Address) {
  const raw = await publicClient.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return { raw, formatted: formatUnits(raw, USDC_DECIMALS) };
}

/** ERC-20 USDC allowance granted by `owner` to `spender` (6 decimals). */
export async function getUsdcAllowance(owner: Address, spender: Address) {
  const raw = await publicClient.readContract({
    address: ARC_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  return { raw, formatted: formatUnits(raw, USDC_DECIMALS) };
}
